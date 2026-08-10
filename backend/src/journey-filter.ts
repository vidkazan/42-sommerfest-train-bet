export type MotisPlace = { name?: string; stopId?: string; lat?: number; lon?: number; scheduledDeparture?: string; scheduledArrival?: string };
export type MotisStopTime = {
  mode?: string; realTime?: boolean; displayName?: string; tripId?: string;
  cancelled?: boolean; tripCancelled?: boolean; place?: MotisPlace;
  tripFrom?: MotisPlace; tripTo?: MotisPlace;
  nextStops?: MotisPlace[];
};
export type Candidate = {
  externalTripId: string; displayName: string; origin: string; destination: string;
  scheduledDeparture: string; scheduledArrival: string; durationSeconds: number;
  originStopId: string | null; realtime: boolean;
  routeJson: string;
  status: "candidate" | "excluded"; exclusionReason: string | null;
};

export function normalizeCandidate(stopTime: MotisStopTime, stopId: string, startTime: string, endTime: string): Candidate | null {
  const tripId = stopTime.tripId;
  const departure = stopTime.place?.scheduledDeparture;
  const finalStop = stopTime.nextStops?.at(-1);
  const arrival = finalStop?.scheduledArrival ?? stopTime.tripTo?.scheduledArrival;
  const departureTimestamp = departure ? new Date(departure).getTime() : NaN;
  const arrivalTimestamp = arrival ? new Date(arrival).getTime() : NaN;
  if (!tripId || !stopTime.displayName || !departure || !arrival) return null;

  const startTimestamp = new Date(startTime).getTime();
  const endTimestamp = new Date(endTime).getTime();
  const exclusionReason = stopTime.mode !== "REGIONAL_RAIL" ? "NOT_REGIONAL_RAIL"
    : !stopTime.displayName.toUpperCase().startsWith("RE") ? "NOT_RE"
      : !stopTime.realTime ? "NO_REALTIME_DATA"
        : stopTime.cancelled || stopTime.tripCancelled ? "CANCELLED"
          : !Number.isFinite(departureTimestamp) || !Number.isFinite(arrivalTimestamp) ? "MISSING_SCHEDULE"
            : departureTimestamp < startTimestamp || departureTimestamp > endTimestamp ? "OUTSIDE_TIME_RANGE"
                : null;

  return {
    externalTripId: tripId, displayName: stopTime.displayName,
    origin: stopTime.tripFrom?.name ?? stopTime.place?.name ?? stopId,
    destination: finalStop?.name ?? stopTime.tripTo?.name ?? "Unknown",
    scheduledDeparture: departure, scheduledArrival: arrival,
    durationSeconds: Number.isFinite(departureTimestamp) && Number.isFinite(arrivalTimestamp)
      ? Math.floor((arrivalTimestamp - departureTimestamp) / 1000) : 0,
    originStopId: stopTime.tripFrom?.stopId ?? stopId,
    realtime: stopTime.realTime === true,
    routeJson: JSON.stringify([stopTime.place, ...(stopTime.nextStops ?? [])]
      .filter((place): place is MotisPlace => place !== undefined && Number.isFinite(place.lat) && Number.isFinite(place.lon))
      .map((place) => ({ lat: place.lat, lon: place.lon, name: place.name }))),
    status: exclusionReason ? "excluded" : "candidate", exclusionReason,
  };
}
