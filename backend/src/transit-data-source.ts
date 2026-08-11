import type { MotisStopTime } from "./journey-filter.js";
import { createTransitRequestQueue, type TransitRequestQueue } from "./transit-request-queue.js";

export type StationSearchResult = {
  stopId: string;
  name: string;
  lat: number | null;
  lon: number | null;
};

export type StationDeparturesResult = {
  stopTimes: MotisStopTime[];
  stale: boolean;
  fetchedAt: string;
};

export type LiveTripResult = {
  actualArrival: string | null;
  actualDeparture?: string | null;
  currentDelayMinutes?: number | null;
  departureDelayMinutes?: number | null;
  scheduledArrival?: string | null;
  scheduledDeparture?: string | null;
  stopCount?: number | null;
  origin?: string | null;
  destination?: string | null;
  arrived: boolean;
  cancelled: boolean;
  geometry: string | null;
  endpoints: string | null;
};

export type TransitDataSource = {
  getStationDepartures: (stopId: string, startTime: string, endTime: string) => Promise<StationDeparturesResult>;
  searchStations: (text: string) => Promise<StationSearchResult[]>;
  getLiveTrip: (tripId: string) => Promise<LiveTripResult>;
};

export type TransitRequestFailure = {
  provider: "motis" | "int-bahn";
  url: string;
  status?: number;
  attempt: number;
  maxRetries: number;
  elapsedMs: number;
  kind: "http" | "network" | "parse";
  message: string;
  responseBody?: string;
  final: boolean;
};

