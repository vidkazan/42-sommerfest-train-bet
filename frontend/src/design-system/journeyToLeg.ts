import type { Journey } from "../api/client";
import type { TransportType } from "./tokens";

export type JourneyLegTransport = "train" | "bus" | "tram" | "metro" | "unknown";

export type JourneyLegStop = {
  name?: string;
  lat: number;
  lon: number;
};

export type JourneyLeg = {
  id: string;
  type: "line";
  transport: JourneyLegTransport;
  lineName: string;
  from: string;
  to: string;
  departure: string;
  arrival?: string;
  actualArrival?: string | null;
  durationSeconds: number;
  raceDelayMinutes?: number | null;
  cancelled: boolean;
  stops: JourneyLegStop[];
  geometry?: string | null;
};

export function transportIconType(transport: JourneyLegTransport): TransportType {
  if (transport === "bus") return "bus";
  if (transport === "tram") return "tram";
  if (transport === "metro") return "u";
  return "re";
}

function transportFor(displayName: string): JourneyLegTransport {
  const name = displayName.trim().toUpperCase();
  if (/^(ICE|IC|EC|RE|RB|IRE|RJ)/.test(name)) return "train";
  if (/^(S|SB)/.test(name)) return "metro";
  if (/^(U|UBAHN)/.test(name)) return "metro";
  if (/^(BUS|BUSSE)/.test(name)) return "bus";
  if (/^(TRAM|STR|STADTBAHN)/.test(name)) return "tram";
  return "unknown";
}

function parseStops(routeJson?: string | null): JourneyLegStop[] {
  if (!routeJson) return [];
  try {
    const parsed: unknown = JSON.parse(routeJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): JourneyLegStop[] => {
      if (!item || typeof item !== "object") return [];
      const point = item as { name?: unknown; lat?: unknown; lon?: unknown };
      if (typeof point.lat !== "number" || typeof point.lon !== "number" || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return [];
      return [{ name: typeof point.name === "string" ? point.name : undefined, lat: point.lat, lon: point.lon }];
    });
  } catch {
    return [];
  }
}

export function journeyToLeg(journey: Journey): JourneyLeg {
  return {
    id: journey.id,
    type: "line",
    transport: transportFor(journey.displayName),
    lineName: journey.displayName,
    from: journey.origin,
    to: journey.destination,
    departure: journey.scheduledDeparture,
    arrival: journey.scheduledArrival,
    actualArrival: journey.actualArrival,
    durationSeconds: journey.durationSeconds,
    raceDelayMinutes: journey.raceDelayMinutes,
    cancelled: journey.status === "cancelled" || journey.liveStatus === "cancelled",
    stops: parseStops(journey.routeJson),
    geometry: journey.geometry,
  };
}
