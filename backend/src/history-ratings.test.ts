import { describe, expect, it } from "vitest";
import { applyHistoryRatings } from "./history-ratings.js";
import type { TrainHistory } from "./history-data-source.js";

const history = (overrides: Partial<TrainHistory>): TrainHistory => ({
  lineNumber: "RE18",
  lineGameName: null,
  lineGameDescription: null,
  trainNumberStart: 18909,
  trainNumberEnd: 18982,
  mostPopularStartStation: null,
  mostPopularEndStation: null,
  cancellationRatePercentage: 0,
  averageDelayMinutes: 0,
  maximumDelayMinutes: 0,
  delayRatePercentage: 0,
  reliabilityPercentage: 100,
  disaster30Percentage: 0,
  disaster60Percentage: 0,
  p50DelayMinutes: 0,
  p90DelayMinutes: 0,
  chaosSpreadMinutes: 0,
  delayVariance: 0,
  comebackPercentage: 0,
  snowballPercentage: 0,
  recoverySpeedMinutesPerStop: 0,
  mondayDelayRate: 0,
  tuesdayDelayRate: 0,
  wednesdayDelayRate: 0,
  thursdayDelayRate: 0,
  fridayDelayRate: 0,
  saturdayDelayRate: 0,
  sundayDelayRate: 0,
  cancellation: { ratePercentage: 0 },
  delay: { averageMinutes: 0, minimumMinutes: null, maximumMinutes: 0, delayedPercentage: 0 },
  delayDistribution: [],
  calculatedAt: "2026-08-20T10:00:07.621Z",
  ...overrides,
});

describe("history ratings", () => {
  it("ranks provisional histories relatively and keeps equal values tied", () => {
    const rated = applyHistoryRatings([
      history({ averageDelayMinutes: 4, chaosSpreadMinutes: 6, cancellationRatePercentage: 0, disaster30Percentage: 0, disaster60Percentage: 0 }),
      history({ averageDelayMinutes: 4, chaosSpreadMinutes: 10, cancellationRatePercentage: 10, disaster30Percentage: 10, disaster60Percentage: 5 }),
      history({ averageDelayMinutes: 20, chaosSpreadMinutes: 20, cancellationRatePercentage: 20, disaster30Percentage: 20, disaster60Percentage: 10 }),
    ]);

    expect(rated.map((item) => item?.delayStars)).toEqual([3, 3, 5]);
    expect(rated.map((item) => item?.chaosStars)).toEqual([2, 4, 5]);
    expect(rated.map((item) => item?.disasterStars)).toEqual([2, 4, 5]);
    expect(rated.map((item) => item?.cancellationStars)).toEqual([2, 4, 5]);
  });

  it("leaves ratings empty when a required metric is unavailable", () => {
    const rated = applyHistoryRatings([history({ averageDelayMinutes: null }), null]);
    expect(rated[0]).toMatchObject({ delayStars: null, chaosStars: 5, disasterStars: 5, cancellationStars: 5 });
    expect(rated[1]).toBeNull();
  });

  it("rates journey duration alongside the historical metrics", () => {
    const rated = applyHistoryRatings([history({}), history({}), history({})], [1800, 3600, 5400]);
    expect(rated.map((item) => item?.durationStars)).toEqual([2, 4, 5]);
  });
});
