import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { normalizeCandidate, type Candidate } from "./journey-filter.js";
import { createMotisDataSource, TransitDataSourceError, type TransitRequestFailure } from "./transit-data-source.js";
import { createIntBahnDataSource } from "./int-bahn-data-source.js";
import { createTransitRequestQueue } from "./transit-request-queue.js";
import { eventPhrase } from "./event-phrases.js";
import { createHistoryDataSource, type TrainHistory } from "./history-data-source.js";
import { applyHistoryRatings } from "./history-ratings.js";
import { countEventsByCategory, filterEventsByJourneyPaths, parseConstructionJson, parseDisruptionsJson, parseFootballJson, type MapEvent } from "./map-events.js";

const port = config.port;
const databasePath = config.databasePath;
const app = Fastify({
  logger: true,
  disableRequestLogging: true,
  bodyLimit: config.requestBodyLimitBytes,
});
app.addHook("onResponse", async (request, reply) => {
  if (request.url?.split("?", 1)[0] === "/health") return;
  const statusCode = reply.statusCode;
  const log = statusCode >= 500 ? request.log.error : statusCode >= 400 ? request.log.warn : request.log.info;
  log.call(request.log, { method: request.method, url: request.url, statusCode }, "Request completed");
});
const transitUserAgent = "42SommerfestTrainBet/0.1";
const berlinDefaultSchedule = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const opening = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) + 1));
  const date = (value: Date) => `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  const time = (value: Date) => `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  return { eventDate: date(opening), opening: time(opening), closing: time(new Date(opening.getTime() + 60 * 60 * 1000)) };
};
const logTransitFailure = (failure: TransitRequestFailure) => {
  const log = failure.kind === "http" && !failure.final ? app.log.warn : app.log.error;
  log.call(app.log, { ...failure, responseBody: failure.responseBody }, "Transit provider request failed");
};
const transitRequestQueue = createTransitRequestQueue({ delayMs: config.transitRequestDelayMs });
const motisDataSource = createMotisDataSource({
  baseUrl: config.motisBaseUrl,
  cacheTtlSeconds: config.cacheTtlSeconds,
  userAgent: transitUserAgent,
  requestQueue: transitRequestQueue,
  maxRetries: config.transitMaxRetries,
  logFailure: logTransitFailure,
});
const intBahnDataSource = createIntBahnDataSource({
  baseUrl: config.intBahnBaseUrl,
  cacheTtlSeconds: config.cacheTtlSeconds,
  userAgent: transitUserAgent,
  requestQueue: transitRequestQueue,
  maxRetries: config.transitMaxRetries,
  logFailure: logTransitFailure,
});
const historyDataSource = createHistoryDataSource({
  baseUrl: config.historyServiceBaseUrl,
  timeoutMs: config.historyServiceTimeoutMs,
  cacheTtlSeconds: config.historyServiceCacheTtlSeconds,
  logRequest: (event) => {
    const log = event.outcome === "success" || event.outcome === "not_found" ? app.log.info : app.log.warn;
    log.call(app.log, event, "Trips History API request");
  },
});
const transitDataSource = config.transitProvider === "int-bahn" ? intBahnDataSource : motisDataSource;
mkdirSync(dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.exec(`
  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    game_id TEXT,
    username TEXT NOT NULL COLLATE NOCASE,
    created_at TEXT NOT NULL,
    UNIQUE (game_id, username)
  );
  CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    game_id TEXT,
    participant_id TEXT NOT NULL REFERENCES participants(id),
    train_id TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    UNIQUE (game_id, participant_id)
  );
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    event_date TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
    betting_start TEXT NOT NULL DEFAULT '17:00',
    betting_end TEXT NOT NULL DEFAULT '18:00',
    journey_departure_start TEXT NOT NULL DEFAULT '17:00',
    journey_departure_end TEXT NOT NULL DEFAULT '17:30',
    calculated_game_end_time TEXT,
    stop_ids_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'open', 'closed', 'finished')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    activated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS game_journeys (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id),
    external_trip_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    line_name TEXT,
    train_number TEXT,
    history_json TEXT,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    scheduled_departure TEXT NOT NULL,
    scheduled_arrival TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    stop_count INTEGER,
    origin_stop_id TEXT,
    realtime INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'candidate',
    included INTEGER NOT NULL DEFAULT 0,
    exclusion_reason TEXT,
    route_json TEXT,
    geometry TEXT,
    actual_arrival TEXT,
    delay_seconds INTEGER,
    current_delay_minutes INTEGER,
    departure_delay_minutes INTEGER,
    race_delay_minutes INTEGER,
    final_delay_minutes INTEGER,
    race_color TEXT,
    delay_gain_band TEXT NOT NULL DEFAULT 'none',
    live_status TEXT NOT NULL DEFAULT 'waiting',
    last_live_update TEXT,
    live_error TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (game_id, external_trip_id)
  );
  CREATE TABLE IF NOT EXISTS game_events (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id),
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    dedupe_key TEXT
  );
  CREATE TABLE IF NOT EXISTS game_map_events (
    id TEXT NOT NULL,
    game_id TEXT NOT NULL REFERENCES games(id),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    severity TEXT NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY (game_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_game_journeys_game_id ON game_journeys(game_id);
  CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id);
  CREATE INDEX IF NOT EXISTS idx_game_map_events_game_id ON game_map_events(game_id);
  CREATE TABLE IF NOT EXISTS journey_delay_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL REFERENCES games(id),
    journey_id TEXT NOT NULL REFERENCES game_journeys(id),
    delay_minutes INTEGER NOT NULL,
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_delay_snapshots_lookup ON journey_delay_snapshots(game_id, journey_id, recorded_at);
`);

const columns = (table: string) => new Set(
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name),
);
if (!columns("game_events").has("dedupe_key")) db.exec("ALTER TABLE game_events ADD COLUMN dedupe_key TEXT");
if (!columns("game_journeys").has("delay_gain_band")) db.exec("ALTER TABLE game_journeys ADD COLUMN delay_gain_band TEXT NOT NULL DEFAULT 'none'");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_game_events_dedupe_key ON game_events(game_id, dedupe_key) WHERE dedupe_key IS NOT NULL");

