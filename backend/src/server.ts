import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { normalizeCandidate, type MotisStopTime, type Candidate } from "./journey-filter.js";

const port = config.port;
const databasePath = config.databasePath;
const motisHeaders = {
  Accept: "application/json",
  "User-Agent": "42SommerfestTrainBet/0.1",
};
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
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    scheduled_departure TEXT NOT NULL,
    scheduled_arrival TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    origin_stop_id TEXT,
    realtime INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'candidate',
    included INTEGER NOT NULL DEFAULT 0,
    exclusion_reason TEXT,
    route_json TEXT,
    geometry TEXT,
    actual_arrival TEXT,
    delay_seconds INTEGER,
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
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_game_journeys_game_id ON game_journeys(game_id);
  CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id);
`);

const columns = (table: string) => new Set(
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name),
);

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
if (!columns("game_journeys").has("actual_arrival")) db.exec("ALTER TABLE game_journeys ADD COLUMN actual_arrival TEXT");
if (!columns("game_journeys").has("delay_seconds")) db.exec("ALTER TABLE game_journeys ADD COLUMN delay_seconds INTEGER");
if (!columns("game_journeys").has("live_status")) db.exec("ALTER TABLE game_journeys ADD COLUMN live_status TEXT NOT NULL DEFAULT 'waiting'");
if (!columns("game_journeys").has("last_live_update")) db.exec("ALTER TABLE game_journeys ADD COLUMN last_live_update TEXT");
if (!columns("game_journeys").has("live_error")) db.exec("ALTER TABLE game_journeys ADD COLUMN live_error TEXT");
db.exec("CREATE INDEX IF NOT EXISTS idx_participants_game_id ON participants(game_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_bets_game_id ON bets(game_id)");
db.exec(`UPDATE participants SET game_id = (SELECT id FROM games WHERE status = 'active' LIMIT 1) WHERE game_id IS NULL`);
db.exec(`UPDATE bets SET game_id = (SELECT id FROM participants WHERE participants.id = bets.participant_id) WHERE game_id IS NULL`);

const app = Fastify({ logger: true });
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

type StationCacheEntry = {
  stopTimes: MotisStopTime[];
  fetchedAt: string;
  expiresAt: number;
};

const stationCache = new Map<string, StationCacheEntry>();

const fetchStationDepartures = async (stopId: string, startTime: string, endTime: string): Promise<{ stopTimes: MotisStopTime[]; stale: boolean; fetchedAt: string }> => {
  const cacheKey = `${stopId}|${startTime}|${endTime}`;
  const cached = stationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { stopTimes: cached.stopTimes, stale: false, fetchedAt: cached.fetchedAt };
  }

  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const url = new URL("/api/v6/stoptimes", config.motisBaseUrl);
  url.searchParams.set("stopId", stopId);
  url.searchParams.set("time", startTime);
  url.searchParams.set("window", String(Math.ceil((end - start) / 1000)));
  url.searchParams.set("direction", "LATER");
  url.searchParams.set("mode", "REGIONAL_RAIL");
  url.searchParams.set("fetchStops", "true");
  url.searchParams.set("withScheduledSkippedStops", "false");

  try {
    const response = await fetch(url, { headers: motisHeaders });
    if (!response.ok) throw new Error(`MOTIS stoptimes failed for ${stopId}: ${response.status}`);
    const body = await response.json() as { stopTimes?: MotisStopTime[] };
    const fetchedAt = new Date().toISOString();
    const entry = {
      stopTimes: body.stopTimes ?? [],
      fetchedAt,
      expiresAt: Date.now() + config.cacheTtlSeconds * 1000,
    };
    stationCache.set(cacheKey, entry);
    return { stopTimes: entry.stopTimes, stale: false, fetchedAt };
  } catch (error) {
    if (cached) return { stopTimes: cached.stopTimes, stale: true, fetchedAt: cached.fetchedAt };
    throw error;
  }
};

const fetchGameJourneys = async (gameId: string, stopIds: string[], startTime: string, endTime: string) => {
  const fetchedAt = new Date().toISOString();
  const stationResults = await Promise.allSettled(
    stopIds.map((stopId) => fetchStationDepartures(stopId, startTime, endTime)),
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
  const insert = db.prepare(`
    INSERT OR REPLACE INTO game_journeys (
      id, game_id, external_trip_id, display_name, origin, destination,
      scheduled_departure, scheduled_arrival, duration_seconds, origin_stop_id,
      realtime, status, included, exclusion_reason, route_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `);
  const save = db.transaction(() => {
    db.prepare("DELETE FROM game_journeys WHERE game_id = ?").run(gameId);
    for (const row of rows) {
      insert.run(
        crypto.randomUUID(), gameId, row.externalTripId, row.displayName, row.origin,
        row.destination, row.scheduledDeparture, row.scheduledArrival, row.durationSeconds,
        row.originStopId, row.realtime ? 1 : 0, row.status, row.exclusionReason, row.routeJson, fetchedAt,
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
    candidates: eligibleRows,
    fetchedCount: rows.length,
    includedCount: 0,
    excludedCount: rows.length - eligibleRows.length,
    stale: stale || stationErrors.length > 0,
  };
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
  const name = body.name?.trim() || "Train Bet";
  const eventDate = body.eventDate?.trim() || "";
  const bettingStart = body.bettingStart?.trim() || `${eventDate}T17:00:00+02:00`;
  const bettingEnd = body.bettingEnd?.trim() || `${eventDate}T18:00:00+02:00`;
  const journeyDepartureStart = body.journeyDepartureStart?.trim() || `${eventDate}T17:00:00+02:00`;
  const journeyDepartureEnd = body.journeyDepartureEnd?.trim() || `${eventDate}T17:30:00+02:00`;
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
    },
  });
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
    return reply.code(502).send({ error: "MOTIS_JOURNEY_FETCH_FAILED" });
  }
});

app.get<{ Params: { id: string } }>("/api/admin/games/:id", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;

  const game = db.prepare(`
    SELECT id, name, event_date, timezone, betting_start, betting_end,
      journey_departure_start, journey_departure_end, stop_ids_json,
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
    stop_ids_json: string;
    status: string;
    created_at: string;
    updated_at: string;
    activated_at: string | null;
  } | undefined;

  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });

  const journeys = db.prepare(`
    SELECT id, external_trip_id AS externalTripId, display_name AS displayName,
      origin, destination, scheduled_departure AS scheduledDeparture,
      scheduled_arrival AS scheduledArrival, duration_seconds AS durationSeconds,
      origin_stop_id AS originStopId, realtime, status, included, exclusion_reason AS exclusionReason,
      created_at AS createdAt
    FROM game_journeys
    WHERE game_id = ?
    ORDER BY duration_seconds DESC, scheduled_departure ASC
  `).all(game.id);

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
      stopIds: JSON.parse(game.stop_ids_json),
      status: game.status,
      createdAt: game.created_at,
      updatedAt: game.updated_at,
      activatedAt: game.activated_at,
    },
    journeys,
    counts: {
      fetched: journeyCounts.total,
      included: journeyCounts.included ?? 0,
      excluded: journeyCounts.excluded ?? 0,
    },
    events,
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

  const selected = db.prepare("SELECT COUNT(*) AS count FROM game_journeys WHERE game_id = ? AND included = 1")
    .get(game.id) as { count: number };
  if (selected.count < 1) return reply.code(400).send({ error: "NO_JOURNEYS_SELECTED" });

  const now = new Date().toISOString();
  const confirm = db.transaction(() => {
    db.prepare("UPDATE games SET status = 'active', activated_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, game.id);
    db.prepare(`INSERT INTO game_events (id, game_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), game.id, "game_confirmed", JSON.stringify({ selectedCount: selected.count }), now);
  });
  confirm();

  return { gameId: game.id, status: "active", selectedCount: selected.count, activatedAt: now };
});

app.get<{ Querystring: { text?: string } }>("/api/admin/stations/search", async (request, reply) => {
  if (!requireAdmin(request, reply)) return;

  const text = request.query.text?.trim();
  if (!text || text.length < 2) {
    return reply.code(400).send({ error: "SEARCH_TEXT_REQUIRED" });
  }

  const url = new URL("/api/v1/geocode", config.motisBaseUrl);
  url.searchParams.set("text", text);
  url.searchParams.set("type", "STOP");

  try {
    const response = await fetch(url, { headers: motisHeaders });
    if (!response.ok) {
      const body = await response.text();
      request.log.warn({
        upstreamStatus: response.status,
        upstreamBody: body.slice(0, 500),
        url: url.toString(),
      }, "MOTIS location search returned an error");
      return reply.code(502).send({ error: "MOTIS_LOCATION_SEARCH_FAILED" });
    }

    const payload = await response.json() as Array<{
      type?: string;
      id?: string;
      name?: string;
      lat?: number;
      lon?: number;
    }> | { places?: Array<{
      type?: string;
      id?: string;
      name?: string;
      lat?: number;
      lon?: number;
    }> };
    const matches = Array.isArray(payload) ? payload : payload.places ?? [];

    return matches
      .filter((match) => match.type === "STOP" && match.id && match.name)
      .map((match) => ({
        stopId: match.id,
        name: match.name,
        lat: match.lat ?? null,
        lon: match.lon ?? null,
      }));
  } catch (error) {
    request.log.error({ err: error, url: url.toString() }, "MOTIS location search is unavailable");
    return reply.code(502).send({ error: "MOTIS_LOCATION_SEARCH_UNAVAILABLE" });
  }
});

type GameRow = {
  id: string;
  name: string;
  event_date: string;
  timezone: string;
  betting_start: string;
  betting_end: string;
  status: string;
};

const getGameById = (id: string) => db.prepare(`
  SELECT id, name, event_date, timezone, betting_start, betting_end, status
  FROM games WHERE id = ?
`).get(id) as {
  id: string; name: string; event_date: string; timezone: string;
  betting_start: string; betting_end: string; status: string;
} | undefined;

const getPublicGame = (id: string) => {
  const game = getGameById(id);
  return game && game.status !== "draft" ? game : undefined;
};

app.get<{ Params: { id: string } }>("/api/games/:id", async (request, reply) => {
  const game = getPublicGame(request.params.id);
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  return { game: { id: game.id, name: game.name, eventDate: game.event_date, timezone: game.timezone, bettingStart: game.betting_start, bettingEnd: game.betting_end, status: game.status } };
});

app.get<{ Querystring: { gameId?: string } }>("/api/trains", async (request, reply) => {
  if (!request.query.gameId) return reply.code(400).send({ error: "GAME_ID_REQUIRED" });
  const game = getPublicGame(request.query.gameId);
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });

  const trains = db.prepare(`
    SELECT id, external_trip_id AS externalTripId, display_name AS displayName,
      origin, destination, scheduled_departure AS scheduledDeparture,
      scheduled_arrival AS scheduledArrival, duration_seconds AS durationSeconds,
      origin_stop_id AS originStopId, geometry, route_json AS routeJson,
      status, realtime, actual_arrival AS actualArrival, delay_seconds AS delaySeconds,
      live_status AS liveStatus, live_error AS liveError
    FROM game_journeys
    WHERE game_id = ? AND included = 1
    ORDER BY scheduled_departure ASC
  `).all(game.id);
  return { trains, lastUpdatedAt: null, stale: false };
});
type LiveTrip = { legs?: Array<{
  from?: { name?: string; lat?: number; lon?: number };
  to?: { name?: string; lat?: number; lon?: number; arrival?: string; scheduledArrival?: string };
  legGeometry?: { points?: string };
  cancelled?: boolean;
}> };

const fetchLiveTrip = async (tripId: string): Promise<{ actualArrival: string | null; arrived: boolean; cancelled: boolean; geometry: string | null; endpoints: string | null }> => {
  const url = new URL("/api/v6/trip", config.motisBaseUrl);
  url.searchParams.set("tripId", tripId);
  const response = await fetch(url, { headers: motisHeaders });
  if (!response.ok) throw new Error(`MOTIS trip failed: ${response.status}`);
  const trip = await response.json() as LiveTrip;
  const finalLeg = trip.legs?.at(-1);
  const arrival = finalLeg?.to?.arrival ?? null;
  const arrived = arrival !== null && Number.isFinite(Date.parse(arrival)) && Date.parse(arrival) <= Date.now();
  const geometry = trip.legs?.map((leg) => leg.legGeometry?.points).filter((points): points is string => Boolean(points)) ?? [];
  const firstLeg = trip.legs?.[0];
  const endpoints = firstLeg?.from && finalLeg?.to
    ? JSON.stringify([{ name: firstLeg.from.name, lat: firstLeg.from.lat, lon: firstLeg.from.lon }, { name: finalLeg.to.name, lat: finalLeg.to.lat, lon: finalLeg.to.lon }])
    : null;
  return { actualArrival: arrival, arrived, cancelled: finalLeg?.cancelled === true, geometry: geometry.length ? JSON.stringify(geometry) : null, endpoints };
};

let progressRefreshRunning = false;

const refreshGameProgress = async (game: GameRow) => {
  const rows = db.prepare(`SELECT DISTINCT j.id, j.external_trip_id AS tripId,
    j.scheduled_arrival AS scheduledArrival, j.scheduled_departure AS scheduledDeparture
    FROM game_journeys j
    WHERE j.game_id = ? AND j.included = 1`)
    .all(game.id) as Array<{ id: string; tripId: string; scheduledArrival: string; scheduledDeparture: string }>;
  const results = await Promise.allSettled(rows.map((row) => fetchLiveTrip(row.tripId)));
  const fetchedAt = new Date().toISOString();
  const updates = rows.map((row, index) => {
    const result = results[index];
    if (result.status === "rejected") return { id: row.id, actualArrival: null, delaySeconds: null, geometry: null, endpoints: null, status: "stale", error: result.reason instanceof Error ? result.reason.message : "MOTIS request failed" };
    const actualTimestamp = result.value.actualArrival ? Date.parse(result.value.actualArrival) : NaN;
    const scheduledTimestamp = Date.parse(row.scheduledArrival);
    const delaySeconds = Number.isFinite(actualTimestamp) && Number.isFinite(scheduledTimestamp)
      ? Math.round((actualTimestamp - scheduledTimestamp) / 1000) : null;
    const departureHasPassed = Number.isFinite(Date.parse(row.scheduledDeparture)) && Date.parse(row.scheduledDeparture) <= Date.now();
    return { id: row.id, actualArrival: result.value.actualArrival, delaySeconds, geometry: result.value.geometry, endpoints: result.value.endpoints,
      status: result.value.cancelled ? "cancelled" : result.value.arrived ? "arrived" : departureHasPassed ? "in_progress" : "waiting_for_departure", error: null };
  });
  db.transaction(() => {
    const update = db.prepare(`UPDATE game_journeys SET actual_arrival = ?, delay_seconds = ?,
      live_status = ?, last_live_update = ?, live_error = ?, geometry = COALESCE(?, geometry),
      route_json = COALESCE(?, route_json) WHERE id = ? AND game_id = ?`);
    for (const updateRow of updates) update.run(updateRow.actualArrival, updateRow.delaySeconds, updateRow.status, fetchedAt, updateRow.error, updateRow.geometry, updateRow.endpoints, updateRow.id, game.id);
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
    j.delay_seconds AS delaySeconds, j.live_status AS status,
    j.geometry, j.route_json AS routeJson,
    j.last_live_update AS lastUpdatedAt, j.live_error AS error
    FROM game_journeys j JOIN bets b ON b.train_id = j.id
    WHERE j.game_id = ? AND b.game_id = ? AND j.included = 1 ORDER BY j.scheduled_departure ASC`)
    .all(game.id, game.id) as Array<{ status: string }>;
  const progressTrains = trains.map((train) => ({
      ...train,
      cancelled: train.status === "cancelled",
      stale: train.status === "stale",
    }));
  const lastUpdatedAt = db.prepare(`SELECT MAX(last_live_update) AS value FROM game_journeys WHERE game_id = ?`).get(game.id) as { value: string | null };
  return { trains: progressTrains, lastUpdatedAt: lastUpdatedAt.value, stale: progressTrains.some((train) => train.status === "stale") };
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
      j.actual_arrival AS actualArrival, j.delay_seconds AS delaySeconds, j.live_status AS status
    FROM bets b JOIN participants p ON p.id = b.participant_id
    JOIN game_journeys j ON j.id = b.train_id
    WHERE b.game_id = ? AND j.game_id = ? AND j.included = 1`)
    .all(game.id, game.id) as Array<{ participantId: string; username: string; trainId: string; displayName: string; origin: string; destination: string; scheduledDeparture: string; scheduledArrival: string; durationSeconds: number; actualArrival: string | null; delaySeconds: number | null; status: string }>;
  ranked.sort((a, b) => (b.delaySeconds ?? -Infinity) - (a.delaySeconds ?? -Infinity));
  const trains = [...new Map(ranked.map((entry) => [entry.trainId, {
    trainId: entry.trainId, displayName: entry.displayName, origin: entry.origin, destination: entry.destination,
    scheduledDeparture: entry.scheduledDeparture, scheduledArrival: entry.scheduledArrival, durationSeconds: entry.durationSeconds,
    actualArrival: entry.actualArrival, delaySeconds: entry.delaySeconds, status: entry.status,
    bettors: [] as Array<{ participantId: string; username: string }>,
  }])).values()];
  for (const entry of ranked) trains.find((train) => train.trainId === entry.trainId)?.bettors.push({ participantId: entry.participantId, username: entry.username });
  let previousDelay: number | null = null;
  let position = 0;
  const entries = trains.map((entry, index) => {
    if (entry.delaySeconds !== null && entry.delaySeconds !== previousDelay) position = index + 1;
    previousDelay = entry.delaySeconds;
    return { ...entry, position: entry.delaySeconds === null ? null : position };
  });
  const lastUpdatedAt = db.prepare("SELECT MAX(last_live_update) AS value FROM game_journeys WHERE game_id = ?").get(game.id) as { value: string | null };
  return {
    entries: entries.map((entry) => ({ ...entry, cancelled: entry.status === "cancelled", stale: entry.status === "stale" })),
    lastUpdatedAt: lastUpdatedAt.value,
    stale: entries.some((entry) => entry.status === "stale"),
  };
});

app.get<{ Querystring: { gameId?: string } }>("/api/results", async (request, reply) => {
  if (!request.query.gameId) return reply.code(400).send({ error: "GAME_ID_REQUIRED" });
  const game = getPublicGame(request.query.gameId);
  if (!game) return reply.code(404).send({ error: "GAME_NOT_FOUND" });
  const trains = db.prepare(`SELECT DISTINCT j.id, j.display_name AS displayName,
      j.scheduled_arrival AS scheduledArrival, j.actual_arrival AS actualArrival,
      j.delay_seconds AS delaySeconds, j.live_status AS status FROM game_journeys j
      JOIN bets b ON b.train_id = j.id
      WHERE j.game_id = ? AND b.game_id = ? AND j.included = 1`)
    .all(game.id, game.id) as Array<{ id: string; displayName: string; scheduledArrival: string; actualArrival: string | null; delaySeconds: number | null; status: string }>;
  const updates = trains.map((train) => ({ ...train, cancelled: train.status === "cancelled", stale: train.status === "stale" }));
  if (updates.length === 0) return { status: "pending", final: false, winners: [], trains: updates };
  const final = updates.every((train) => train.status === "arrived" || train.status === "cancelled");
  if (!final) return { status: "pending", final: false, winners: [], trains: updates };
  const scored = updates.filter((train) => train.status === "arrived" && train.delaySeconds !== null);
  if (scored.length === 0) return { status: "no_winner", final: true, winners: [], trains: updates };
  const maxDelay = Math.max(...scored.map((train) => train.delaySeconds as number));
  const winners = db.prepare(`SELECT p.id AS participantId, p.username, b.train_id AS trainId FROM bets b
    JOIN participants p ON p.id = b.participant_id WHERE b.game_id = ?`).all(game.id) as Array<{ username: string; trainId: string }>;
  return {
    status: "finished", final: true,
    winners: winners.filter((winner) => scored.some((train) => train.id === winner.trainId && train.delaySeconds === maxDelay))
      .map((winner) => ({ ...winner, delaySeconds: maxDelay })),
    trains: updates,
  };
});
app.get("/api/trains/:id", async (request, reply) => {
  return reply.code(404).send({ error: "TRAIN_NOT_FOUND", id: (request.params as { id: string }).id });
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
