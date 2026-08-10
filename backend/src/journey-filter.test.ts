import { describe, expect, it } from "vitest";
import { normalizeCandidate, type MotisStopTime } from "./journey-filter.js";

const base: MotisStopTime = {
  mode: "REGIONAL_RAIL", realTime: true, displayName: "RE 7", tripId: "trip-7",
  place: { name: "Hamm", stopId: "hamm", scheduledDeparture: "2026-08-09T15:00:00Z" },
  tripFrom: { name: "Hamm", stopId: "hamm" },
  tripTo: { name: "Krefeld", stopId: "krefeld", scheduledArrival: "2026-08-09T18:30:00Z" },
};
const start = "2026-08-09T15:00:00Z";
const end = "2026-08-09T15:30:00Z";

describe("normalizeCandidate", () => {
  it("accepts a realtime RE journey", () => {
    const result = normalizeCandidate(base, "hamm", start, end);
    expect(result?.status).toBe("candidate");
    expect(result?.durationSeconds).toBe(12600);
  });
  it("excludes non-regional and non-RE journeys", () => {
    expect(normalizeCandidate({ ...base, mode: "BUS" }, "hamm", start, end)?.exclusionReason).toBe("NOT_REGIONAL_RAIL");
    expect(normalizeCandidate({ ...base, displayName: "IC 7" }, "hamm", start, end)?.exclusionReason).toBe("NOT_RE");
  });
  it("excludes non-realtime, cancelled, and out-of-window journeys", () => {
    expect(normalizeCandidate({ ...base, realTime: false }, "hamm", start, end)?.exclusionReason).toBe("NO_REALTIME_DATA");
    expect(normalizeCandidate({ ...base, tripCancelled: true }, "hamm", start, end)?.exclusionReason).toBe("CANCELLED");
    expect(normalizeCandidate({ ...base, tripTo: { ...base.tripTo, scheduledArrival: "2026-08-09T15:20:00Z" } }, "hamm", start, end)?.status).toBe("candidate");
    expect(normalizeCandidate({ ...base, place: { ...base.place, scheduledDeparture: "2026-08-09T16:00:00Z" } }, "hamm", start, end)?.exclusionReason).toBe("OUTSIDE_TIME_RANGE");
  });
});
