import { describe, expect, it } from "vitest";
import { countEventsByCategory, filterEventsByJourneyPaths, parseConstructionJson, parseDisruptionsJson } from "./map-events.js";

describe("manual disruption map events", () => {
  it("converts EPSG:25832 coordinates and keeps active disruptions", () => {
    const result = parseDisruptionsJson(JSON.stringify([{
      key: "BZI_TEST",
      cause: "Störung am Fahrweg",
      subcause: "Hindernis im/am Gleis",
      text: "Obstacle",
      gleisEinschraenkung: "SCHWER",
      zeitraum: { beginn: "2026-08-18T15:00:00Z", ende: "2026-08-18T20:00:00Z" },
      koordinaten: [{ x: 860192.1231, y: 6706885.4172 }],
    }]), Date.parse("2026-08-18T16:00:00Z"), Date.parse("2026-08-18T19:00:00Z"));

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ id: "BZI_TEST", category: "disruption", severity: "severe" });
    expect(result.events[0].latitude).toBeGreaterThan(50);
    expect(result.events[0].latitude).toBeLessThan(53);
    expect(result.events[0].longitude).toBeGreaterThan(6);
    expect(result.events[0].longitude).toBeLessThan(10);
  });

  it("skips records without coordinates or outside the game window", () => {
    const result = parseDisruptionsJson(JSON.stringify([
      { key: "NO_COORDS", zeitraum: { beginn: "2026-08-18T15:00:00Z", ende: "2026-08-18T20:00:00Z" }, koordinaten: [] },
      { key: "TOO_OLD", zeitraum: { beginn: "2020-08-18T15:00:00Z", ende: "2020-08-18T20:00:00Z" }, koordinaten: [{ x: 860192, y: 6706885 }] },
    ]), Date.parse("2026-08-18T16:00:00Z"), Date.parse("2026-08-18T19:00:00Z"));

    expect(result.events).toHaveLength(0);
    expect(result.skipped).toEqual([
      { key: "NO_COORDS", reason: "MISSING_COORDINATES" },
      { key: "TOO_OLD", reason: "OUTSIDE_GAME_WINDOW_OR_INVALID_PERIOD" },
    ]);
  });

  it("rejects a non-array JSON payload", () => {
    expect(() => parseDisruptionsJson("{}", 0, 1)).toThrow("INVALID_DISRUPTIONS_JSON_ARRAY");
  });

  it("filters events against selected journey paths", () => {
    const events = [
      { id: "near", category: "disruption" as const, title: "Near", description: null, latitude: 51.0, longitude: 7.0, startsAt: "2026-08-18T15:00:00Z", endsAt: "2026-08-18T20:00:00Z", severity: "warning" as const, source: "manual" as const },
      { id: "far", category: "disruption" as const, title: "Far", description: null, latitude: 51.0, longitude: 7.2, startsAt: "2026-08-18T15:00:00Z", endsAt: "2026-08-18T20:00:00Z", severity: "warning" as const, source: "manual" as const },
    ];
    const result = filterEventsByJourneyPaths(events, [[{ lat: 51.0, lon: 7.0 }, { lat: 51.0, lon: 7.01 }]], 1);
    expect(result.accepted.map((event) => event.id)).toEqual(["near"]);
    expect(result.skipped).toEqual([{ key: "far", reason: "OUTSIDE_SELECTED_JOURNEY_PATH" }]);
  });

  it("keeps only severe, high-impact construction and deduplicates IDs", () => {
    const json = JSON.stringify([
      { baustellenID: "KEEP", wirkung: "TOTALSPERRUNG", gleisEinschraenkung: "SCHWER", arbeiten: "Bridge works", zeitraum: { beginn: "2026-08-18T15:00:00Z", ende: "2026-08-18T20:00:00Z" }, koordinaten: { von: { x: 860192, y: 6706885 }, bis: { x: 860192, y: 6706885 } } },
      { baustellenID: "KEEP", wirkung: "TOTALSPERRUNG", gleisEinschraenkung: "SCHWER", zeitraum: { beginn: "2026-08-18T15:00:00Z", ende: "2026-08-18T20:00:00Z" }, koordinaten: { von: { x: 860192, y: 6706885 }, bis: { x: 860192, y: 6706885 } } },
      { baustellenID: "LIGHT", wirkung: "TOTALSPERRUNG", gleisEinschraenkung: "LEICHT", zeitraum: { beginn: "2026-08-18T15:00:00Z", ende: "2026-08-18T20:00:00Z" }, koordinaten: { von: { x: 860192, y: 6706885 }, bis: { x: 860192, y: 6706885 } } },
      { baustellenID: "LOW_IMPACT", wirkung: "SONSTIGES", gleisEinschraenkung: "SCHWER", zeitraum: { beginn: "2026-08-18T15:00:00Z", ende: "2026-08-18T20:00:00Z" }, koordinaten: { von: { x: 860192, y: 6706885 }, bis: { x: 860192, y: 6706885 } } },
    ]);
    const result = parseConstructionJson(json, Date.parse("2026-08-18T16:00:00Z"), Date.parse("2026-08-18T19:00:00Z"));
    expect(result.events.map((event) => event.id)).toEqual(["KEEP"]);
    expect(result.skipped.map((item) => item.reason)).toEqual(["DUPLICATE_BAUSTELLEN_ID", "NOT_SEVERE", "LOW_RAILWAY_IMPACT"]);
  });

  it("counts events using category-specific route radii", () => {
    const event = (id: string, category: "football" | "disruption" | "construction", longitude: number) => ({
      id, category, title: id, description: null, latitude: 51, longitude,
      startsAt: "2026-08-18T15:00:00Z", endsAt: "2026-08-18T20:00:00Z", severity: "warning" as const, source: "manual" as const,
    });
    const events = [event("football-near", "football", 7.05), event("football-far", "football", 7.2), event("disruption-near", "disruption", 7.005), event("disruption-far", "disruption", 7.03), event("construction-near", "construction", 7.005)];
    expect(countEventsByCategory(events, [{ lat: 51, lon: 7 }, { lat: 51, lon: 7.01 }])).toEqual({ football: 1, disruption: 1, construction: 1 });
  });
});
