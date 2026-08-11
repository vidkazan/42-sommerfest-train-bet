import type { MotisStopTime } from "./journey-filter.js";

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
  from?: { name?: string; lat?: number; lon?: number };
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
}): TransitDataSource => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = { Accept: "application/json", "User-Agent": options.userAgent };
  const stationCache = new Map<string, { stopTimes: MotisStopTime[]; fetchedAt: string; expiresAt: number }>();

  const requestJson = async <T>(url: URL): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImpl(url, { headers });
    } catch (error) {
      throw new TransitDataSourceError(error instanceof Error ? error.message : "Transit API request failed", undefined, url.toString());
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new TransitDataSourceError(`Transit API request failed: ${response.status} ${body.slice(0, 200)}`, response.status, url.toString());
    }
    return await response.json() as T;
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
      return { actualArrival: arrival, arrived, cancelled: finalLeg?.cancelled === true, geometry: geometry.length ? JSON.stringify(geometry) : null, endpoints };
    },
  };
};
