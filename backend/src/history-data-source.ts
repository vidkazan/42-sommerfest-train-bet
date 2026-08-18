export type TrainHistory = {
  lineNumber: string;
  trainType: string;
  cancellation: { ratePercentage: number };
  delay: {
    averageMinutes: number;
    minimumMinutes: number;
    maximumMinutes: number;
    delayedPercentage: number;
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
  train_type?: unknown;
  cancellation?: { rate_percentage?: unknown };
  delay?: {
    average_minutes?: unknown;
    minimum_minutes?: unknown;
    maximum_minutes?: unknown;
    delayed_percentage?: unknown;
  };
  delay_distribution?: Array<{ range_start?: unknown; range_end?: unknown; percentage?: unknown }>;
  calculated_at?: unknown;
};

const numberValue = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const stringValue = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;

const normalize = (body: HistoryResponse): TrainHistory | null => {
  const lineNumber = stringValue(body.line_number);
  const trainType = stringValue(body.train_type);
  const cancellation = numberValue(body.cancellation?.rate_percentage);
  const averageMinutes = numberValue(body.delay?.average_minutes);
  const minimumMinutes = numberValue(body.delay?.minimum_minutes);
  const maximumMinutes = numberValue(body.delay?.maximum_minutes);
  const delayedPercentage = numberValue(body.delay?.delayed_percentage);
  const calculatedAt = stringValue(body.calculated_at);
  if (!lineNumber || !trainType || cancellation === null || averageMinutes === null || minimumMinutes === null || maximumMinutes === null || delayedPercentage === null || !calculatedAt) return null;

  const delayDistribution = (body.delay_distribution ?? []).flatMap((entry) => {
    const percentage = numberValue(entry.percentage);
    const rangeStart = entry.range_start === null ? null : numberValue(entry.range_start);
    const rangeEnd = entry.range_end === null ? null : numberValue(entry.range_end);
    return percentage !== null && (entry.range_start === null || rangeStart !== null) && (entry.range_end === null || rangeEnd !== null)
      ? [{ rangeStart, rangeEnd, percentage }]
      : [];
  });

  return { lineNumber, trainType, cancellation: { ratePercentage: cancellation }, delay: { averageMinutes, minimumMinutes, maximumMinutes, delayedPercentage }, delayDistribution, calculatedAt };
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
