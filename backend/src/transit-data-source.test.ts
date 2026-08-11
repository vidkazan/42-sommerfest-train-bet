import { describe, expect, it } from "vitest";
import { createMotisDataSource } from "./transit-data-source.js";

describe("Motis transit data source", () => {
  it("uses the configured endpoint and caches station departures", async () => {
    const urls: string[] = [];
    const source = createMotisDataSource({
      baseUrl: "https://alternative.example",
      cacheTtlSeconds: 60,
      userAgent: "test-agent",
      fetchImpl: async (input, init) => {
        urls.push(String(input));
        expect(new Headers(init?.headers).get("User-Agent")).toBe("test-agent");
        return new Response(JSON.stringify({ stopTimes: [{ tripId: "trip-1" }] }), { status: 200 });
      },
    });

    await source.getStationDepartures("stop-1", "2026-08-11T17:00:00Z", "2026-08-11T17:30:00Z");
    await source.getStationDepartures("stop-1", "2026-08-11T17:00:00Z", "2026-08-11T17:30:00Z");

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("https://alternative.example/api/v6/stoptimes");
  });

  it("normalizes station search results", async () => {
    const source = createMotisDataSource({
      baseUrl: "https://alternative.example/",
      cacheTtlSeconds: 60,
      userAgent: "test-agent",
      fetchImpl: async () => new Response(JSON.stringify({ places: [
        { type: "STOP", id: "stop-1", name: "Central Station", lat: 52.1, lon: 10.2 },
        { type: "ADDRESS", id: "address-1", name: "Ignored" },
      ] }), { status: 200 }),
    });

    await expect(source.searchStations("central")).resolves.toEqual([{ stopId: "stop-1", name: "Central Station", lat: 52.1, lon: 10.2 }]);
  });

  it("retries a rate-limited provider request", async () => {
    let calls = 0;
    const source = createMotisDataSource({
      baseUrl: "https://alternative.example",
      cacheTtlSeconds: 60,
      userAgent: "test-agent",
      requestDelayMs: 0,
      maxRetries: 1,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return new Response("", { status: 429, headers: { "Retry-After": "0" } });
        return new Response(JSON.stringify({ places: [{ type: "STOP", id: "stop-1", name: "Central Station" }] }), { status: 200 });
      },
    });

    await expect(source.searchStations("central")).resolves.toEqual([{ stopId: "stop-1", name: "Central Station", lat: null, lon: null }]);
    expect(calls).toBe(2);
  });
});
