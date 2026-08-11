import type { MotisPlace, MotisStopTime } from "./journey-filter.js";
import type { LiveTripResult, StationDeparturesResult, StationSearchResult, TransitDataSource } from "./transit-data-source.js";
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

type DbTrip = { verbindungen?: Array<{ verbindungsAbschnitte?: DbSection[] }> };

const displayName = (transport?: DbDeparture["verkehrmittel"]) => transport?.mittelText ?? transport?.name ?? transport?.langText ?? transport?.kurzText;

const toPlace = (name?: string, time?: { sollzeit?: string; echtzeit?: string }): MotisPlace => ({ name, scheduledDeparture: time?.sollzeit, scheduledArrival: time?.sollzeit });

const dateParts = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value.slice(0, 10), time: "00:00:00" };
  return { date: date.toISOString().slice(0, 10), time: date.toISOString().slice(11, 19) };
};

export const createIntBahnDataSource = (options: { baseUrl: string; cacheTtlSeconds: number; fetchImpl?: typeof fetch; userAgent: string }): TransitDataSource => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = { Accept: "application/json", "User-Agent": options.userAgent };
  const cache = new Map<string, { result: StationDeparturesResult; expiresAt: number }>();

  const requestJson = async <T>(url: URL): Promise<T> => {
    let response: Response;
    try { response = await fetchImpl(url, { headers }); }
    catch (error) { throw new TransitDataSourceError(error instanceof Error ? error.message : "int.bahn.de request failed", undefined, url.toString()); }
    if (!response.ok) throw new TransitDataSourceError(`int.bahn.de request failed: ${response.status}`, response.status, url.toString());
    return await response.json() as T;
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
      const stopTimes: MotisStopTime[] = (body.entries ?? []).flatMap((entry) => {
        if (!entry.journeyId || !displayName(entry.verkehrmittel) || !entry.zeit) return [];
        const scheduled = toPlace(entry.terminus, { sollzeit: entry.zeit });
        const actual = entry.ezZeit ? toPlace(entry.terminus, { sollzeit: entry.ezZeit }) : undefined;
        return [{
          tripId: entry.journeyId,
          displayName: displayName(entry.verkehrmittel),
          mode: entry.verkehrmittel?.produktGattung,
          realTime: Boolean(entry.ezZeit),
          place: { name: undefined, scheduledDeparture: entry.zeit },
          tripTo: scheduled,
          nextStops: actual ? [actual] : undefined,
          cancelled: false,
          tripCancelled: false,
          ...(entry.meldungen?.some((message) => /cancel|ausfall|entfällt/i.test(`${message.ueberschrift ?? ""} ${message.text ?? ""}`)) ? { cancelled: true } : {}),
        }];
      });
      const result = { stopTimes, stale: false, fetchedAt: new Date().toISOString() };
      cache.set(`${stopId}|${startTime}`, { result, expiresAt: Date.now() + options.cacheTtlSeconds * 1000 });
      return result;
    },

    async searchStations(text): Promise<StationSearchResult[]> {
      const url = new URL("/web/api/reiseloesung/orte", options.baseUrl);
      url.searchParams.set("suchbegriff", text);
      url.searchParams.set("typ", "ALL");
      url.searchParams.set("limit", "10");
      const payload = await requestJson<Array<{ id?: string; name?: string; latitude?: number; longitude?: number }>>(url);
      return payload.flatMap((place) => place.id && place.name ? [{ stopId: place.id, name: place.name, lat: place.latitude ?? null, lon: place.longitude ?? null }] : []);
    },

    async getLiveTrip(tripId): Promise<LiveTripResult> {
      const url = new URL("/web/api/reiseloesung/fahrt", options.baseUrl);
      url.searchParams.set("journeyId", tripId);
      const body = await requestJson<DbTrip>(url);
      const sections = body.verbindungen?.[0]?.verbindungsAbschnitte ?? [];
      const last = sections.at(-1);
      const arrival = last?.ankunft?.echtzeit ?? last?.ankunft?.sollzeit ?? null;
      const departure = sections[0]?.abfahrt?.echtzeit ?? sections[0]?.abfahrt?.sollzeit ?? null;
      const arrived = Boolean(arrival && Date.parse(arrival) <= Date.now());
      const endpoints = sections.length ? JSON.stringify([{ name: sections[0]?.abfahrtsOrt }, { name: last?.ankunftsOrt }]) : null;
      return { actualArrival: arrival, arrived, cancelled: Boolean(sections.some((section) => section.destinationCancelled || section.originCancelled)), geometry: null, endpoints };
    },
  };
};