type MotisResponse = Array<{
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

type LiveTrip = { legs?: Array<{
  from?: { name?: string; lat?: number; lon?: number; scheduledDeparture?: string; departure?: string };
  to?: { name?: string; lat?: number; lon?: number; arrival?: string; scheduledArrival?: string };
  legGeometry?: { points?: string };
  cancelled?: boolean;
}> };

export class TransitDataSourceError extends Error {
  constructor(message: string, public readonly status?: number, public readonly url?: string) {
    super(message);
    this.name = "TransitDataSourceError";
  }
}

export const createMotisDataSource = (options: {
  baseUrl: string;
  cacheTtlSeconds: number;
  fetchImpl?: typeof fetch;
  userAgent: string;
  requestQueue?: TransitRequestQueue;
  requestDelayMs?: number;
  maxRetries?: number;
  logFailure?: (failure: TransitRequestFailure) => void;
}): TransitDataSource => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = { Accept: "application/json", "User-Agent": options.userAgent };
  const requestQueue = options.requestQueue ?? createTransitRequestQueue({ delayMs: options.requestDelayMs });
  const maxRetries = options.maxRetries ?? 3;
  const stationCache = new Map<string, { stopTimes: MotisStopTime[]; fetchedAt: string; expiresAt: number }>();

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
        options.logFailure?.({ provider: "motis", url: url.toString(), attempt: attempt + 1, maxRetries, elapsedMs: Date.now() - startedAt, kind: "network", message: error instanceof Error ? error.message : "Transit API request failed", final: true });
        throw new TransitDataSourceError(error instanceof Error ? error.message : "Transit API request failed", undefined, url.toString());
      }
      const isRateLimited = result.status === 429;
      const isFinal = !isRateLimited || attempt >= maxRetries;
      if (result.status < 200 || result.status >= 300) {
        options.logFailure?.({ provider: "motis", url: url.toString(), status: result.status, attempt: attempt + 1, maxRetries, elapsedMs: Date.now() - startedAt, kind: "http", message: `Transit API request failed: ${result.status}`, responseBody: result.body.slice(0, 200), final: isFinal });
      }
      if (isRateLimited && attempt < maxRetries) {
        const retryAfter = Number(result.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (result.status < 200 || result.status >= 300) {
        throw new TransitDataSourceError(`Transit API request failed: ${result.status} ${result.body.slice(0, 200)}`, result.status, url.toString());
      }
      try {
        return JSON.parse(result.body) as T;
      } catch (error) {
        options.logFailure?.({ provider: "motis", url: url.toString(), status: result.status, attempt: attempt + 1, maxRetries, elapsedMs: Date.now() - startedAt, kind: "parse", message: error instanceof Error ? error.message : "Invalid transit API response", responseBody: result.body.slice(0, 200), final: true });
        throw new TransitDataSourceError(error instanceof Error ? error.message : "Invalid transit API response", result.status, url.toString());
      }
    }
    throw new TransitDataSourceError("Transit API request failed", undefined, url.toString());
  };

  return {
    async getStationDepartures(stopId, startTime, endTime) {
      const cacheKey = `${stopId}|${startTime}|${endTime}`;
      const cached = stationCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return { stopTimes: cached.stopTimes, stale: false, fetchedAt: cached.fetchedAt };
      }

      const start = new Date(startTime).getTime();
      const end = new Date(endTime).getTime();
      const url = new URL("/api/v6/stoptimes", options.baseUrl);
      url.searchParams.set("stopId", stopId);
      url.searchParams.set("time", startTime);
      url.searchParams.set("window", String(Math.ceil((end - start) / 1000)));
      url.searchParams.set("direction", "LATER");
      url.searchParams.set("mode", "REGIONAL_RAIL");
      url.searchParams.set("fetchStops", "true");
      url.searchParams.set("withScheduledSkippedStops", "false");

      try {
        const body = await requestJson<{ stopTimes?: MotisStopTime[] }>(url);
        const fetchedAt = new Date().toISOString();
        const entry = { stopTimes: body.stopTimes ?? [], fetchedAt, expiresAt: Date.now() + options.cacheTtlSeconds * 1000 };
        stationCache.set(cacheKey, entry);
        return { stopTimes: entry.stopTimes, stale: false, fetchedAt };
      } catch (error) {
        if (cached) return { stopTimes: cached.stopTimes, stale: true, fetchedAt: cached.fetchedAt };
        throw error;
      }
    },

    async searchStations(text) {
      const url = new URL("/api/v1/geocode", options.baseUrl);
      url.searchParams.set("text", text);
      url.searchParams.set("type", "STOP");
      const payload = await requestJson<MotisResponse>(url);
      const matches = Array.isArray(payload) ? payload : payload.places ?? [];
      return matches
        .filter((match) => match.type === "STOP" && match.id && match.name)
        .map((match) => ({ stopId: match.id!, name: match.name!, lat: match.lat ?? null, lon: match.lon ?? null }));
    },

    async getLiveTrip(tripId) {
      const url = new URL("/api/v6/trip", options.baseUrl);
      url.searchParams.set("tripId", tripId);
      const trip = await requestJson<LiveTrip>(url);
      const finalLeg = trip.legs?.at(-1);
      const arrival = finalLeg?.to?.arrival ?? null;
      const arrived = arrival !== null && Number.isFinite(Date.parse(arrival)) && Date.parse(arrival) <= Date.now();
      const geometry = trip.legs?.map((leg) => leg.legGeometry?.points).filter((points): points is string => Boolean(points)) ?? [];
      const firstLeg = trip.legs?.[0];
      const endpoints = firstLeg?.from && finalLeg?.to
        ? JSON.stringify([{ name: firstLeg.from.name, lat: firstLeg.from.lat, lon: firstLeg.from.lon }, { name: finalLeg.to.name, lat: finalLeg.to.lat, lon: finalLeg.to.lon }])
        : null;
      return {
        actualArrival: arrival,
        actualDeparture: firstLeg?.from?.departure ?? null,
        currentDelayMinutes: (() => {
          const current = [...(trip.legs ?? [])].reverse().find((leg) => leg.to?.arrival || leg.from?.departure);
          const actual = current?.to?.arrival ?? current?.from?.departure;
          const scheduled = current?.to?.scheduledArrival ?? current?.from?.scheduledDeparture;
          return actual && scheduled ? Math.round((Date.parse(actual) - Date.parse(scheduled)) / 60000) : null;
        })(),
        departureDelayMinutes: firstLeg?.from?.departure && firstLeg.from.scheduledDeparture
          ? Math.round((Date.parse(firstLeg.from.departure) - Date.parse(firstLeg.from.scheduledDeparture)) / 60000) : null,
        scheduledArrival: finalLeg?.to?.scheduledArrival ?? null,
        scheduledDeparture: firstLeg?.from?.scheduledDeparture ?? null,
        stopCount: Math.max(0, (trip.legs?.length ?? 0) - 1),
        origin: firstLeg?.from?.name ?? null,
        destination: finalLeg?.to?.name ?? null,
        arrived,
        cancelled: finalLeg?.cancelled === true,
        geometry: geometry.length ? JSON.stringify(geometry) : null,
        endpoints,
      };
    },
  };
};
