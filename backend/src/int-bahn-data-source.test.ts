import { describe, expect, it } from "vitest";
import { createIntBahnDataSource } from "./int-bahn-data-source.js";

describe("int.bahn.de transit data source", () => {
  it("maps departure entries from the DB stop-times analogue", async () => {
    const requested: URL[] = [];
    const source = createIntBahnDataSource({
      baseUrl: "https://int.example",
      cacheTtlSeconds: 60,
      userAgent: "test-agent",
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        requested.push(url);
        if (url.pathname.endsWith("/abfahrten")) {
          return new Response(JSON.stringify({ entries: [{
          zeit: "2026-08-11T17:00:00", ezZeit: "2026-08-11T17:05:00", journeyId: "db-trip-1", terminus: "Düsseldorf Hbf",
            verkehrmittel: { mittelText: "RE 1", produktGattung: "REGIONAL" }, gleis: "4", ezGleis: "5",
          }, {
            zeit: "2026-08-11T17:10:00", ezZeit: "2026-08-11T17:12:00", journeyId: "db-rb-25", terminus: "Dortmund Hbf",
            verkehrmittel: { mittelText: "RB 25", produktGattung: "REGIONAL" }, gleis: "2", ezGleis: "2",
          }] }), { status: 200 });
        }
        if (url.pathname.endsWith("/fahrt") && url.searchParams.get("journeyId") === "db-rb-25") {
          return new Response(JSON.stringify({ verbindungen: [{ verbindungsAbschnitte: [{
            abfahrtsOrt: "Hamm Hbf", ankunftsOrt: "Dortmund Hbf",
            abfahrt: { sollzeit: "2026-08-11T17:10:00" },
            ankunft: { sollzeit: "2026-08-11T18:00:00", echtzeit: "2026-08-11T18:02:00" },
          }] }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ verbindungen: [{ verbindungsAbschnitte: [{
          abfahrtsOrt: "Hamm Hbf", ankunftsOrt: "Düsseldorf Hbf",
          abfahrt: { sollzeit: "2026-08-11T17:00:00" },
          ankunft: { sollzeit: "2026-08-11T19:00:00", echtzeit: "2026-08-11T19:05:00" },
        }] }] }), { status: 200 });
      },
    });

    const result = await source.getStationDepartures("8000001", "2026-08-11T17:00:00Z", "2026-08-11T17:30:00Z");
    expect(requested.some((url) => url.pathname === "/web/api/reiseloesung/abfahrten")).toBe(true);
    const departuresUrl = requested.find((url) => url.pathname.endsWith("/abfahrten"));
    expect(departuresUrl?.searchParams.get("ortId")).toBe("8000001");
    expect(departuresUrl?.searchParams.get("mitVias")).toBe("false");
    expect(result.stopTimes).toHaveLength(2);
    expect(result.stopTimes).toEqual(expect.arrayContaining([
      expect.objectContaining({ tripId: "db-trip-1", displayName: "RE 1" }),
      expect.objectContaining({ tripId: "db-rb-25", displayName: "RB 25", mode: "REGIONAL_RAIL" }),
    ]));
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

    await expect(source.getLiveTrip("db-trip-1")).resolves.toMatchObject({ actualArrival: "2026-08-11T18:05:00+02:00", cancelled: false });
    expect(requested?.pathname).toBe("/web/api/reiseloesung/fahrt");
    expect(requested?.searchParams.get("journeyId")).toBe("db-trip-1");
  });

  it("maps the current top-level fahrt response", async () => {
    const source = createIntBahnDataSource({
      baseUrl: "https://int.example",
      cacheTtlSeconds: 60,
      requestDelayMs: 0,
      userAgent: "test-agent",
      fetchImpl: async () => new Response(JSON.stringify({
        halte: [
          { name: "Aachen Hbf", extId: "8000001", abfahrt: { sollzeit: "2026-08-11T08:18:00", echtzeit: "2026-08-11T08:19:00" } },
          { name: "Siegen Hbf", extId: "8000046", ankunft: { sollzeit: "2026-08-11T10:51:00", echtzeit: "2026-08-11T10:55:00" } },
        ],
        abfahrt: { sollzeit: "2026-08-11T08:18:00", echtzeit: "2026-08-11T08:19:00" },
        ankunft: { sollzeit: "2026-08-11T10:51:00", echtzeit: "2026-08-11T10:55:00" },
        cancelled: false,
      }), { status: 200 }),
    });

    await expect(source.getLiveTrip("db-trip-10909")).resolves.toMatchObject({
      actualArrival: "2026-08-11T10:55:00+02:00",
      scheduledArrival: "2026-08-11T10:51:00+02:00",
      scheduledDeparture: "2026-08-11T08:18:00+02:00",
      origin: "Aachen Hbf",
      destination: "Siegen Hbf",
      cancelled: false,
    });
  });

  it("maps stop search results from the DB geocoding endpoint", async () => {
    let requested: URL | undefined;
    const source = createIntBahnDataSource({
      baseUrl: "https://int.example",
      cacheTtlSeconds: 60,
      userAgent: "test-agent",
      fetchImpl: async (input) => {
        requested = new URL(String(input));
        return new Response(JSON.stringify([
          { id: "8000001", extId: "de:8000001", name: "Hannover Hbf", lat: 52.3765, lon: 9.7417, type: "ST", products: ["REGIONAL"] },
          { name: "Ignored" },
        ]), { status: 200 });
      },
    });

    await expect(source.searchStations("Hannover")).resolves.toEqual([
      { stopId: "8000001", name: "Hannover Hbf", lat: 52.3765, lon: 9.7417 },
    ]);
    expect(requested?.pathname).toBe("/web/api/reiseloesung/orte");
    expect(requested?.searchParams.get("suchbegriff")).toBe("Hannover");
    expect(requested?.searchParams.get("typ")).toBe("ALL");
    expect(requested?.searchParams.get("limit")).toBe("10");
  });
});