const addLiveEvent = (gameId: string, type: string, payload: Record<string, unknown>, dedupeKey: string, createdAt: string) => {
  db.prepare(`INSERT OR IGNORE INTO game_events (id, game_id, type, payload_json, created_at, dedupe_key) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), gameId, type, JSON.stringify(payload), createdAt, dedupeKey);
};

const participantIndexes = db.prepare("PRAGMA index_list(participants)").all() as Array<{ name: string; unique: number }>;
const indexColumns = (indexName: string) => (db.prepare(`PRAGMA index_info(${indexName})`).all() as Array<{ name: string | null }>).map((column) => column.name).join(",");
const hasPerGameUsernameIndex = participantIndexes.some((index) => index.unique === 1 && indexColumns(index.name) === "game_id,username");
const betIndexes = db.prepare("PRAGMA index_list(bets)").all() as Array<{ name: string; unique: number }>;
const hasPerGameBetIndex = betIndexes.some((index) => index.unique === 1 && indexColumns(index.name) === "game_id,participant_id");
if (!hasPerGameUsernameIndex) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    ALTER TABLE participants RENAME TO participants_legacy;
    CREATE TABLE participants (
      id TEXT PRIMARY KEY,
      game_id TEXT,
      username TEXT NOT NULL COLLATE NOCASE,
      created_at TEXT NOT NULL,
      UNIQUE (game_id, username)
    );
    INSERT INTO participants (id, game_id, username, created_at)
      SELECT id, game_id, username, created_at FROM participants_legacy;
    ALTER TABLE bets RENAME TO bets_legacy;
    CREATE TABLE bets (
      id TEXT PRIMARY KEY,
      game_id TEXT,
      participant_id TEXT NOT NULL REFERENCES participants(id),
      train_id TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      UNIQUE (game_id, participant_id)
    );
    INSERT INTO bets (id, game_id, participant_id, train_id, submitted_at)
      SELECT id, game_id, participant_id, train_id, submitted_at FROM bets_legacy;
    DROP TABLE bets_legacy;
    DROP TABLE participants_legacy;
    PRAGMA foreign_keys = ON;
  `);
}
if (hasPerGameUsernameIndex && !hasPerGameBetIndex) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    ALTER TABLE bets RENAME TO bets_legacy;
    CREATE TABLE bets (
      id TEXT PRIMARY KEY,
      game_id TEXT,
      participant_id TEXT NOT NULL REFERENCES participants(id),
      train_id TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      UNIQUE (game_id, participant_id)
    );
    INSERT INTO bets (id, game_id, participant_id, train_id, submitted_at)
      SELECT id, game_id, participant_id, train_id, submitted_at FROM bets_legacy;
    DROP TABLE bets_legacy;
    PRAGMA foreign_keys = ON;
  `);
}

if (!columns("participants").has("game_id")) {
  db.exec("ALTER TABLE participants ADD COLUMN game_id TEXT REFERENCES games(id)");
}
if (!columns("bets").has("game_id")) {
  db.exec("ALTER TABLE bets ADD COLUMN game_id TEXT REFERENCES games(id)");
}
if (!columns("games").has("stop_ids_json")) {
  db.exec("ALTER TABLE games ADD COLUMN stop_ids_json TEXT NOT NULL DEFAULT '[]'");
}
if (columns("games").has("game_end_time") && !columns("games").has("calculated_game_end_time")) {
  db.exec("ALTER TABLE games ADD COLUMN calculated_game_end_time TEXT");
}
if (!columns("games").has("calculated_game_end_time")) db.exec("ALTER TABLE games ADD COLUMN calculated_game_end_time TEXT");
if (columns("games").has("game_end_time")) {
  db.exec("UPDATE games SET calculated_game_end_time = game_end_time WHERE calculated_game_end_time IS NULL");
  db.exec("ALTER TABLE games DROP COLUMN game_end_time");
}
if (!columns("game_journeys").has("actual_arrival")) db.exec("ALTER TABLE game_journeys ADD COLUMN actual_arrival TEXT");
if (!columns("game_journeys").has("delay_seconds")) db.exec("ALTER TABLE game_journeys ADD COLUMN delay_seconds INTEGER");
if (!columns("game_journeys").has("stop_count")) db.exec("ALTER TABLE game_journeys ADD COLUMN stop_count INTEGER");
if (!columns("game_journeys").has("actual_departure")) db.exec("ALTER TABLE game_journeys ADD COLUMN actual_departure TEXT");
if (!columns("game_journeys").has("departure_delay_seconds")) db.exec("ALTER TABLE game_journeys ADD COLUMN departure_delay_seconds INTEGER");
if (!columns("game_journeys").has("current_delay_minutes")) db.exec("ALTER TABLE game_journeys ADD COLUMN current_delay_minutes INTEGER");
if (!columns("game_journeys").has("departure_delay_minutes")) db.exec("ALTER TABLE game_journeys ADD COLUMN departure_delay_minutes INTEGER");
if (!columns("game_journeys").has("race_delay_minutes")) db.exec("ALTER TABLE game_journeys ADD COLUMN race_delay_minutes INTEGER");
if (!columns("game_journeys").has("final_delay_minutes")) db.exec("ALTER TABLE game_journeys ADD COLUMN final_delay_minutes INTEGER");
if (!columns("game_journeys").has("race_color")) db.exec("ALTER TABLE game_journeys ADD COLUMN race_color TEXT");
if (!columns("game_journeys").has("live_status")) db.exec("ALTER TABLE game_journeys ADD COLUMN live_status TEXT NOT NULL DEFAULT 'waiting'");
if (!columns("game_journeys").has("last_live_update")) db.exec("ALTER TABLE game_journeys ADD COLUMN last_live_update TEXT");
if (!columns("game_journeys").has("live_error")) db.exec("ALTER TABLE game_journeys ADD COLUMN live_error TEXT");
if (!columns("game_journeys").has("line_name")) db.exec("ALTER TABLE game_journeys ADD COLUMN line_name TEXT");
if (!columns("game_journeys").has("train_number")) db.exec("ALTER TABLE game_journeys ADD COLUMN train_number TEXT");
if (!columns("game_journeys").has("history_json")) db.exec("ALTER TABLE game_journeys ADD COLUMN history_json TEXT");
  const persistedRacePalette = ["#347DE0", "#F75056", "#F97316", "#FFBB00", "#0F9663", "#E664E6", "#8B5CF6", "#30D1B9", "#408335", "#DD2222", "#0891B2", "#C026D3", "#65A30D", "#DB2777", "#4F46E5", "#EA580C", "#0E7490", "#A21CAF", "#15803D", "#6B7280", "#BE123C", "#4338CA", "#0F766E", "#7C3AED"];
const missingRaceColors = db.prepare("SELECT id, game_id AS gameId, external_trip_id AS externalTripId FROM game_journeys WHERE race_color IS NULL ORDER BY game_id, created_at, id").all() as Array<{ id: string; gameId: string; externalTripId: string }>;
const existingRaceColors = db.prepare("SELECT game_id AS gameId, race_color AS raceColor FROM game_journeys WHERE race_color IS NOT NULL").all() as Array<{ gameId: string; raceColor: string }>;
const usedRaceColorsByGame = new Map<string, Set<string>>();
for (const row of existingRaceColors) {
  const colorsForGame = usedRaceColorsByGame.get(row.gameId) ?? new Set<string>();
  colorsForGame.add(row.raceColor);
  usedRaceColorsByGame.set(row.gameId, colorsForGame);
}
const backfillRaceColor = db.prepare("UPDATE game_journeys SET race_color = ? WHERE id = ?");
for (const row of missingRaceColors) {
  const used = usedRaceColorsByGame.get(row.gameId) ?? new Set<string>();
  const paletteColor = persistedRacePalette.find((color) => !used.has(color));
  let color = paletteColor;
  if (!color) {
    let hash = 0;
    for (const character of row.externalTripId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    color = `hsl(${hash % 360} 72% 48%)`;
  }
  used.add(color);
  usedRaceColorsByGame.set(row.gameId, used);
  backfillRaceColor.run(color, row.id);
}
db.exec("CREATE INDEX IF NOT EXISTS idx_participants_game_id ON participants(game_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_bets_game_id ON bets(game_id)");
db.exec(`UPDATE participants SET game_id = (SELECT id FROM games WHERE status = 'active' LIMIT 1) WHERE game_id IS NULL`);
db.exec(`UPDATE bets SET game_id = (SELECT id FROM participants WHERE participants.id = bets.participant_id) WHERE game_id IS NULL`);

await app.register(cors, { origin: true, credentials: true });
await app.register(cookie, { secret: config.sessionSecret });

const hasAdminAccess = (request: { headers: { authorization?: string } }): boolean => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return false;

  const provided = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(config.adminToken, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
};

const requireAdmin = (request: { headers: { authorization?: string } }, reply: { code: (status: number) => { send: (body: unknown) => unknown } }): boolean => {
  if (!request.headers.authorization) {
    reply.code(401).send({ error: "ADMIN_AUTH_REQUIRED" });
    return false;
  }
  if (!hasAdminAccess(request)) {
    reply.code(403).send({ error: "ADMIN_AUTH_INVALID" });
    return false;
  }
  return true;
};

const fetchGameJourneys = async (gameId: string, stopIds: string[], startTime: string, endTime: string) => {
  const fetchedAt = new Date().toISOString();
  const stationResults = await Promise.allSettled(
    stopIds.map((stopId) => transitDataSource.getStationDepartures(stopId, startTime, endTime)),
  );
  const candidates = new Map<string, Candidate>();
  const stationErrors: string[] = [];
  let stale = false;

  stationResults.forEach((result, index) => {
    if (result.status === "rejected") {
      stationErrors.push(`${stopIds[index]}: ${result.reason instanceof Error ? result.reason.message : "request failed"}`);
      return;
    }
    stale ||= result.value.stale;
    for (const stopTime of result.value.stopTimes) {
      const candidate = normalizeCandidate(stopTime, stopIds[index], startTime, endTime);
      if (candidate) {
        const previous = candidates.get(candidate.externalTripId);
        if (!previous || (previous.status === "excluded" && candidate.status === "candidate")) {
          candidates.set(candidate.externalTripId, candidate);
        }
      }
    }
  });

  const rows = [...candidates.values()];
  const eligibleRows = rows.filter((row) => row.status === "candidate");
  const historyByTripId = new Map<string, TrainHistory | null>();
  await Promise.all(eligibleRows.map(async (row) => {
    if (!row.lineName || !row.trainNumber) {
      app.log.warn({ externalTripId: row.externalTripId, displayName: row.displayName, lineName: row.lineName, trainNumber: row.trainNumber }, "Trips History lookup skipped: missing train identifiers");
      historyByTripId.set(row.externalTripId, null);
      return;
    }
    historyByTripId.set(row.externalTripId, await historyDataSource.getLineHistory(row.lineName, row.trainNumber));
  }));
  const ratedHistories = applyHistoryRatings(eligibleRows.map((row) => historyByTripId.get(row.externalTripId) ?? null), eligibleRows.map((row) => row.durationSeconds));
  const ratedHistoryByTripId = new Map(eligibleRows.map((row, index) => [row.externalTripId, ratedHistories[index]]));
  const previousColors = new Map((db.prepare("SELECT external_trip_id AS externalTripId, race_color AS raceColor FROM game_journeys WHERE game_id = ? AND race_color IS NOT NULL").all(gameId) as Array<{ externalTripId: string; raceColor: string }>).map((row) => [row.externalTripId, row.raceColor]));
  const raceColors = ["#347DE0", "#F75056", "#F97316", "#FFBB00", "#0F9663", "#E664E6", "#8B5CF6", "#30D1B9", "#408335", "#DD2222", "#0891B2", "#C026D3", "#65A30D", "#DB2777", "#4F46E5", "#EA580C", "#0E7490", "#A21CAF", "#15803D", "#6B7280", "#BE123C", "#4338CA", "#0F766E", "#7C3AED"];
  const usedColors = new Set(previousColors.values());
  const colorForRow = (externalTripId: string) => {
    const previous = previousColors.get(externalTripId);
    if (previous) return previous;
    const available = raceColors.find((color) => !usedColors.has(color));
    if (available) { usedColors.add(available); return available; }
    let hash = 0;
    for (const character of externalTripId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    const hue = hash % 360;
    return `hsl(${hue} 72% 48%)`;
  };
  const insert = db.prepare(`
    INSERT OR REPLACE INTO game_journeys (
      id, game_id, external_trip_id, display_name, origin, destination,
      line_name, train_number, history_json,
      scheduled_departure, scheduled_arrival, duration_seconds, origin_stop_id,
      stop_count, realtime, status, included, exclusion_reason, route_json, race_color, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `);
  const save = db.transaction(() => {
    db.prepare("DELETE FROM game_journeys WHERE game_id = ?").run(gameId);
    for (const row of rows) {
      insert.run(
        crypto.randomUUID(), gameId, row.externalTripId, row.displayName, row.origin,
        row.destination, row.lineName, row.trainNumber, ratedHistoryByTripId.has(row.externalTripId) ? JSON.stringify(ratedHistoryByTripId.get(row.externalTripId)) : null, row.scheduledDeparture, row.scheduledArrival, row.durationSeconds,
        row.originStopId, row.stopCount, row.realtime ? 1 : 0, row.status, row.exclusionReason, row.routeJson, colorForRow(row.externalTripId), fetchedAt,
      );
    }
    db.prepare("UPDATE games SET updated_at = ? WHERE id = ?").run(fetchedAt, gameId);
    db.prepare(`INSERT INTO game_events (id, game_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), gameId, "journeys_fetched", JSON.stringify({ fetchedAt, stationErrors, candidateCount: rows.length }), fetchedAt);
  });
  save();

  return {
    fetchedAt,
    stationErrors,
    candidates: eligibleRows.map((row) => ({ ...row, history: ratedHistoryByTripId.get(row.externalTripId) ?? null })),
    fetchedCount: rows.length,
    includedCount: 0,
    excludedCount: rows.length - eligibleRows.length,
    stale: stale || stationErrors.length > 0,
  };
};

