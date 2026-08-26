export type MotisPlace = { name?: string; stopId?: string; lat?: number; lon?: number; scheduledDeparture?: string; scheduledArrival?: string };
export type MotisStopTime = {
  mode?: string; realTime?: boolean; displayName?: string; tripId?: string;
  lineName?: string | null; trainNumber?: string | null;
  cancelled?: boolean; tripCancelled?: boolean; place?: MotisPlace;
  tripFrom?: MotisPlace; tripTo?: MotisPlace;
  nextStops?: MotisPlace[];
  stopCount?: number | null;
};
export type Candidate = {
  externalTripId: string; displayName: string; lineName: string | null; trainNumber: string | null;
  origin: string; destination: string;
  scheduledDeparture: string; scheduledArrival: string; durationSeconds: number;
  stopCount: number | null;
  originStopId: string | null; realtime: boolean;
  routeJson: string;
  status: "candidate" | "excluded"; exclusionReason: string | null;
};

const parseTrainIdentifiers = (displayName: string): { lineName: string | null; trainNumber: string | null } => {
  const match = displayName.match(/^([A-Z]+\s*\d+[A-Z]?)\s*\((\d+)\)/i);
  if (!match) return { lineName: null, trainNumber: null };
  return { lineName: match[1].replace(/\s+/g, "").toUpperCase(), trainNumber: match[2] };
};

const isRegionalService = (displayName: string): boolean => /^(?:RE|RB)\s*\d/i.test(displayName.trim());

export function normalizeCandidate(stopTime: MotisStopTime, stopId: string, startTime: string, endTime: string): Candidate | null {
  const tripId = stopTime.tripId;
  const departure = stopTime.place?.scheduledDeparture;
  const finalStop = stopTime.nextStops?.at(-1);
  const arrival = finalStop?.scheduledArrival ?? stopTime.tripTo?.scheduledArrival;
  const departureTimestamp = departure ? new Date(departure).getTime() : NaN;
  const arrivalTimestamp = arrival ? new Date(arrival).getTime() : NaN;
  if (!tripId || !stopTime.displayName || !departure || !arrival) return null;
  const parsedIdentifiers = parseTrainIdentifiers(stopTime.displayName);

  const startTimestamp = new Date(startTime).getTime();
  const endTimestamp = new Date(endTime).getTime();
  const exclusionReason = stopTime.mode !== "REGIONAL_RAIL" ? "NOT_REGIONAL_RAIL"
    : !isRegionalService(stopTime.displayName) ? "NOT_RE"
      : !stopTime.realTime ? "NO_REALTIME_DATA"
        : stopTime.cancelled || stopTime.tripCancelled ? "CANCELLED"
          : !Number.isFinite(departureTimestamp) || !Number.isFinite(arrivalTimestamp) ? "MISSING_SCHEDULE"
            : departureTimestamp < startTimestamp || departureTimestamp > endTimestamp ? "OUTSIDE_TIME_RANGE"
                : null;

  return {
    externalTripId: tripId, displayName: stopTime.displayName,
    lineName: stopTime.lineName ?? parsedIdentifiers.lineName,
    trainNumber: stopTime.trainNumber ?? parsedIdentifiers.trainNumber,
    origin: stopTime.tripFrom?.name ?? stopTime.place?.name ?? stopId,
    destination: finalStop?.name ?? stopTime.tripTo?.name ?? "Unknown",
    scheduledDeparture: departure, scheduledArrival: arrival,
    durationSeconds: Number.isFinite(departureTimestamp) && Number.isFinite(arrivalTimestamp)
      ? Math.floor((arrivalTimestamp - departureTimestamp) / 1000) : 0,
    stopCount: stopTime.stopCount ?? (stopTime.nextStops ? Math.max(0, stopTime.nextStops.length - 1) : null),
    originStopId: stopTime.tripFrom?.stopId ?? stopId,
    realtime: stopTime.realTime === true,
    routeJson: JSON.stringify([stopTime.place, ...(stopTime.nextStops ?? [])]
      .filter((place): place is MotisPlace => place !== undefined && (typeof place.name === "string" || typeof place.scheduledArrival === "string" || typeof place.scheduledDeparture === "string"))
      .map((place) => ({ lat: place.lat, lon: place.lon, name: place.name, scheduledArrival: place.scheduledArrival, scheduledDeparture: place.scheduledDeparture }))),
    status: exclusionReason ? "excluded" : "candidate", exclusionReason,
  };
}
