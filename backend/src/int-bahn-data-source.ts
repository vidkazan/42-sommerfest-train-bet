import type { MotisStopTime } from "./journey-filter.js";
import type { LiveTripResult, StationDeparturesResult, StationSearchResult, TransitDataSource, TransitRequestFailure } from "./transit-data-source.js";
import { createTransitRequestQueue, type TransitRequestQueue } from "./transit-request-queue.js";
import { TransitDataSourceError } from "./transit-data-source.js";

type DbDeparture = {
  bahnhofsId?: string;
  zeit?: string;
  ezZeit?: string;
  gleis?: string;
  ezGleis?: string;
  journeyId?: string;
  terminus?: string;
  verkehrmittel?: { name?: string; kurzText?: string; mittelText?: string; langText?: string; produktGattung?: string; linienNummer?: string };
  meldungen?: Array<{ ueberschrift?: string; text?: string }>;
};

type DbLocation = {
  extId?: string;
  id?: string;
  lat?: number;
  lon?: number;
  name?: string;
  products?: string[];
  type?: string;
};

type DbSection = {
  abfahrtsOrt?: string;
  ankunftsOrt?: string;
  abfahrt?: { sollzeit?: string; echtzeit?: string };
  ankunft?: { sollzeit?: string; echtzeit?: string };
  destinationCancelled?: boolean;
  originCancelled?: boolean;
  halte?: Array<{ name?: string; abfahrt?: { sollzeit?: string; echtzeit?: string }; ankunft?: { sollzeit?: string; echtzeit?: string }; gleis?: string; ezGleis?: string }>;
  verkehrsmittel?: { name?: string; mittelText?: string; linienNummer?: string; produktGattung?: string };
};

type DbHalt = {
  name?: string;
  extId?: string;
  abfahrt?: { sollzeit?: string; echtzeit?: string };
  ankunft?: { sollzeit?: string; echtzeit?: string };
  destinationCancelled?: boolean;
  originCancelled?: boolean;
};

type DbTrip = {
  verbindungen?: Array<{ verbindungsAbschnitte?: DbSection[] }>;
  halte?: DbHalt[];
  abfahrt?: { sollzeit?: string; echtzeit?: string };
  ankunft?: { sollzeit?: string; echtzeit?: string };
  cancelled?: boolean;
};

const displayName = (transport?: DbDeparture["verkehrmittel"]) => transport?.mittelText ?? transport?.name ?? transport?.langText ?? transport?.kurzText;

const berlinDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

const berlinParts = (timestamp: number): Record<string, string> =>
  Object.fromEntries(berlinDateFormatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));

const berlinLocalTimestamp = (value?: string): string | undefined => {
  if (!value) return value;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
  if (!match) return value;
  const wallTimestamp = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(wallTimestamp)) return value;
  const parts = berlinParts(wallTimestamp);
  const formattedAsUtc = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  const offsetMinutes = Math.round((formattedAsUtc - wallTimestamp) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  return `${match[1]}${sign}${String(Math.floor(absoluteMinutes / 60)).padStart(2, "0")}:${String(absoluteMinutes % 60).padStart(2, "0")}`;
};

const dateParts = (value: string) => {
  const berlinValue = berlinLocalTimestamp(value) ?? value;
  const date = new Date(berlinValue);
  if (Number.isNaN(date.getTime())) return { date: value.slice(0, 10), time: "00:00:00" };
  const parts = berlinParts(date.getTime());
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
};

