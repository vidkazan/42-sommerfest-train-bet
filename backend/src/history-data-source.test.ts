import { describe, expect, it } from "vitest";
import { createHistoryDataSource } from "./history-data-source.js";

const response = {
  line_number: "RE5",
  train_type: "NX",
  cancellation: { rate_percentage: 6.91 },
  delay: { average_minutes: 10.7, minimum_minutes: -50, maximum_minutes: 176, delayed_percentage: 81.68 },
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
      trainType: "NX",
      cancellation: { ratePercentage: 6.91 },
      delay: { averageMinutes: 10.7, minimumMinutes: -50, maximumMinutes: 176, delayedPercentage: 81.68 },
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
