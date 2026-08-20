export type TrainHistory = {
  lineNumber: string;
  trainNumberStart: number;
  trainNumberEnd: number;
  mostPopularStartStation: string | null;
  mostPopularEndStation: string | null;
  cancellationRatePercentage: number | null;
  averageDelayMinutes: number | null;
  maximumDelayMinutes: number | null;
  delayRatePercentage: number | null;
  reliabilityPercentage: number | null;
  disaster30Percentage: number | null;
  disaster60Percentage: number | null;
  p50DelayMinutes: number | null;
  p90DelayMinutes: number | null;
  chaosSpreadMinutes: number | null;
  delayVariance: number | null;
  comebackPercentage: number | null;
  snowballPercentage: number | null;
  recoverySpeedMinutesPerStop: number | null;
  mondayDelayRate: number | null;
  tuesdayDelayRate: number | null;
  wednesdayDelayRate: number | null;
  thursdayDelayRate: number | null;
  fridayDelayRate: number | null;
  saturdayDelayRate: number | null;
  sundayDelayRate: number | null;
  delayStars?: number | null;
  chaosStars?: number | null;
  disasterStars?: number | null;
  cancellationStars?: number | null;
  // Compatibility shape used by the existing history badges and graph.
  cancellation: { ratePercentage: number };
  delay: {
    averageMinutes: number;
    minimumMinutes: number | null;
    maximumMinutes: number | null;
    delayedPercentage: number | null;
  };
  delayDistribution: Array<{
    rangeStart: number | null;
    rangeEnd: number | null;
    percentage: number;
  }>;
  calculatedAt: string;
};

type HistoryResponse = {
  line_number?: unknown;
  train_number_start?: unknown;
  train_number_end?: unknown;
  most_popular_start_station?: unknown;
  most_popular_end_station?: unknown;
  cancellation_rate_percentage?: unknown;
  average_delay_minutes?: unknown;
  maximum_delay_minutes?: unknown;
  delay_rate_percentage?: unknown;
  reliability_percentage?: unknown;
  disaster_30_percentage?: unknown;
  disaster_60_percentage?: unknown;
  p50_delay_minutes?: unknown;
  p90_delay_minutes?: unknown;
  chaos_spread_minutes?: unknown;
  delay_variance?: unknown;
  comeback_percentage?: unknown;
  snowball_percentage?: unknown;
  recovery_speed_minutes_per_stop?: unknown;
  monday_delay_rate?: unknown;
  tuesday_delay_rate?: unknown;
  wednesday_delay_rate?: unknown;
  thursday_delay_rate?: unknown;
  friday_delay_rate?: unknown;
  saturday_delay_rate?: unknown;
  sunday_delay_rate?: unknown;
  delay_distribution?: Array<{ range_start?: unknown; range_end?: unknown; percentage?: unknown }>;
  calculated_at?: unknown;
};

const numberValue = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const nullableNumberValue = (value: unknown): number | null => value === null || value === undefined ? null : numberValue(value);
const stringValue = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;

