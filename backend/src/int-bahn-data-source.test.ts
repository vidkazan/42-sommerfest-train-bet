import { describe, expect, it } from "vitest";
import { createIntBahnDataSource } from "./int-bahn-data-source.js";

describe("int.bahn.de transit data source", () => {
  it("maps departure entries from the DB stop-times analogue", async () => {
    let requested: URL | undefined;
    const source = createIntBahnDataSource({
      baseUrl: "https://int.example",
      cacheTtlSeconds: 60,
      userAgent: "test-agent",
      fetchImpl: async (input) => {
        requested = new URL(String(input));
        return new Response(JSON.stringify({ entries: [{
          zeit: "2026-08-11T17:00:00", ezZeit: "2026-08-11T17:05:00", journeyId: "db-trip-1", terminus: "Düsseldorf Hbf",
          verkehrmittel: { mittelText: "RE 1", produktGattung: "REGIONAL" }, gleis: "4", ezGleis: "5",
        }] }), { status: 200 });
      },
    });

    const result = await source.getStationDepartures("8000001", "2026-08-11T17:00:00Z", "2026-08-11T17:30:00Z");
    expect(requested?.pathname).toBe("/web/api/reiseloesung/abfahrten");
    expect(requested?.searchParams.get("ortId")).toBe("8000001");
    expect(requested?.searchParams.get("mitVias")).toBe("false");
    expect(result.stopTimes[0]).toMatchObject({ tripId: "db-trip-1", displayName: "RE 1", realTime: true });
  });

  it("maps the DB trip-detail analogue", async () => {
    let requested: URL | undefined;
    const source = createIntBahnDataSource({
      baseUrl: "https://int.example",
      cacheTtlSeconds: 60,
      userAgent: "test-agent",
      fetchImpl: async (input) => {
        requested = new URL(String(input));
        return new Response(JSON.stringify({ verbindungen: [{ verbindungsAbschnitte: [{
          abfahrtsOrt: "Hannover Hbf", ankunftsOrt: "Bremen Hbf",
          ankunft: { sollzeit: "2026-08-11T18:00:00", echtzeit: "2026-08-11T18:05:00" },
        }] }] }), { status: 200 });
      },
    });

    await expect(source.getLiveTrip("db-trip-1")).resolves.toMatchObject({ actualArrival: "2026-08-11T18:05:00", cancelled: false });
    expect(requested?.pathname).toBe("/web/api/reiseloesung/fahrt");
    expect(requested?.searchParams.get("journeyId")).toBe("db-trip-1");
  });
});