const parseHistory = (historyJson: string | null): TrainHistory | null => {
  if (!historyJson) return null;
  try {
    return JSON.parse(historyJson) as TrainHistory;
  } catch {
    return null;
  }
};

const parseJourneyStops = (routeJson: string | null | undefined) => {
  if (!routeJson) return [];
  try {
    const parsed = JSON.parse(routeJson) as unknown;
    return Array.isArray(parsed) ? parsed.filter((stop): stop is { name?: string; scheduledArrival?: string; scheduledDeparture?: string; actualArrival?: string; actualDeparture?: string } => Boolean(stop && typeof stop === "object" && (typeof (stop as { name?: unknown }).name === "string" || typeof (stop as { scheduledArrival?: unknown }).scheduledArrival === "string"))) : [];
  } catch {
    return [];
  }
};

const calculateSelectedHistoryRatings = (gameId: string) => {
  const rows = db.prepare("SELECT id, history_json AS historyJson, duration_seconds AS durationSeconds FROM game_journeys WHERE game_id = ? AND included = 1")
    .all(gameId) as Array<{ id: string; historyJson: string | null; durationSeconds: number | null }>;
  const histories = rows.map((row) => parseHistory(row.historyJson));
  const ratedHistories = applyHistoryRatings(histories, rows.map((row) => row.durationSeconds));
  const update = db.prepare("UPDATE game_journeys SET history_json = ? WHERE id = ?");
  db.transaction(() => {
    rows.forEach((row, index) => {
      const history = ratedHistories[index];
      if (!history) return;
      update.run(JSON.stringify(history), row.id);
    });
  })();
};

app.get("/health", async () => ({ ok: true, service: "trainbet-backend" }));

app.get("/api/admin/auth/check", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;
  return { ok: true };
});

app.get("/api/admin/games", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;
  const games = db.prepare(`
    SELECT id, name, event_date AS eventDate, timezone,
      betting_start AS bettingStart, betting_end AS bettingEnd,
      journey_departure_start AS journeyDepartureStart,
      journey_departure_end AS journeyDepartureEnd,
      calculated_game_end_time AS gameEndTime,
      status, created_at AS createdAt, updated_at AS updatedAt,
      activated_at AS activatedAt
    FROM games ORDER BY created_at DESC
  `).all();
  return { games };
});

app.post<{ Params: { id: string } }>("/api/admin/games/:id/remove", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;
  const game = db.prepare("SELECT id FROM games WHERE id = ?").get(request.params.id) as { id: string } | undefined;
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });

  const removeGame = db.transaction(() => {
    db.prepare(`DELETE FROM bets
      WHERE game_id = ? OR participant_id IN (
        SELECT id FROM participants WHERE game_id = ?
      )`).run(game.id, game.id);
    db.prepare("DELETE FROM participants WHERE game_id = ?").run(game.id);
    db.prepare("DELETE FROM journey_delay_snapshots WHERE game_id = ?").run(game.id);
    db.prepare("DELETE FROM game_map_events WHERE game_id = ?").run(game.id);
    db.prepare("DELETE FROM game_journeys WHERE game_id = ?").run(game.id);
    db.prepare("DELETE FROM game_events WHERE game_id = ?").run(game.id);
    db.prepare("DELETE FROM games WHERE id = ?").run(game.id);
  });
  removeGame();
  return { gameId: game.id, removed: true };
});

app.post<{
  Body: {
    name?: string;
    eventDate?: string;
    bettingStart?: string;
    bettingEnd?: string;
    journeyDepartureStart?: string;
    journeyDepartureEnd?: string;
    stopIds?: string[];
  };
}>("/api/admin/games", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;

  const body = request.body ?? {};
  const defaults = berlinDefaultSchedule();
  const name = body.name?.trim() || "Train Bet";
  const eventDate = body.eventDate?.trim() || defaults.eventDate;
  const bettingStart = body.bettingStart?.trim() || `${eventDate}T${defaults.opening}:00+02:00`;
  const bettingEnd = body.bettingEnd?.trim() || `${eventDate}T${defaults.closing}:00+02:00`;
  const journeyDepartureStart = body.journeyDepartureStart?.trim() || `${eventDate}T${defaults.opening}:00+02:00`;
  const journeyDepartureEnd = body.journeyDepartureEnd?.trim() || `${eventDate}T${defaults.closing}:00+02:00`;
  const stopIds = [...new Set((body.stopIds ?? []).map((id) => id.trim()).filter(Boolean))];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return reply.code(400).send({ error: "INVALID_EVENT_DATE" });
  }
  const timestamps = [bettingStart, bettingEnd, journeyDepartureStart, journeyDepartureEnd].map((value) => new Date(value).getTime());
  const timesOnEventDate = [bettingStart, bettingEnd, journeyDepartureStart, journeyDepartureEnd]
    .every((value) => value.startsWith(`${eventDate}T`));
  if (timestamps.some((value) => !Number.isFinite(value)) || !timesOnEventDate) {
    return reply.code(400).send({ error: "INVALID_TIME_RANGE" });
  }
  if (timestamps[0] >= timestamps[1] || timestamps[2] >= timestamps[3]) {
    return reply.code(400).send({ error: "INVALID_TIME_RANGE" });
  }
  if (stopIds.length === 0) {
    return reply.code(400).send({ error: "STOP_IDS_REQUIRED" });
  }

  const gameId = crypto.randomUUID();
  const now = new Date().toISOString();
  const createGame = db.transaction(() => {
    db.prepare(`
      INSERT INTO games (
        id, name, event_date, timezone, betting_start, betting_end,
        journey_departure_start, journey_departure_end, stop_ids_json,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `).run(
      gameId,
      name,
      eventDate,
      config.eventTimezone,
      bettingStart,
      bettingEnd,
      journeyDepartureStart,
      journeyDepartureEnd,
      JSON.stringify(stopIds),
      now,
      now,
    );

    db.prepare(`
      INSERT INTO game_events (id, game_id, type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      gameId,
      "game_created",
      JSON.stringify({ name, eventDate, bettingStart, bettingEnd, journeyDepartureStart, journeyDepartureEnd, stopIds }),
      now,
    );
  });
  createGame();

  return reply.code(201).send({
    game: {
      id: gameId,
      name,
      eventDate,
      timezone: config.eventTimezone,
      bettingStart,
      bettingEnd,
      journeyDepartureStart,
      journeyDepartureEnd,
      status: "draft",
      stopIds,
      createdAt: now,
      mapEvents: [],
    },
  });
});

app.post<{
  Params: { id: string };
  Body: { disruptionsJson?: string; constructionJson?: string; footballJson?: string; preview?: boolean };
}>("/api/admin/games/:id/disruptions/apply", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;
  const game = db.prepare(`
    SELECT id, status, event_date AS eventDate, betting_start AS bettingStart, betting_end AS bettingEnd,
      journey_departure_start AS journeyDepartureStart, journey_departure_end AS journeyDepartureEnd
    FROM games WHERE id = ?
  `).get(request.params.id) as { id: string; status: string; eventDate: string; bettingStart: string; bettingEnd: string; journeyDepartureStart: string; journeyDepartureEnd: string } | undefined;
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  if (game.status !== "draft") return reply.code(409).send({ error: "GAME_NOT_DRAFT" });
  const selectedRoutes = db.prepare("SELECT route_json AS routeJson FROM game_journeys WHERE game_id = ? AND included = 1").all(game.id) as Array<{ routeJson: string | null }>;
  if (!selectedRoutes.length) return reply.code(400).send({ error: "JOURNEYS_MUST_BE_SELECTED" });
  const routes = selectedRoutes.flatMap((row) => {
    try {
      const parsed = JSON.parse(row.routeJson ?? "[]") as Array<{ lat?: number; lon?: number }>;
      return [parsed.filter((point): point is { lat: number; lon: number } => Number.isFinite(point.lat) && Number.isFinite(point.lon))];
    } catch {
      return [[]];
    }
  });
  const timestamps = [game.bettingStart, game.bettingEnd, game.journeyDepartureStart, game.journeyDepartureEnd].map((value) => new Date(value).getTime());
  const windowStart = Math.min(...timestamps) - 2 * 60 * 60 * 1000;
  const windowEnd = Math.max(...timestamps) + 2 * 60 * 60 * 1000;
  let snapshot: ReturnType<typeof parseDisruptionsJson>;
  try {
    const disruptions = parseDisruptionsJson(request.body?.disruptionsJson, windowStart, windowEnd);
    const construction = parseConstructionJson(request.body?.constructionJson, windowStart, windowEnd);
    const football = parseFootballJson(request.body?.footballJson, game.eventDate, windowStart, windowEnd);
    snapshot = { events: [...disruptions.events, ...construction.events, ...football.events], skipped: [...disruptions.skipped, ...construction.skipped, ...football.skipped] };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_DISRUPTIONS_JSON" });
  }
  const closeEvents = filterEventsByJourneyPaths(snapshot.events.filter((event) => event.category !== "football"), routes, 1);
  const nearbyFootball = filterEventsByJourneyPaths(snapshot.events.filter((event) => event.category === "football"), routes, 10);
  const acceptedEvents = [...closeEvents.accepted, ...nearbyFootball.accepted];
  const skippedDisruptions = [...snapshot.skipped, ...closeEvents.skipped, ...nearbyFootball.skipped];
  if (request.body?.preview) return { preview: true, mapEvents: acceptedEvents, skippedDisruptions };
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("DELETE FROM game_map_events WHERE game_id = ?").run(game.id);
    const insert = db.prepare(`
      INSERT INTO game_map_events (id, game_id, category, title, description, latitude, longitude, starts_at, ends_at, severity, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const event of acceptedEvents) insert.run(event.id, game.id, event.category, event.title, event.description, event.latitude, event.longitude, event.startsAt, event.endsAt, event.severity, event.source);
    db.prepare("UPDATE games SET updated_at = ? WHERE id = ?").run(now, game.id);
    db.prepare("INSERT INTO game_events (id, game_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), game.id, "disruptions_applied", JSON.stringify({ acceptedCount: acceptedEvents.length, skippedCount: skippedDisruptions.length }), now);
  })();
  return { preview: false, mapEvents: acceptedEvents, skippedDisruptions, appliedAt: now };
});