const normalize = (body: HistoryResponse): TrainHistory | null => {
  const lineNumber = stringValue(body.line_number);
  const trainNumberStart = numberValue(body.train_number_start);
  const trainNumberEnd = numberValue(body.train_number_end);
  const cancellation = numberValue(body.cancellation_rate_percentage);
  const averageMinutes = numberValue(body.average_delay_minutes);
  const calculatedAt = stringValue(body.calculated_at);
  if (!lineNumber || trainNumberStart === null || trainNumberEnd === null || cancellation === null || averageMinutes === null || !calculatedAt) return null;

  const delayDistribution = (body.delay_distribution ?? []).flatMap((entry) => {
    const percentage = numberValue(entry.percentage);
    const rangeStart = entry.range_start === null ? null : numberValue(entry.range_start);
    const rangeEnd = entry.range_end === null ? null : numberValue(entry.range_end);
    return percentage !== null && (entry.range_start === null || rangeStart !== null) && (entry.range_end === null || rangeEnd !== null)
      ? [{ rangeStart, rangeEnd, percentage }]
      : [];
  });

  return {
    lineNumber,
    trainNumberStart,
    trainNumberEnd,
    mostPopularStartStation: stringValue(body.most_popular_start_station),
    mostPopularEndStation: stringValue(body.most_popular_end_station),
    cancellationRatePercentage: cancellation,
    averageDelayMinutes: averageMinutes,
    maximumDelayMinutes: nullableNumberValue(body.maximum_delay_minutes),
    delayRatePercentage: nullableNumberValue(body.delay_rate_percentage),
    reliabilityPercentage: nullableNumberValue(body.reliability_percentage),
    disaster30Percentage: nullableNumberValue(body.disaster_30_percentage),
    disaster60Percentage: nullableNumberValue(body.disaster_60_percentage),
    p50DelayMinutes: nullableNumberValue(body.p50_delay_minutes),
    p90DelayMinutes: nullableNumberValue(body.p90_delay_minutes),
    chaosSpreadMinutes: nullableNumberValue(body.chaos_spread_minutes),
    delayVariance: nullableNumberValue(body.delay_variance),
    comebackPercentage: nullableNumberValue(body.comeback_percentage),
    snowballPercentage: nullableNumberValue(body.snowball_percentage),
    recoverySpeedMinutesPerStop: nullableNumberValue(body.recovery_speed_minutes_per_stop),
    mondayDelayRate: nullableNumberValue(body.monday_delay_rate),
    tuesdayDelayRate: nullableNumberValue(body.tuesday_delay_rate),
    wednesdayDelayRate: nullableNumberValue(body.wednesday_delay_rate),
    thursdayDelayRate: nullableNumberValue(body.thursday_delay_rate),
    fridayDelayRate: nullableNumberValue(body.friday_delay_rate),
    saturdayDelayRate: nullableNumberValue(body.saturday_delay_rate),
    sundayDelayRate: nullableNumberValue(body.sunday_delay_rate),
    cancellation: { ratePercentage: cancellation },
    delay: {
      averageMinutes,
      minimumMinutes: null,
      maximumMinutes: nullableNumberValue(body.maximum_delay_minutes),
      delayedPercentage: nullableNumberValue(body.delay_rate_percentage),
    },
    delayDistribution,
    calculatedAt,
  };
};

export type HistoryDataSource = {
  getLineHistory: (lineName: string | null, trainNumber: string | null) => Promise<TrainHistory | null>;
};

export type HistoryRequestOutcome = "success" | "not_found" | "http_error" | "timeout" | "network_error" | "invalid_response";

export type HistoryRequestLog = {
  service: "trips-history";
  operation: "line-history";
  lineName: string;
  trainNumber: string;
  statusCode: number | null;
  durationMs: number;
  outcome: HistoryRequestOutcome;
  cacheHit: false;
};

export const createHistoryDataSource = (options: {
  baseUrl: string;
  timeoutMs: number;
  cacheTtlSeconds: number;
  fetchImpl?: typeof fetch;
  logRequest?: (event: HistoryRequestLog) => void;
}): HistoryDataSource => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = new Map<string, { value: TrainHistory | null; expiresAt: number }>();

  return {
    async getLineHistory(lineName, trainNumber) {
      if (!lineName || !trainNumber) return null;
      const cacheKey = `${lineName}|${trainNumber}`;
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return cached.value;

      const url = new URL(`/v1/lines/${encodeURIComponent(lineName)}/${encodeURIComponent(trainNumber)}`, options.baseUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
      const startedAt = Date.now();
      const logRequest = (outcome: HistoryRequestOutcome, statusCode: number | null) => options.logRequest?.({
        service: "trips-history",
        operation: "line-history",
        lineName,
        trainNumber,
        statusCode,
        durationMs: Date.now() - startedAt,
        outcome,
        cacheHit: false,
      });
      try {
        const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: controller.signal });
        if (!response.ok) {
          logRequest(response.status === 404 ? "not_found" : "http_error", response.status);
          cache.set(cacheKey, { value: null, expiresAt: Date.now() + options.cacheTtlSeconds * 1000 });
          return null;
        }
        let body: HistoryResponse;
        try {
          body = await response.json() as HistoryResponse;
        } catch {
          logRequest("invalid_response", response.status);
          cache.set(cacheKey, { value: null, expiresAt: Date.now() + options.cacheTtlSeconds * 1000 });
          return null;
        }
        const value = normalize(body);
        if (!value) {
          logRequest("invalid_response", response.status);
          cache.set(cacheKey, { value: null, expiresAt: Date.now() + options.cacheTtlSeconds * 1000 });
          return null;
        }
        logRequest("success", response.status);
        cache.set(cacheKey, { value, expiresAt: Date.now() + options.cacheTtlSeconds * 1000 });
        return value;
      } catch (error) {
        logRequest(error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error", null);
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
};