export const createIntBahnDataSource = (options: { baseUrl: string; cacheTtlSeconds: number; fetchImpl?: typeof fetch; userAgent: string; requestQueue?: TransitRequestQueue; requestDelayMs?: number; maxRetries?: number; logFailure?: (failure: TransitRequestFailure) => void }): TransitDataSource => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = { Accept: "application/json", "User-Agent": options.userAgent };
  const requestQueue = options.requestQueue ?? createTransitRequestQueue({ delayMs: options.requestDelayMs });
  const maxRetries = options.maxRetries ?? 3;
  const cache = new Map<string, { result: StationDeparturesResult; expiresAt: number }>();

  const requestJson = async <T>(url: URL): Promise<T> => {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const startedAt = Date.now();
      let result: { status: number; headers: Headers; body: string };
      try {
        result = await requestQueue.enqueue(async () => {
          const response = await fetchImpl(url, { headers });
          return { status: response.status, headers: response.headers, body: await response.text() };
        });
      } catch (error) {
        options.logFailure?.({ provider: "int-bahn", url: url.toString(), attempt: attempt + 1, maxRetries, elapsedMs: Date.now() - startedAt, kind: "network", message: error instanceof Error ? error.message : "int.bahn.de request failed", final: true });
        throw new TransitDataSourceError(error instanceof Error ? error.message : "int.bahn.de request failed", undefined, url.toString());
      }
      const isRateLimited = result.status === 429;
      const isFinal = !isRateLimited || attempt >= maxRetries;
      if (result.status < 200 || result.status >= 300) {
        options.logFailure?.({ provider: "int-bahn", url: url.toString(), status: result.status, attempt: attempt + 1, maxRetries, elapsedMs: Date.now() - startedAt, kind: "http", message: `int.bahn.de request failed: ${result.status}`, responseBody: result.body.slice(0, 200), final: isFinal });
      }
      if (isRateLimited && attempt < maxRetries) {
        const retryAfter = Number(result.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (result.status < 200 || result.status >= 300) {
        throw new TransitDataSourceError(`int.bahn.de request failed: ${result.status} ${result.body.slice(0, 200)}`, result.status, url.toString());
      }
      try {
        return JSON.parse(result.body) as T;
      } catch (error) {
        options.logFailure?.({ provider: "int-bahn", url: url.toString(), status: result.status, attempt: attempt + 1, maxRetries, elapsedMs: Date.now() - startedAt, kind: "parse", message: error instanceof Error ? error.message : "Invalid int.bahn.de response", responseBody: result.body.slice(0, 200), final: true });
        throw new TransitDataSourceError(error instanceof Error ? error.message : "Invalid int.bahn.de response", result.status, url.toString());
      }
    }
    throw new TransitDataSourceError("int.bahn.de request failed", undefined, url.toString());
  };

  const getLiveTrip = async (tripId: string): Promise<LiveTripResult> => {
    const url = new URL("/web/api/reiseloesung/fahrt", options.baseUrl);
    url.searchParams.set("journeyId", tripId);
    const body = await requestJson<DbTrip>(url);
    const sections = body.verbindungen?.[0]?.verbindungsAbschnitte ?? [];
    const firstSection = sections[0];
    const lastSection = sections.at(-1);
    const firstHalt = body.halte?.[0];
    const lastHalt = body.halte?.at(-1);
    const scheduledArrival = berlinLocalTimestamp(body.ankunft?.sollzeit ?? lastHalt?.ankunft?.sollzeit ?? lastSection?.ankunft?.sollzeit) ?? null;
    const scheduledDeparture = berlinLocalTimestamp(body.abfahrt?.sollzeit ?? firstHalt?.abfahrt?.sollzeit ?? firstSection?.abfahrt?.sollzeit) ?? null;
    const actualArrival = berlinLocalTimestamp(body.ankunft?.echtzeit ?? lastHalt?.ankunft?.echtzeit ?? lastSection?.ankunft?.echtzeit) ?? null;
    const actualDeparture = berlinLocalTimestamp(body.abfahrt?.echtzeit ?? firstHalt?.abfahrt?.echtzeit ?? firstSection?.abfahrt?.echtzeit) ?? null;
    const departureDelayMinutes = actualDeparture && scheduledDeparture ? Math.round((Date.parse(actualDeparture) - Date.parse(scheduledDeparture)) / 60000) : null;
    const currentHalt = [...(body.halte ?? [])].reverse().find((halt) => halt.ankunft?.echtzeit || halt.abfahrt?.echtzeit);
    const currentActual = berlinLocalTimestamp(currentHalt?.ankunft?.echtzeit ?? currentHalt?.abfahrt?.echtzeit) ?? null;
    const currentScheduled = berlinLocalTimestamp(currentHalt?.ankunft?.sollzeit ?? currentHalt?.abfahrt?.sollzeit) ?? null;
    const currentDelayMinutes = currentActual && currentScheduled ? Math.round((Date.parse(currentActual) - Date.parse(currentScheduled)) / 60000) : null;
    const arrived = Boolean(actualArrival && Date.parse(actualArrival) <= Date.now());
    const origin = firstHalt?.name ?? firstSection?.abfahrtsOrt ?? null;
    const destination = lastHalt?.name ?? lastSection?.ankunftsOrt ?? null;
    const endpoints = origin && destination
      ? JSON.stringify([{ name: origin }, { name: destination }])
      : null;
    return {
      actualArrival,
      actualDeparture,
      currentDelayMinutes,
      departureDelayMinutes,
      scheduledArrival,
      scheduledDeparture,
      stopCount: body.halte ? Math.max(0, body.halte.length - 2) : null,
      origin,
      destination,
      arrived,
      cancelled: body.cancelled === true || Boolean(
        sections.some((section) => section.destinationCancelled || section.originCancelled)
        || body.halte?.some((halt) => halt.destinationCancelled || halt.originCancelled),
      ),
      geometry: null,
      endpoints,
      alerts: [],
    };
  };

  return {
    async getStationDepartures(stopId, startTime) {
      const cached = cache.get(`${stopId}|${startTime}`);
      if (cached && cached.expiresAt > Date.now()) return cached.result;
      const parts = dateParts(startTime);
      const url = new URL("/web/api/reiseloesung/abfahrten", options.baseUrl);
      url.searchParams.set("ortId", stopId);
      url.searchParams.set("zeit", parts.time);
      url.searchParams.set("datum", parts.date);
      url.searchParams.set("mitVias", "false");
      const body = await requestJson<{ entries?: DbDeparture[] }>(url);
      // The DB endpoint returns buses and other products as well. Only fetch
      // full journey details for regional RE services; the departure response
      // itself does not contain the final scheduled arrival.
      const entries = (body.entries ?? []).filter((entry) => {
        const name = displayName(entry.verkehrmittel)?.toUpperCase() ?? "";
        return entry.journeyId && entry.zeit && entry.verkehrmittel?.produktGattung === "REGIONAL" && name.startsWith("RE");
      });
      const stopTimes = (await Promise.all(entries.map(async (entry): Promise<MotisStopTime | null> => {
        try {
          const detail = await getLiveTrip(entry.journeyId!);
          const destination = detail.destination ?? entry.terminus;
          const scheduledArrival = detail.scheduledArrival;
          if (!scheduledArrival) return null;
          const cancelledByMessage = entry.meldungen?.some((message) => /cancel|ausfall|entfällt/i.test(`${message.ueberschrift ?? ""} ${message.text ?? ""}`)) ?? false;
          return {
            tripId: entry.journeyId,
            displayName: displayName(entry.verkehrmittel),
            mode: "REGIONAL_RAIL",
            realTime: Boolean(entry.ezZeit),
            place: { name: undefined, scheduledDeparture: berlinLocalTimestamp(entry.zeit) },
            tripFrom: { name: detail.origin ?? undefined, stopId },
            tripTo: { name: destination ?? undefined, scheduledArrival },
            stopCount: detail.stopCount,
            cancelled: cancelledByMessage || detail.cancelled,
            tripCancelled: detail.cancelled,
          };
        } catch {
          // One unavailable journey must not hide all other departures.
          return null;
        }
      }))).filter((stopTime): stopTime is MotisStopTime => stopTime !== null);
      const result = { stopTimes, stale: false, fetchedAt: new Date().toISOString() };
      cache.set(`${stopId}|${startTime}`, { result, expiresAt: Date.now() + options.cacheTtlSeconds * 1000 });
      return result;
    },

    async searchStations(text): Promise<StationSearchResult[]> {
      const url = new URL("/web/api/reiseloesung/orte", options.baseUrl);
      url.searchParams.set("suchbegriff", text);
      url.searchParams.set("typ", "ALL");
      url.searchParams.set("limit", "10");
      const payload = await requestJson<DbLocation[]>(url);
      return payload.flatMap((place) => {
        const stopId = place.id ?? place.extId;
        return stopId && place.name ? [{ stopId, name: place.name, lat: place.lat ?? null, lon: place.lon ?? null }] : [];
      });
    },

    getLiveTrip,
  };
};