app.post<{ Params: { id: string } }>("/api/admin/games/:id/fetch-journeys", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;

  const game = db.prepare(`
    SELECT id, status, journey_departure_start, journey_departure_end, stop_ids_json
    FROM games WHERE id = ?
  `).get(request.params.id) as {
    id: string;
    status: string;
    journey_departure_start: string;
    journey_departure_end: string;
    stop_ids_json: string;
  } | undefined;

  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  if (game.status !== "draft") return reply.code(409).send({ error: "GAME_NOT_DRAFT" });

  const stopIds = JSON.parse(game.stop_ids_json) as string[];
  if (stopIds.length === 0) return reply.code(400).send({ error: "STOP_IDS_REQUIRED" });

  try {
    const result = await fetchGameJourneys(
      game.id,
      stopIds,
      game.journey_departure_start,
      game.journey_departure_end,
    );
    return result;
  } catch {
    return reply.code(502).send({ error: config.transitProvider === "int-bahn" ? "INT_BAHN_JOURNEY_FETCH_FAILED" : "MOTIS_JOURNEY_FETCH_FAILED" });
  }
});

app.get<{ Params: { id: string } }>("/api/admin/games/:id", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;

  const game = db.prepare(`
    SELECT id, name, event_date, timezone, betting_start, betting_end,
      journey_departure_start, journey_departure_end, calculated_game_end_time, stop_ids_json,
      status, created_at, updated_at, activated_at
    FROM games WHERE id = ?
  `).get(request.params.id) as {
    id: string;
    name: string;
    event_date: string;
    timezone: string;
    betting_start: string;
    betting_end: string;
    journey_departure_start: string;
    journey_departure_end: string;
    calculated_game_end_time: string | null;
    stop_ids_json: string;
    status: string;
    created_at: string;
    updated_at: string;
    activated_at: string | null;
  } | undefined;

  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });

  const journeys = db.prepare(`
    SELECT id, external_trip_id AS externalTripId, display_name AS displayName,
      line_name AS lineName, train_number AS trainNumber,
      history_json AS historyJson,
      origin, destination, scheduled_departure AS scheduledDeparture,
      scheduled_arrival AS scheduledArrival, duration_seconds AS durationSeconds,
      stop_count AS stopCount,
      origin_stop_id AS originStopId, realtime, status, included, exclusion_reason AS exclusionReason,
      created_at AS createdAt
    FROM game_journeys
    WHERE game_id = ?
    ORDER BY duration_seconds DESC, scheduled_departure ASC
  `).all(game.id) as Array<{ lineName: string | null; trainNumber: string | null; historyJson: string | null; [key: string]: unknown }>;
  const journeysWithHistory = journeys.map(({ historyJson, ...journey }) => ({ ...journey, history: parseHistory(historyJson) }));

  const events = db.prepare(`
    SELECT id, type, payload_json AS payloadJson, created_at AS createdAt
    FROM game_events WHERE game_id = ? ORDER BY created_at ASC
  `).all(game.id);

  const journeyCounts = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN included = 1 THEN 1 ELSE 0 END) AS included,
      SUM(CASE WHEN status = 'excluded' THEN 1 ELSE 0 END) AS excluded
    FROM game_journeys WHERE game_id = ?
  `).get(game.id) as { total: number; included: number; excluded: number };

  return {
    game: {
      id: game.id,
      name: game.name,
      eventDate: game.event_date,
      timezone: game.timezone,
      bettingStart: game.betting_start,
      bettingEnd: game.betting_end,
      journeyDepartureStart: game.journey_departure_start,
      journeyDepartureEnd: game.journey_departure_end,
      gameEndTime: game.calculated_game_end_time,
      stopIds: JSON.parse(game.stop_ids_json),
      status: game.status,
      createdAt: game.created_at,
      updatedAt: game.updated_at,
      activatedAt: game.activated_at,
    },
    journeys: journeysWithHistory,
    counts: {
      fetched: journeyCounts.total,
      included: journeyCounts.included ?? 0,
      excluded: journeyCounts.excluded ?? 0,
    },
    events,
    mapEvents: getMapEvents(game.id),
  };
});

app.post<{ Params: { id: string }; Body: { tripIds?: string[] } }>("/api/admin/games/:id/journeys/select", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;

  const game = db.prepare("SELECT id, status FROM games WHERE id = ?")
    .get(request.params.id) as { id: string; status: string } | undefined;
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  if (game.status !== "draft") return reply.code(409).send({ error: "GAME_NOT_DRAFT" });

  const tripIds = [...new Set((request.body?.tripIds ?? []).map((id) => id.trim()).filter(Boolean))];
  const available = db.prepare("SELECT external_trip_id AS tripId FROM game_journeys WHERE game_id = ?")
    .all(game.id) as Array<{ tripId: string }>;
  const availableIds = new Set(available.map(({ tripId }) => tripId));
  const unknownTripIds = tripIds.filter((tripId) => !availableIds.has(tripId));
  if (unknownTripIds.length > 0) {
    return reply.code(400).send({ error: "UNKNOWN_TRIP_IDS", tripIds: unknownTripIds });
  }

  const now = new Date().toISOString();
  const select = db.transaction(() => {
    db.prepare("UPDATE game_journeys SET included = 0 WHERE game_id = ?").run(game.id);
    const include = db.prepare("UPDATE game_journeys SET included = 1 WHERE game_id = ? AND external_trip_id = ?");
    for (const tripId of tripIds) include.run(game.id, tripId);
    db.prepare("UPDATE games SET updated_at = ? WHERE id = ?").run(now, game.id);
    db.prepare(`INSERT INTO game_events (id, game_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), game.id, "journeys_selected", JSON.stringify({ tripIds }), now);
  });
  select();
  calculateSelectedHistoryRatings(game.id);

  return {
    gameId: game.id,
    tripIds,
    selectedCount: tripIds.length,
    savedAt: now,
  };
});

