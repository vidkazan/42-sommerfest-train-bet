import { describe, expect, it } from "vitest";
import { normalizeCandidate, type MotisStopTime } from "./journey-filter.js";

const base: MotisStopTime = {
  mode: "REGIONAL_RAIL", realTime: true, displayName: "RE 7", tripId: "trip-7",
  lineName: "RE7", trainNumber: "28501",
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
    expect(result).toMatchObject({ lineName: "RE7", trainNumber: "28501" });
  });
  it("accepts a realtime RB journey", () => {
    const result = normalizeCandidate({ ...base, displayName: "RB 25 (12345)", lineName: null, trainNumber: null }, "hamm", start, end);
    expect(result?.status).toBe("candidate");
    expect(result).toMatchObject({ lineName: "RB25", trainNumber: "12345" });
  });
  it("derives history identifiers from provider display names", () => {
    const result = normalizeCandidate({ ...base, lineName: null, trainNumber: null, displayName: "RE 11 (26728)" }, "hamm", start, end);
    expect(result).toMatchObject({ lineName: "RE11", trainNumber: "26728" });
  });
  it("prefers provider identifiers over display-name parsing", () => {
    const result = normalizeCandidate({ ...base, displayName: "RE 11 (26728)", lineName: "RE11", trainNumber: "99999" }, "hamm", start, end);
    expect(result).toMatchObject({ lineName: "RE11", trainNumber: "99999" });
  });
  it("leaves identifiers nullable for unparseable names", () => {
    const result = normalizeCandidate({ ...base, lineName: null, trainNumber: null, displayName: "RE11" }, "hamm", start, end);
    expect(result).toMatchObject({ lineName: null, trainNumber: null });
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
