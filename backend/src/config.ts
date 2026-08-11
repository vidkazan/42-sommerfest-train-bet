const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const optional = (name: string, fallback: string): string =>
  process.env[name]?.trim() || fallback;

export const config = {
  port: Number(optional("PORT", "3001")),
  databasePath: optional("DATABASE_PATH", "./data/trainbet.sqlite"),
  sessionSecret: optional("SESSION_SECRET", "development-secret"),
  adminToken: required("GAME_ADMIN_TOKEN"),
  motisBaseUrl: optional("MOTIS_BASE_URL", "https://api.transitous.org"),
  intBahnBaseUrl: optional("INT_BAHN_BASE_URL", "https://int.bahn.de"),
  transitProvider: optional("TRANSIT_PROVIDER", "motis"),
  eventTimezone: optional("EVENT_TIMEZONE", "Europe/Berlin"),
  cacheTtlSeconds: Number(optional("CACHE_TTL_SECONDS", "60")),
  transitRequestDelayMs: Number(optional("TRANSIT_REQUEST_DELAY_MS", "500")),
  transitMaxRetries: Number(optional("TRANSIT_MAX_RETRIES", "3")),
};

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

if (!Number.isFinite(config.cacheTtlSeconds) || config.cacheTtlSeconds <= 0) {
  throw new Error("CACHE_TTL_SECONDS must be greater than zero");
}

if (!Number.isFinite(config.transitRequestDelayMs) || config.transitRequestDelayMs < 0) {
  throw new Error("TRANSIT_REQUEST_DELAY_MS must be zero or greater");
}

if (!Number.isInteger(config.transitMaxRetries) || config.transitMaxRetries < 0) {
  throw new Error("TRANSIT_MAX_RETRIES must be a non-negative integer");
}