app.post<{ Params: { id: string } }>("/api/admin/games/:id/confirm", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;

  const game = db.prepare("SELECT id, status FROM games WHERE id = ?")
    .get(request.params.id) as { id: string; status: string } | undefined;
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  if (game.status !== "draft") return reply.code(409).send({ error: "GAME_NOT_DRAFT" });

  const selected = db.prepare("SELECT COUNT(*) AS count, MAX(scheduled_arrival) AS latestScheduledArrival FROM game_journeys WHERE game_id = ? AND included = 1")
    .get(game.id) as { count: number; latestScheduledArrival: string | null };
  if (selected.count < 1) return reply.code(400).send({ error: "NO_JOURNEYS_SELECTED" });
  if (!selected.latestScheduledArrival || !Number.isFinite(Date.parse(selected.latestScheduledArrival))) return reply.code(400).send({ error: "INVALID_JOURNEY_ARRIVALS" });

  const now = new Date().toISOString();
  const confirm = db.transaction(() => {
    db.prepare("UPDATE games SET status = 'active', calculated_game_end_time = ?, activated_at = ?, updated_at = ? WHERE id = ?")
      .run(selected.latestScheduledArrival, now, now, game.id);
    db.prepare(`INSERT INTO game_events (id, game_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), game.id, "game_confirmed", JSON.stringify({ selectedCount: selected.count, calculatedGameEndTime: selected.latestScheduledArrival }), now);
  });
  confirm();

  return { gameId: game.id, status: "active", selectedCount: selected.count, calculatedGameEndTime: selected.latestScheduledArrival, activatedAt: now };
});

app.get<{ Querystring: { text?: string } }>("/api/admin/stations/search", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;

  const text = request.query.text?.trim();
  if (!text || text.length < 2) {
    return reply.code(400).send({ error: "SEARCH_TEXT_REQUIRED" });
  }

  try {
    return await transitDataSource.searchStations(text);
  } catch (error) {
    const unavailable = !(error instanceof TransitDataSourceError) || error.status === undefined;
    request.log[unavailable ? "error" : "warn"]({ err: error, url: error instanceof TransitDataSourceError ? error.url : undefined }, "Transit location search failed");
    return reply.code(502).send({ error: unavailable ? "MOTIS_LOCATION_SEARCH_UNAVAILABLE" : "MOTIS_LOCATION_SEARCH_FAILED" });
  }
});

type GameRow = {
  id: string;
  name: string;
  event_date: string;
  timezone: string;
  betting_start: string;
  betting_end: string;
  calculated_game_end_time: string | null;
  status: string;
};

const getGameById = (id: string) => db.prepare(`
  SELECT id, name, event_date, timezone, betting_start, betting_end, calculated_game_end_time, status
  FROM games WHERE id = ?
`).get(id) as {
  id: string; name: string; event_date: string; timezone: string;
  betting_start: string; betting_end: string; calculated_game_end_time: string | null; status: string;
} | undefined;

const getPublicGame = (id: string) => {
  const game = getGameById(id);
  return game && game.status !== "draft" ? game : undefined;
};

const getAdminDashboardSnapshot = (gameId?: string) => {
  const game = db.prepare(`
    SELECT id, name, event_date AS eventDate, timezone, status,
      calculated_game_end_time AS gameEndTime,
      journey_departure_start AS journeyDepartureStart,
      betting_start AS bettingStart, betting_end AS bettingEnd
    FROM games
    WHERE ${gameId ? "id = ?" : "status IN ('active', 'finished')"}
      AND status IN ('active', 'finished')
    ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1
  `).get(...(gameId ? [gameId] : [])) as { id: string; name: string; eventDate: string; timezone: string; status: string; gameEndTime: string | null; journeyDepartureStart: string; bettingStart: string; bettingEnd: string } | undefined;
  if (!game) return { state: "no_active_game" as const, game: null, entries: [], lastUpdatedAt: null, stale: false };

  const rows = db.prepare(`
    SELECT id AS trainId, display_name AS displayName, origin, destination,
      scheduled_departure AS scheduledDeparture, scheduled_arrival AS scheduledArrival,
      duration_seconds AS durationSeconds, stop_count AS stopCount,
      actual_arrival AS actualArrival, race_delay_minutes AS raceDelayMinutes,
      final_delay_minutes AS finalDelayMinutes, current_delay_minutes AS currentDelayMinutes,
      departure_delay_minutes AS departureDelayMinutes, live_status AS status,
      live_error AS liveError, race_color AS raceColor, route_json AS routeJson,
      (SELECT COUNT(*) FROM bets WHERE bets.game_id = game_journeys.game_id AND bets.train_id = game_journeys.id) AS betCount
    FROM game_journeys
    WHERE game_id = ? AND included = 1
      AND EXISTS (SELECT 1 FROM bets WHERE bets.game_id = ? AND bets.train_id = game_journeys.id)
    ORDER BY scheduled_departure ASC
  `).all(game.id, game.id) as Array<{ trainId: string; displayName: string; origin: string; destination: string; scheduledDeparture: string; scheduledArrival: string; durationSeconds: number; stopCount: number | null; actualArrival: string | null; raceDelayMinutes: number | null; finalDelayMinutes: number | null; currentDelayMinutes: number | null; departureDelayMinutes: number | null; status: string; liveError: string | null; raceColor: string | null; routeJson: string | null; betCount: number }>;
  const snapshotRows = db.prepare(`SELECT journey_id AS journeyId, delay_minutes AS delayMinutes, recorded_at AS recordedAt
    FROM journey_delay_snapshots WHERE game_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC`).all(game.id, new Date(Date.now() - 30 * 60_000).toISOString()) as Array<{ journeyId: string; delayMinutes: number; recordedAt: string }>;
  const snapshotsByJourney = new Map<string, Array<{ delayMinutes: number; recordedAt: string }>>();
  for (const snapshot of snapshotRows) {
    const history = snapshotsByJourney.get(snapshot.journeyId) ?? [];
    history.push({ delayMinutes: snapshot.delayMinutes, recordedAt: snapshot.recordedAt });
    snapshotsByJourney.set(snapshot.journeyId, history);
  }
  const entriesWithHistory = rows.map((entry) => ({ ...entry, stops: parseJourneyStops(entry.routeJson), delayHistory: snapshotsByJourney.get(entry.trainId) ?? [] }));
  const valid = (entry: typeof entriesWithHistory[number]) => entry.status !== "cancelled" && entry.status !== "waiting_for_departure" && entry.raceDelayMinutes !== null;
  entriesWithHistory.sort((left, right) => {
    const leftCancelled = left.status === "cancelled";
    const rightCancelled = right.status === "cancelled";
    if (leftCancelled !== rightCancelled) return Number(rightCancelled) - Number(leftCancelled);
    const leftValid = valid(left); const rightValid = valid(right);
    if (leftValid !== rightValid) return Number(rightValid) - Number(leftValid);
    if (!leftValid || !rightValid) return left.scheduledDeparture.localeCompare(right.scheduledDeparture);
    return (right.raceDelayMinutes as number) - (left.raceDelayMinutes as number);
  });
  let position = 0;
  let previousDelay: number | null = null;
  const entries = entriesWithHistory.map((entry, index) => {
    if (entry.status === "cancelled") return { ...entry, position: 1, cancelled: true, stale: false };
    if (valid(entry) && entry.raceDelayMinutes !== previousDelay) position = index + 1;
    previousDelay = entry.raceDelayMinutes;
    return { ...entry, position: valid(entry) ? position : null, cancelled: false, stale: entry.status === "stale" };
  });
  const state = entries.length > 0 && entries.every((entry) => entry.status === "arrived" || entry.status === "cancelled")
    ? "finished" as const
    : entries.some((entry) => entry.status === "in_progress" || entry.status === "arrived") ? "live" as const : "waiting" as const;
  const lastUpdatedAt = db.prepare("SELECT MAX(last_live_update) AS value FROM game_journeys WHERE game_id = ?").get(game.id) as { value: string | null };
  return { state, game, entries, lastUpdatedAt: lastUpdatedAt.value, stale: entries.some((entry) => entry.stale) };
};

app.get<{ Params: { id: string } }>("/api/admin/games/:id/dashboard", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;
  const dashboard = getAdminDashboardSnapshot(request.params.id);
  if (!dashboard.game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  return dashboard;
});

app.post<{ Params: { id: string } }>("/api/admin/games/:id/populate-bets", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;
  const game = db.prepare("SELECT id, status FROM games WHERE id = ?").get(request.params.id) as { id: string; status: string } | undefined;
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  if (game.status !== "active") return reply.code(409).send({ error: "GAME_NOT_ACTIVE" });

  const journeys = db.prepare("SELECT id, display_name AS displayName FROM game_journeys WHERE game_id = ? AND included = 1 ORDER BY display_name ASC, id ASC")
    .all(game.id) as Array<{ id: string; displayName: string }>;
  const now = new Date().toISOString();
  let createdBets = 0;
  let existingBets = 0;
  const findParticipant = db.prepare("SELECT id FROM participants WHERE game_id = ? AND username = ? COLLATE NOCASE");
  const insertParticipant = db.prepare("INSERT INTO participants (id, game_id, username, created_at) VALUES (?, ?, ?, ?)");
  const findBet = db.prepare("SELECT 1 FROM bets WHERE game_id = ? AND participant_id = ?");
  const insertBet = db.prepare("INSERT INTO bets (id, game_id, participant_id, train_id, submitted_at) VALUES (?, ?, ?, ?, ?)");
  db.transaction(() => {
    for (const journey of journeys) {
      const username = `Demo · ${journey.displayName} · ${journey.id.slice(0, 8)}`;
      const existingParticipant = findParticipant.get(game.id, username) as { id: string } | undefined;
      const participantId = existingParticipant?.id ?? crypto.randomUUID();
      if (!existingParticipant) insertParticipant.run(participantId, game.id, username, now);
      if (findBet.get(game.id, participantId)) {
        existingBets += 1;
      } else {
        insertBet.run(crypto.randomUUID(), game.id, participantId, journey.id, now);
        createdBets += 1;
      }
    }
  })();
  return { gameId: game.id, totalTrains: journeys.length, createdBets, existingBets };
});

app.get("/api/admin/dashboard", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;
  return getAdminDashboardSnapshot();
});

const getMapEvents = (gameId: string): MapEvent[] => db.prepare(`
  SELECT id, category, title, description, latitude, longitude,
    starts_at AS startsAt, ends_at AS endsAt, severity, source
  FROM game_map_events WHERE game_id = ? ORDER BY starts_at ASC, id ASC
`).all(gameId) as MapEvent[];

app.get<{ Params: { id: string } }>("/api/games/:id", async (request, reply) => {
  const game = getPublicGame(request.params.id);
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  return { game: { id: game.id, name: game.name, eventDate: game.event_date, timezone: game.timezone, bettingStart: game.betting_start, bettingEnd: game.betting_end, gameEndTime: game.calculated_game_end_time, status: game.status, mapEvents: getMapEvents(game.id) } };
});

app.get<{ Querystring: { gameId?: string } }>("/api/trains", async (request, reply) => {
  if (!request.query.gameId) return reply.code(400).send({ error: "GAME_ID_REQUIRED" });
  const game = getPublicGame(request.query.gameId);
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });

  const trainRows = db.prepare(`
    SELECT id, external_trip_id AS externalTripId, display_name AS displayName,
      line_name AS lineName, train_number AS trainNumber,
      history_json AS historyJson,
      origin, destination, scheduled_departure AS scheduledDeparture,
      scheduled_arrival AS scheduledArrival, duration_seconds AS durationSeconds,
      origin_stop_id AS originStopId, geometry, route_json AS routeJson,
      status, realtime, actual_arrival AS actualArrival, race_delay_minutes AS raceDelayMinutes, final_delay_minutes AS finalDelayMinutes,
      actual_departure AS actualDeparture, departure_delay_seconds AS departureDelaySeconds,
      live_status AS liveStatus, live_error AS liveError, race_color AS raceColor
    FROM game_journeys
    WHERE game_id = ? AND included = 1
    ORDER BY scheduled_departure ASC
  `).all(game.id) as Array<{ lineName: string | null; trainNumber: string | null; historyJson: string | null; stopCount?: number | null; routeJson?: string | null; [key: string]: unknown }>;
  const mapEvents = getMapEvents(game.id);
  const trains = trainRows.map((train) => {
    const row = train as { stopCount?: number | null; routeJson?: string | null };
    let result = train;
    if (row.stopCount !== null && row.stopCount !== undefined) result = train;
    try {
      const stops = JSON.parse(row.routeJson ?? "[]") as unknown[];
      result = { ...result, stopCount: row.stopCount !== null && row.stopCount !== undefined ? row.stopCount : stops.length >= 2 ? Math.max(0, stops.length - 2) : null };
    } catch {
      result = { ...result, stopCount: row.stopCount ?? null };
    }
    let route = [] as Array<{ lat: number; lon: number }>;
    try {
      const parsed = JSON.parse(row.routeJson ?? "[]") as Array<{ lat?: unknown; lon?: unknown }>;
      route = parsed.filter((point): point is { lat: number; lon: number } => typeof point.lat === "number" && Number.isFinite(point.lat) && typeof point.lon === "number" && Number.isFinite(point.lon));
    } catch {
      route = [];
    }
    return { ...result, eventCounts: countEventsByCategory(mapEvents, route) };
  });
  return { trains: trains.map(({ historyJson, ...train }) => ({ ...train, history: parseHistory(historyJson) })), lastUpdatedAt: null, stale: false };
});
let progressRefreshRunning = false;

const formatDelayMinutes = (minutes: number) => `${minutes > 0 ? "+" : minutes < 0 ? "−" : ""}${Math.abs(minutes)} min`;
const formatCompactDelay = (minutes: number) => `${minutes > 0 ? "+" : minutes < 0 ? "−" : ""}${Math.abs(minutes)}min`;
const formatPosition = (position: number | undefined) => {
  if (!position) return "Waiting";
  const suffix = position % 100 >= 11 && position % 100 <= 13 ? "th" : position % 10 === 1 ? "st" : position % 10 === 2 ? "nd" : position % 10 === 3 ? "rd" : "th";
  return `${position}${suffix} place`;
};

const refreshGameProgress = async (game: GameRow) => {
  const rows = db.prepare(`SELECT DISTINCT j.id, j.external_trip_id AS tripId, j.display_name AS displayName,
    j.scheduled_arrival AS scheduledArrival, j.scheduled_departure AS scheduledDeparture,
    j.live_status AS previousStatus, j.current_delay_minutes AS previousCurrentDelay,
    j.race_delay_minutes AS previousRaceDelay, j.final_delay_minutes AS previousFinalDelay, j.delay_gain_band AS previousGainBand
    FROM game_journeys j
    WHERE j.game_id = ? AND j.included = 1 AND j.live_status NOT IN ('arrived', 'cancelled')`)
    .all(game.id) as Array<{ id: string; tripId: string; displayName: string; scheduledArrival: string; scheduledDeparture: string; previousStatus: string; previousCurrentDelay: number | null; previousRaceDelay: number | null; previousFinalDelay: number | null; previousGainBand: string }>;
  const previousRanks = db.prepare(`SELECT id, RANK() OVER (ORDER BY CASE WHEN live_status = 'cancelled' THEN 0 ELSE 1 END, race_delay_minutes DESC) AS position FROM game_journeys WHERE game_id = ? AND included = 1 AND (live_status = 'cancelled' OR race_delay_minutes IS NOT NULL)`).all(game.id) as Array<{ id: string; position: number }>;
  const previousLeader = previousRanks.find((rank) => rank.position === 1);
  const results = await Promise.allSettled(rows.map((row) => transitDataSource.getLiveTrip(row.tripId)));
  const fetchedAt = new Date().toISOString();
  const updates = rows.map((row, index) => {
    const result = results[index];
    if (result.status === "rejected") return { ...row, actualArrival: null, actualDeparture: null, currentDelayMinutes: null, departureDelayMinutes: null, raceDelayMinutes: null, finalDelayMinutes: null, geometry: null, endpoints: null, routeJson: null, alerts: [], delayGainBand: row.previousGainBand, status: "stale", error: result.reason instanceof Error ? result.reason.message : "MOTIS request failed" };
    const actualTimestamp = result.value.actualArrival ? Date.parse(result.value.actualArrival) : NaN;
    const scheduledTimestamp = Date.parse(row.scheduledArrival);
    const finalDelayMinutes = Number.isFinite(actualTimestamp) && Number.isFinite(scheduledTimestamp)
      ? Math.round((actualTimestamp - scheduledTimestamp) / 60000) : null;
    const actualDepartureTimestamp = result.value.actualDeparture ? Date.parse(result.value.actualDeparture) : NaN;
    const scheduledDepartureTimestamp = Date.parse(row.scheduledDeparture);
    const departureHasPassed = Number.isFinite(scheduledDepartureTimestamp) && scheduledDepartureTimestamp <= Date.now();
    const departureDelayMinutes = result.value.departureDelayMinutes ?? (Number.isFinite(actualDepartureTimestamp) && Number.isFinite(scheduledDepartureTimestamp)
      ? Math.round((actualDepartureTimestamp - scheduledDepartureTimestamp) / 60000) : null);
    const currentDelayMinutes = departureHasPassed ? (result.value.currentDelayMinutes ?? (result.value.arrived ? finalDelayMinutes : null)) : null;
    const raceDelayMinutes = currentDelayMinutes;
    const delayGainBand = row.previousGainBand;
    return { ...row, actualArrival: result.value.actualArrival, actualDeparture: result.value.actualDeparture ?? null, currentDelayMinutes, departureDelayMinutes, raceDelayMinutes, finalDelayMinutes, geometry: result.value.geometry, endpoints: result.value.endpoints, routeJson: result.value.routeJson ?? null, alerts: result.value.alerts, delayGainBand,
      status: result.value.cancelled ? "cancelled" : result.value.arrived ? "arrived" : departureHasPassed ? "in_progress" : "waiting_for_departure", error: null };
  });
  db.transaction(() => {
    const update = db.prepare(`UPDATE game_journeys SET actual_arrival = ?, actual_departure = ?, current_delay_minutes = ?, departure_delay_minutes = ?, race_delay_minutes = ?, final_delay_minutes = ?, delay_gain_band = ?,
      live_status = ?, last_live_update = ?, live_error = ?, geometry = COALESCE(?, geometry),
      route_json = COALESCE(?, route_json) WHERE id = ? AND game_id = ?`);
    for (const updateRow of updates) {
      const currentGain = updateRow.currentDelayMinutes !== null ? (() => {
        const snapshot = db.prepare(`SELECT delay_minutes AS delayMinutes FROM journey_delay_snapshots WHERE game_id = ? AND journey_id = ? AND recorded_at <= ? ORDER BY recorded_at DESC LIMIT 1`).get(game.id, updateRow.id, new Date(Date.parse(fetchedAt) - 10 * 60_000).toISOString()) as { delayMinutes: number } | undefined;
        const gain = snapshot ? updateRow.currentDelayMinutes! - snapshot.delayMinutes : null;
        return gain !== null && gain >= 3 ? "drastic" : gain !== null && gain >= 2 ? "moderate" : "none";
      })() : updateRow.delayGainBand;
      updateRow.delayGainBand = currentGain;
      update.run(updateRow.actualArrival, updateRow.actualDeparture, updateRow.currentDelayMinutes, updateRow.departureDelayMinutes, updateRow.raceDelayMinutes, updateRow.finalDelayMinutes, currentGain, updateRow.status, fetchedAt, updateRow.error, updateRow.geometry, updateRow.routeJson, updateRow.id, game.id);
      const base = { trainId: updateRow.id, displayName: updateRow.displayName, source: "generated" };
      if (updateRow.status === "in_progress" && updateRow.previousStatus === "waiting_for_departure") addLiveEvent(game.id, "train_departed", { ...base, title: eventPhrase("departed", updateRow.displayName, updateRow.id), message: "The delay race is officially underway.", severity: "info" }, `${updateRow.id}:train_departed`, fetchedAt);
      if (updateRow.status === "cancelled" && updateRow.previousStatus !== "cancelled") addLiveEvent(game.id, "train_cancelled", { ...base, title: eventPhrase("cancelled", updateRow.displayName, updateRow.id), message: "Cancelled trains win the race.", severity: "severe" }, `${updateRow.id}:train_cancelled`, fetchedAt);
      if (updateRow.status === "arrived" && updateRow.previousStatus !== "arrived") addLiveEvent(game.id, "train_arrived", { ...base, title: eventPhrase("arrived", updateRow.displayName, updateRow.id), message: updateRow.finalDelayMinutes === null ? "Final delay unavailable." : `Final delay: ${updateRow.finalDelayMinutes >= 0 ? "+" : "−"}${Math.abs(updateRow.finalDelayMinutes)} min`, severity: "info" }, `${updateRow.id}:train_arrived`, fetchedAt);
      if (updateRow.currentDelayMinutes !== null) {
        const snapshot = db.prepare(`SELECT delay_minutes AS delayMinutes FROM journey_delay_snapshots WHERE game_id = ? AND journey_id = ? AND recorded_at <= ? ORDER BY recorded_at DESC LIMIT 1`).get(game.id, updateRow.id, new Date(Date.parse(fetchedAt) - 10 * 60_000).toISOString()) as { delayMinutes: number } | undefined;
        const gain = snapshot ? updateRow.currentDelayMinutes - snapshot.delayMinutes : null;
        const baselineDelay = snapshot?.delayMinutes;
        const bucket = Math.floor(Date.parse(fetchedAt) / 600_000);
        if (gain !== null && baselineDelay !== undefined && gain >= 3 && updateRow.previousGainBand !== "drastic") addLiveEvent(game.id, "delay_gain_drastic", { ...base, previousDelayMinutes: baselineDelay, currentDelayMinutes: updateRow.currentDelayMinutes, changeMinutes: gain, title: eventPhrase("delayDrastic", updateRow.displayName, `${updateRow.id}:${bucket}`), message: `Delay ${formatCompactDelay(updateRow.currentDelayMinutes)} (+${gain}min)`, severity: "warning" }, `${updateRow.id}:delay-drastic:${bucket}`, fetchedAt);
        else if (gain !== null && baselineDelay !== undefined && gain >= 2 && updateRow.previousGainBand === "none") addLiveEvent(game.id, "delay_gain_moderate", { ...base, previousDelayMinutes: baselineDelay, currentDelayMinutes: updateRow.currentDelayMinutes, changeMinutes: gain, title: eventPhrase("delayModerate", updateRow.displayName, `${updateRow.id}:${bucket}`), message: `Delay ${formatCompactDelay(updateRow.currentDelayMinutes)} (+${gain}min)`, severity: "info" }, `${updateRow.id}:delay-moderate:${bucket}`, fetchedAt);
        if (updateRow.currentDelayMinutes === 0 && updateRow.previousCurrentDelay !== null && updateRow.previousCurrentDelay !== 0) addLiveEvent(game.id, "on_time", { ...base, previousDelayMinutes: updateRow.previousCurrentDelay, currentDelayMinutes: 0, changeMinutes: -updateRow.previousCurrentDelay, title: eventPhrase("onTime", updateRow.displayName, updateRow.id), message: `Delay 0min (${formatCompactDelay(-updateRow.previousCurrentDelay)})`, severity: "info" }, `${updateRow.id}:on-time:${bucket}`, fetchedAt);
        db.prepare("INSERT INTO journey_delay_snapshots (game_id, journey_id, delay_minutes, recorded_at) VALUES (?, ?, ?, ?)").run(game.id, updateRow.id, updateRow.currentDelayMinutes, fetchedAt);
      }
      for (const alert of updateRow.alerts) {
        const key = `${updateRow.id}:alert:${alert.title}:${alert.description ?? ""}:${alert.severity}`;
        addLiveEvent(game.id, "provider_alert", { ...base, ...alert, message: alert.description ?? alert.title }, key, fetchedAt);
      }
    }
    const nextLeader = db.prepare(`SELECT id, display_name AS displayName FROM game_journeys WHERE game_id = ? AND included = 1 AND (live_status = 'cancelled' OR race_delay_minutes IS NOT NULL) ORDER BY CASE WHEN live_status = 'cancelled' THEN 0 ELSE 1 END, race_delay_minutes DESC, id ASC LIMIT 1`).get(game.id) as { id: string; displayName: string } | undefined;
    if (nextLeader && nextLeader.id !== previousLeader?.id) addLiveEvent(game.id, "new_leader", { trainId: nextLeader.id, displayName: nextLeader.displayName, title: eventPhrase("leader", nextLeader.displayName, `${game.id}:${nextLeader.id}`), message: "The delay race has a new front-runner.", severity: "warning", source: "generated" }, `${game.id}:leader:${nextLeader.id}`, fetchedAt);
    const nextRanks = db.prepare(`SELECT id, display_name AS displayName, race_delay_minutes AS delayMinutes, RANK() OVER (ORDER BY CASE WHEN live_status = 'cancelled' THEN 0 ELSE 1 END, race_delay_minutes DESC) AS position FROM game_journeys WHERE game_id = ? AND included = 1 AND (live_status = 'cancelled' OR race_delay_minutes IS NOT NULL)`).all(game.id) as Array<{ id: string; displayName: string; delayMinutes: number; position: number }>;
    for (const rank of nextRanks) {
      const oldPosition = previousRanks.find((previous) => previous.id === rank.id)?.position;
      if ((rank.position === 2 || rank.position === 3) && oldPosition !== rank.position) {
        const place = rank.position === 2 ? "second" : "third";
        addLiveEvent(game.id, `new_${place}_place`, { trainId: rank.id, displayName: rank.displayName, previousPosition: oldPosition ?? null, currentPosition: rank.position, title: eventPhrase(place, rank.displayName, `${game.id}:${rank.id}:${rank.position}`), message: `Position: ${formatPosition(oldPosition)} → ${formatPosition(rank.position)} · Current delay: ${formatDelayMinutes(rank.delayMinutes)}`, severity: "info", source: "generated" }, `${game.id}:place:${rank.id}:${rank.position}`, fetchedAt);
      }
    }
    const currentEnd = db.prepare("SELECT calculated_game_end_time AS value FROM games WHERE id = ?").get(game.id) as { value: string | null } | undefined;
    const latestTrainEnd = db.prepare("SELECT MAX(COALESCE(actual_arrival, scheduled_arrival)) AS value FROM game_journeys WHERE game_id = ? AND included = 1").get(game.id) as { value: string | null };
    const currentEndTimestamp = currentEnd?.value ? Date.parse(currentEnd.value) : NaN;
    const latestTrainEndTimestamp = latestTrainEnd.value ? Date.parse(latestTrainEnd.value) : NaN;
    if (Number.isFinite(latestTrainEndTimestamp) && (!Number.isFinite(currentEndTimestamp) || latestTrainEndTimestamp > currentEndTimestamp)) {
      db.prepare("UPDATE games SET calculated_game_end_time = ?, updated_at = ? WHERE id = ?").run(latestTrainEnd.value, fetchedAt, game.id);
    }
    const remaining = db.prepare(`SELECT COUNT(*) AS count FROM game_journeys WHERE game_id = ? AND included = 1 AND live_status NOT IN ('arrived', 'cancelled')`).get(game.id) as { count: number };
    if (remaining.count === 0) {
      const currentGame = db.prepare("SELECT status FROM games WHERE id = ?").get(game.id) as { status: string } | undefined;
      if (currentGame?.status === "active") {
        db.prepare("UPDATE games SET status = 'finished', updated_at = ? WHERE id = ?").run(fetchedAt, game.id);
        addLiveEvent(game.id, "game_finished", { title: "The delay race is finished", message: "Every train has crossed the finish line. Time to count the damage.", severity: "info", source: "generated" }, `${game.id}:game_finished`, fetchedAt);
      }
    }
    db.prepare("DELETE FROM journey_delay_snapshots WHERE recorded_at < ?").run(new Date(Date.parse(fetchedAt) - 30 * 60_000).toISOString());
  })();
};

const refreshProgress = async () => {
  if (progressRefreshRunning) return;
  const games = db.prepare(`
    SELECT id, name, event_date, timezone, betting_start, betting_end, status
    FROM games WHERE status = 'active'
  `).all() as GameRow[];
  if (!games.length) return;
  progressRefreshRunning = true;
  try {
    await Promise.allSettled(games.map((game) => refreshGameProgress(game)));
  } finally {
    progressRefreshRunning = false;
  }
};

app.get<{ Querystring: { gameId?: string } }>("/api/progress", async (request, reply) => {
  if (!request.query.gameId) return reply.code(400).send({ error: "GAME_ID_REQUIRED" });
  const game = getPublicGame(request.query.gameId);
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  const trains = db.prepare(`SELECT DISTINCT j.id, j.display_name AS displayName,
    j.scheduled_arrival AS scheduledArrival, j.actual_arrival AS actualArrival,
    j.race_delay_minutes AS raceDelayMinutes, j.current_delay_minutes AS currentDelayMinutes, j.departure_delay_minutes AS departureDelayMinutes, j.live_status AS status,
    j.race_color AS raceColor,
    j.stop_count AS stopCount, j.departure_delay_seconds AS departureDelaySeconds,
    j.geometry, j.route_json AS routeJson,
    j.last_live_update AS lastUpdatedAt, j.live_error AS error, j.scheduled_departure AS scheduledDeparture
    FROM game_journeys j JOIN bets b ON b.train_id = j.id
    WHERE j.game_id = ? AND b.game_id = ? AND j.included = 1 ORDER BY j.scheduled_departure ASC`)
    .all(game.id, game.id) as Array<{ status: string; routeJson: string | null; scheduledDeparture: string }>;
  const progressTrains = trains.map((train) => ({
      ...train,
      cancelled: train.status === "cancelled",
      stale: train.status === "stale",
      stops: parseJourneyStops(train.routeJson),
    }));
  const lastUpdatedAt = db.prepare(`SELECT MAX(last_live_update) AS value FROM game_journeys WHERE game_id = ?`).get(game.id) as { value: string | null };
  return { trains: progressTrains, lastUpdatedAt: lastUpdatedAt.value, stale: progressTrains.some((train) => train.status === "stale") };
});

app.get<{ Querystring: { gameId?: string; limit?: string } }>("/api/events", async (request, reply) => {
  if (!request.query.gameId) return reply.code(400).send({ error: "GAME_ID_REQUIRED" });
  const game = getPublicGame(request.query.gameId);
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  const limit = Math.min(50, Math.max(1, Number.parseInt(request.query.limit ?? "5", 10) || 5));
  const rows = db.prepare(`SELECT id, type, payload_json AS payloadJson, created_at AS createdAt
    FROM game_events WHERE game_id = ? AND type IN ('train_departed', 'delay_gain_moderate', 'delay_gain_drastic', 'on_time', 'train_cancelled', 'train_arrived', 'new_leader', 'new_second_place', 'new_third_place', 'game_finished', 'provider_alert')
    ORDER BY created_at DESC LIMIT ?`).all(game.id, limit) as Array<{ id: string; type: string; payloadJson: string; createdAt: string }>;
  return { events: rows.map((row) => ({ id: row.id, type: row.type, ...JSON.parse(row.payloadJson), createdAt: row.createdAt })) };
});

setInterval(() => { void refreshProgress(); }, config.cacheTtlSeconds * 1000);
void refreshProgress();
app.get<{ Querystring: { gameId?: string } }>("/api/leaderboard", async (request, reply) => {
  if (!request.query.gameId) return reply.code(400).send({ error: "GAME_ID_REQUIRED" });
  const game = getPublicGame(request.query.gameId);
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  const ranked = db.prepare(`SELECT p.id AS participantId, p.username, b.train_id AS trainId,
      j.display_name AS displayName, j.origin, j.destination, j.scheduled_departure AS scheduledDeparture,
      j.scheduled_arrival AS scheduledArrival, j.duration_seconds AS durationSeconds,
      j.stop_count AS stopCount, j.actual_arrival AS actualArrival, j.race_delay_minutes AS raceDelayMinutes, j.final_delay_minutes AS finalDelayMinutes,
      j.current_delay_minutes AS currentDelayMinutes, j.departure_delay_minutes AS departureDelayMinutes, j.live_status AS status, j.race_color AS raceColor, j.route_json AS routeJson
    FROM game_journeys j
    LEFT JOIN bets b ON b.train_id = j.id AND b.game_id = ?
    LEFT JOIN participants p ON p.id = b.participant_id
    WHERE j.game_id = ? AND j.included = 1`)
    .all(game.id, game.id) as Array<{ participantId: string | null; username: string | null; trainId: string; displayName: string; origin: string; destination: string; scheduledDeparture: string; scheduledArrival: string; durationSeconds: number; stopCount: number | null; actualArrival: string | null; raceDelayMinutes: number | null; finalDelayMinutes: number | null; currentDelayMinutes: number | null; departureDelayMinutes: number | null; status: string; raceColor: string | null; routeJson: string | null }>;
  const snapshotRows = db.prepare(`SELECT journey_id AS journeyId, delay_minutes AS delayMinutes, recorded_at AS recordedAt
    FROM journey_delay_snapshots WHERE game_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC`).all(game.id, new Date(Date.now() - 30 * 60_000).toISOString()) as Array<{ journeyId: string; delayMinutes: number; recordedAt: string }>;
  const snapshotsByJourney = new Map<string, Array<{ delayMinutes: number; recordedAt: string }>>();
  for (const snapshot of snapshotRows) {
    const history = snapshotsByJourney.get(snapshot.journeyId) ?? [];
    history.push({ delayMinutes: snapshot.delayMinutes, recordedAt: snapshot.recordedAt });
    snapshotsByJourney.set(snapshot.journeyId, history);
  }
  ranked.sort((a, b) => (b.raceDelayMinutes ?? -Infinity) - (a.raceDelayMinutes ?? -Infinity));
  const trains = [...new Map(ranked.map((entry) => [entry.trainId, {
    trainId: entry.trainId, displayName: entry.displayName, origin: entry.origin, destination: entry.destination,
    scheduledDeparture: entry.scheduledDeparture, scheduledArrival: entry.scheduledArrival, durationSeconds: entry.durationSeconds,
    stopCount: entry.stopCount, actualArrival: entry.actualArrival, raceDelayMinutes: entry.raceDelayMinutes, finalDelayMinutes: entry.finalDelayMinutes, currentDelayMinutes: entry.currentDelayMinutes, departureDelayMinutes: entry.departureDelayMinutes, status: entry.status,
    raceColor: entry.raceColor, routeJson: entry.routeJson, stops: parseJourneyStops(entry.routeJson),
    delayHistory: snapshotsByJourney.get(entry.trainId) ?? [],
    bettors: [] as Array<{ participantId: string; username: string }>,
  }])).values()];
  for (const entry of ranked) if (entry.participantId && entry.username) trains.find((train) => train.trainId === entry.trainId)?.bettors.push({ participantId: entry.participantId, username: entry.username });
  trains.sort((a, b) => {
    const aCancelled = a.status === "cancelled";
    const bCancelled = b.status === "cancelled";
    if (aCancelled !== bCancelled) return Number(bCancelled) - Number(aCancelled);
    const aValid = a.status !== "cancelled" && a.status !== "waiting_for_departure" && a.raceDelayMinutes !== null;
    const bValid = b.status !== "cancelled" && b.status !== "waiting_for_departure" && b.raceDelayMinutes !== null;
    if (aValid !== bValid) return Number(bValid) - Number(aValid);
    if (!aValid || !bValid) return 0;
    return (b.raceDelayMinutes as number) - (a.raceDelayMinutes as number);
  });
  let previousRaceDelay: number | null = null;
  let position = 0;
  const rankedTrains = trains.map((train, index) => {
    if (train.status === "cancelled") return { ...train, position: 1, cancelled: true, stale: false };
    const valid = train.status !== "cancelled" && train.status !== "waiting_for_departure" && train.raceDelayMinutes !== null;
    if (valid && train.raceDelayMinutes !== previousRaceDelay) position = index + 1;
    previousRaceDelay = train.raceDelayMinutes;
    return { ...train, position: valid ? position : null, cancelled: false, stale: train.status === "stale" };
  });
  const lastUpdatedAt = db.prepare("SELECT MAX(last_live_update) AS value FROM game_journeys WHERE game_id = ?").get(game.id) as { value: string | null };
  return {
    entries: rankedTrains.map((entry) => ({ ...entry, cancelled: entry.status === "cancelled", stale: entry.status === "stale" })),
    lastUpdatedAt: lastUpdatedAt.value,
    stale: rankedTrains.some((entry) => entry.status === "stale"),
  };
});

app.get<{ Querystring: { gameId?: string } }>("/api/results", async (request, reply) => {
  if (!request.query.gameId) return reply.code(400).send({ error: "GAME_ID_REQUIRED" });
  const game = getPublicGame(request.query.gameId);
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  const trains = db.prepare(`SELECT DISTINCT j.id, j.display_name AS displayName,
      j.scheduled_arrival AS scheduledArrival, j.actual_arrival AS actualArrival,
      j.final_delay_minutes AS finalDelayMinutes, j.live_status AS status, j.race_color AS raceColor FROM game_journeys j
      JOIN bets b ON b.train_id = j.id
      WHERE j.game_id = ? AND b.game_id = ? AND j.included = 1`)
    .all(game.id, game.id) as Array<{ id: string; displayName: string; scheduledArrival: string; actualArrival: string | null; finalDelayMinutes: number | null; status: string; raceColor: string | null }>;
  const updates = trains.map((train) => ({ ...train, cancelled: train.status === "cancelled", stale: train.status === "stale" }));
  if (updates.length === 0) return { status: "pending", final: false, winners: [], trains: updates };
  const final = updates.every((train) => train.status === "arrived" || train.status === "cancelled");
  if (!final) return { status: "pending", final: false, winners: [], trains: updates };
  const cancelled = updates.filter((train) => train.cancelled);
  const cancellationWins = cancelled.length > 0;
  const scored = updates.filter((train) => train.status === "arrived" && train.finalDelayMinutes !== null);
  if (!cancellationWins && scored.length === 0) return { status: "no_winner", final: true, winners: [], trains: updates };
  const maxDelayMinutes = Math.max(...scored.map((train) => train.finalDelayMinutes as number));
  const finalRanks = [...scored].sort((left, right) => (right.finalDelayMinutes as number) - (left.finalDelayMinutes as number)).map((train, index, sorted) => ({
    id: train.id,
    position: index === 0 || train.finalDelayMinutes !== sorted[index - 1].finalDelayMinutes ? index + 1 : 0,
  })).reduce((ranks, rank, index, all) => { ranks.set(rank.id, rank.position || ranks.get(all[index - 1]?.id) || index + 1); return ranks; }, new Map<string, number>());
  const winners = db.prepare(`SELECT p.id AS participantId, p.username, b.train_id AS trainId, j.display_name AS trainName, j.race_color AS raceColor FROM bets b
    JOIN participants p ON p.id = b.participant_id JOIN game_journeys j ON j.id = b.train_id WHERE b.game_id = ?`).all(game.id) as Array<{ username: string; trainId: string; trainName: string; raceColor: string | null }>;
  const winnerTrainIds = cancellationWins
    ? new Set(cancelled.map((train) => train.id))
    : new Set(scored.filter((train) => train.finalDelayMinutes === maxDelayMinutes).map((train) => train.id));
  const winnerBettors = new Map<string, string[]>();
  for (const winner of winners) if (winnerTrainIds.has(winner.trainId)) winnerBettors.set(winner.trainId, [...(winnerBettors.get(winner.trainId) ?? []), winner.username]);
  return {
    status: "finished", final: true,
    winners: winners.filter((winner) => winnerTrainIds.has(winner.trainId))
      .map((winner) => ({ ...winner, outcome: cancellationWins ? "cancellation" as const : "delay" as const, position: cancellationWins ? 1 : finalRanks.get(winner.trainId) ?? 1, delaySeconds: cancellationWins ? 0 : maxDelayMinutes * 60, bettors: winnerBettors.get(winner.trainId) ?? [winner.username] })),
    trains: updates,
  };
});
app.get("/api/trains/:id", async (request, reply) => {
  return reply.code(404).send({ error: "TRAIN_NOT_FOUND", id: (request.params as { id: string }).id });
});

app.get<{ Querystring: { gameId?: string; username?: string } }>("/api/participants/availability", async (request, reply) => {
  const username = request.query.username?.trim();
  if (!username || username.length < 2 || username.length > 24) {
    return reply.code(400).send({ error: "INVALID_USERNAME" });
  }
  if (!request.query.gameId) return reply.code(400).send({ error: "GAME_ID_REQUIRED" });
  const game = getPublicGame(request.query.gameId);
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });

  const participant = db.prepare("SELECT 1 FROM participants WHERE game_id = ? AND username = ? COLLATE NOCASE LIMIT 1")
    .get(game.id, username);
  return { available: !participant };
});

app.post<{ Body: { username?: string; gameId?: string } }>("/api/participants", async (request, reply) => {
  const username = request.body?.username?.trim();
  if (!username || username.length < 2 || username.length > 24) {
    return reply.code(400).send({ error: "INVALID_USERNAME" });
  }

  const id = crypto.randomUUID();
  if (!request.body?.gameId) return reply.code(400).send({ error: "GAME_ID_REQUIRED" });
  const activeGame = getPublicGame(request.body.gameId);
  if (!activeGame) return reply.code(409).send({ error: "GAME_NOT_AVAILABLE" });
  try {
    db.prepare("INSERT INTO participants (id, game_id, username, created_at) VALUES (?, ?, ?, ?)")
      .run(id, activeGame.id, username, new Date().toISOString());
  } catch {
    return reply.code(409).send({ error: "USERNAME_UNAVAILABLE" });
  }

  const forwardedHeader = request.headers["x-forwarded-proto"];
  const forwardedProtocol = (Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader)?.split(",")[0]?.trim();
  const requestProtocol = forwardedProtocol || request.protocol;
  reply.setCookie("participant_id", id, { httpOnly: true, sameSite: "lax", secure: requestProtocol === "https", path: "/" });
  return { participantId: id, username };
});

app.get<{ Querystring: { gameId?: string } }>("/api/participants/me", async (request, reply) => {
  const participantId = request.cookies.participant_id;
  if (!request.query.gameId) return reply.code(400).send({ error: "GAME_ID_REQUIRED" });
  const game = getPublicGame(request.query.gameId);
  if (!participantId || !game) return reply.code(404).send({ error: "PARTICIPANT_NOT_FOUND" });
  const participant = db.prepare(`SELECT p.id AS participantId, p.username, b.train_id AS trainId
    FROM participants p JOIN bets b ON b.participant_id = p.id
    WHERE p.id = ? AND b.game_id = ?`).get(participantId, game.id) as {
      participantId: string; username: string; trainId: string;
    } | undefined;
  if (!participant) return reply.code(404).send({ error: "BET_NOT_FOUND" });
  return { ...participant, hasBet: true };
});

app.post<{ Body: { trainId?: string; gameId?: string } }>("/api/bets", async (request, reply) => {
  const participantId = request.cookies.participant_id;
  const trainId = request.body?.trainId;
  if (!participantId || !trainId) return reply.code(400).send({ error: "PARTICIPANT_AND_TRAIN_REQUIRED" });
  if (!request.body?.gameId) return reply.code(400).send({ error: "GAME_ID_REQUIRED" });
  const activeGame = getPublicGame(request.body.gameId);
  if (!activeGame) return reply.code(409).send({ error: "GAME_NOT_AVAILABLE" });
  const train = db.prepare("SELECT 1 FROM game_journeys WHERE id = ? AND game_id = ? AND included = 1")
    .get(trainId, activeGame.id);
  if (!train) return reply.code(400).send({ error: "TRAIN_NOT_AVAILABLE" });
  if (!db.prepare("SELECT 1 FROM participants WHERE id = ? AND game_id = ?").get(participantId, activeGame.id)) {
    return reply.code(409).send({ error: "PARTICIPANT_GAME_MISMATCH" });
  }
  if (db.prepare("SELECT 1 FROM bets WHERE participant_id = ? AND game_id = ?").get(participantId, activeGame.id)) {
    return reply.code(409).send({ error: "BET_ALREADY_SUBMITTED" });
  }
  db.prepare("INSERT INTO bets (id, game_id, participant_id, train_id, submitted_at) VALUES (?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), activeGame.id, participantId, trainId, new Date().toISOString());
  return reply.code(201).send({ ok: true, trainId });
});

await app.listen({ host: "0.0.0.0", port });
