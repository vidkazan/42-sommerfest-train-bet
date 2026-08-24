import { describe, expect, it } from "vitest";
import { createHistoryDataSource } from "./history-data-source.js";

const response = {
  line_number: "RE5",
  line_game_name: "The Northern Connector",
  line_game_description: "Reliable regional service between Hamburg and Hannover.",
  train_number_start: 28500,
  train_number_end: 28600,
  most_popular_start_station: "Köln Hbf",
  most_popular_end_station: "Krefeld Hbf",
  cancellation_rate_percentage: 6.91,
  average_delay_minutes: 10.7,
  maximum_delay_minutes: 176,
  delay_rate_percentage: 81.68,
  reliability_percentage: 42.5,
  disaster_30_percentage: 8.2,
  disaster_60_percentage: 1.4,
  p50_delay_minutes: 4.1,
  p90_delay_minutes: 28.6,
  chaos_spread_minutes: 24.5,
  delay_variance: 312.4,
  comeback_percentage: 12.3,
  snowball_percentage: 19.8,
  recovery_speed_minutes_per_stop: 0.7,
  monday_delay_rate: 80,
  tuesday_delay_rate: 81,
  wednesday_delay_rate: 82,
  thursday_delay_rate: 83,
  friday_delay_rate: 84,
  saturday_delay_rate: 85,
  sunday_delay_rate: 86,
  delay_distribution: [{ range_start: null, range_end: -2, percentage: 0.01 }],
  calculated_at: "2026-08-18T14:31:31.017Z",
};

describe("history data source", () => {
  it("fetches and normalizes line history", async () => {
    const urls: string[] = [];
    const logs: unknown[] = [];
    const source = createHistoryDataSource({
      baseUrl: "http://history.example:8000",
      timeoutMs: 1000,
      cacheTtlSeconds: 300,
      fetchImpl: async (input) => {
        urls.push(String(input));
        return new Response(JSON.stringify(response), { status: 200 });
      },
      logRequest: (event) => logs.push(event),
    });

    await expect(source.getLineHistory("RE5", "28501")).resolves.toEqual({
      lineNumber: "RE5",
      lineGameName: "The Northern Connector",
      lineGameDescription: "Reliable regional service between Hamburg and Hannover.",
      trainNumberStart: 28500,
      trainNumberEnd: 28600,
      mostPopularStartStation: "Köln Hbf",
      mostPopularEndStation: "Krefeld Hbf",
      cancellationRatePercentage: 6.91,
      averageDelayMinutes: 10.7,
      maximumDelayMinutes: 176,
      delayRatePercentage: 81.68,
      reliabilityPercentage: 42.5,
      disaster30Percentage: 8.2,
      disaster60Percentage: 1.4,
      p50DelayMinutes: 4.1,
      p90DelayMinutes: 28.6,
      chaosSpreadMinutes: 24.5,
      delayVariance: 312.4,
      comebackPercentage: 12.3,
      snowballPercentage: 19.8,
      recoverySpeedMinutesPerStop: 0.7,
      mondayDelayRate: 80,
      tuesdayDelayRate: 81,
      wednesdayDelayRate: 82,
      thursdayDelayRate: 83,
      fridayDelayRate: 84,
      saturdayDelayRate: 85,
      sundayDelayRate: 86,
      cancellation: { ratePercentage: 6.91 },
      delay: { averageMinutes: 10.7, minimumMinutes: null, maximumMinutes: 176, delayedPercentage: 81.68 },
      delayDistribution: [{ rangeStart: null, rangeEnd: -2, percentage: 0.01 }],
      calculatedAt: "2026-08-18T14:31:31.017Z",
    });
    expect(urls[0]).toBe("http://history.example:8000/v1/lines/RE5/28501");
    expect(logs).toEqual([expect.objectContaining({ service: "trips-history", operation: "line-history", lineName: "RE5", trainNumber: "28501", statusCode: 200, outcome: "success", cacheHit: false })]);
  });

  it("returns null without identifiers or when the service has no data", async () => {
    let calls = 0;
    const logs: unknown[] = [];
    const source = createHistoryDataSource({
      baseUrl: "http://history.example:8000",
      timeoutMs: 1000,
      cacheTtlSeconds: 300,
      fetchImpl: async () => { calls += 1; return new Response("", { status: 404 }); },
      logRequest: (event) => logs.push(event),
    });

    await expect(source.getLineHistory(null, "28501")).resolves.toBeNull();
    await expect(source.getLineHistory("RE5", "28501")).resolves.toBeNull();
    await expect(source.getLineHistory("RE5", "28501")).resolves.toBeNull();
    expect(calls).toBe(1);
    expect(logs).toEqual([expect.objectContaining({ statusCode: 404, outcome: "not_found" })]);
  });

  it("rejects responses without range identity", async () => {
    const logs: unknown[] = [];
    const source = createHistoryDataSource({
      baseUrl: "http://history.example:8000",
      timeoutMs: 1000,
      cacheTtlSeconds: 300,
      fetchImpl: async () => new Response(JSON.stringify({ ...response, train_number_start: undefined }), { status: 200 }),
      logRequest: (event) => logs.push(event),
    });

    await expect(source.getLineHistory("RE5", "28501")).resolves.toBeNull();
    expect(logs).toEqual([expect.objectContaining({ statusCode: 200, outcome: "invalid_response" })]);
  });

  it("does not throw when the history service fails", async () => {
    const logs: unknown[] = [];
    const source = createHistoryDataSource({
      baseUrl: "http://history.example:8000",
      timeoutMs: 1000,
      cacheTtlSeconds: 300,
      fetchImpl: async () => { throw new Error("offline"); },
      logRequest: (event) => logs.push(event),
    });

    await expect(source.getLineHistory("RE5", "28501")).resolves.toBeNull();
    expect(logs).toEqual([expect.objectContaining({ statusCode: null, outcome: "network_error" })]);
  });

  it("logs invalid responses and timeouts", async () => {
    const invalidLogs: unknown[] = [];
    const invalidSource = createHistoryDataSource({
      baseUrl: "http://history.example:8000",
      timeoutMs: 1000,
      cacheTtlSeconds: 300,
      fetchImpl: async () => new Response(JSON.stringify({ nope: true }), { status: 200 }),
      logRequest: (event) => invalidLogs.push(event),
    });
    await expect(invalidSource.getLineHistory("RE5", "28501")).resolves.toBeNull();
    expect(invalidLogs).toEqual([expect.objectContaining({ statusCode: 200, outcome: "invalid_response" })]);

    const timeoutLogs: unknown[] = [];
    const timeoutSource = createHistoryDataSource({
      baseUrl: "http://history.example:8000",
      timeoutMs: 1,
      cacheTtlSeconds: 300,
      fetchImpl: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }),
      logRequest: (event) => timeoutLogs.push(event),
    });
    await expect(timeoutSource.getLineHistory("RE5", "28501")).resolves.toBeNull();
    expect(timeoutLogs).toEqual([expect.objectContaining({ statusCode: null, outcome: "timeout" })]);
  });
});
