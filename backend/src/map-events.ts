export type MapEvent = {
  id: string;
  category: "disruption" | "construction" | "football";
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  startsAt: string;
  endsAt: string;
  severity: "info" | "warning" | "severe";
  source: "manual";
};

type RawDisruption = {
  key?: unknown;
  cause?: unknown;
  subcause?: unknown;
  text?: unknown;
  zeitraum?: { beginn?: unknown; ende?: unknown };
  koordinaten?: Array<{ x?: unknown; y?: unknown }>;
  gleisEinschraenkung?: unknown;
};
type RawConstruction = {
  baustellenID?: unknown;
  wirkung?: unknown;
  gleisEinschraenkung?: unknown;
  arbeiten?: unknown;
  langnameVon?: unknown;
  langnameBis?: unknown;
  zeitraum?: { beginn?: unknown; ende?: unknown };
  koordinaten?: { von?: { x?: unknown; y?: unknown }; bis?: { x?: unknown; y?: unknown } };
};
type RawFootball = {
  time?: unknown;
  homeTeam?: unknown;
  awayTeam?: unknown;
  competition?: unknown;
  location?: unknown;
  coordinates?: { latitude?: unknown; longitude?: unknown };
};

export type ParsedDisruptions = { events: MapEvent[]; skipped: Array<{ key: string; reason: string }> };

export type RoutePoint = { lat: number; lon: number };

export type JourneyEventCounts = {
  football: number;
  disruption: number;
  construction: number;
};

function webMercatorToWgs84(x: number, y: number) {
  return {
    latitude: (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI,
    longitude: x / 6378137 * 180 / Math.PI,
  };
}

const asFiniteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const asText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const convertPoint = (value: { x?: unknown; y?: unknown } | undefined) => {
  const x = asFiniteNumber(value?.x); const y = asFiniteNumber(value?.y);
  return x !== null && y !== null ? webMercatorToWgs84(x, y) : null;
};

export function parseDisruptionsJson(raw: string | undefined, windowStart: number, windowEnd: number): ParsedDisruptions {
  if (!raw?.trim()) return { events: [], skipped: [] };
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error("INVALID_DISRUPTIONS_JSON"); }
  if (!Array.isArray(input)) throw new Error("INVALID_DISRUPTIONS_JSON_ARRAY");
  const events: MapEvent[] = [];
  const skipped: Array<{ key: string; reason: string }> = [];
  for (const [index, value] of input.entries()) {
    const item = value as RawDisruption;
    const key = asText(item.key) ?? `record-${index + 1}`;
    const coordinates = Array.isArray(item.koordinaten) ? item.koordinaten.map(convertPoint).filter((point): point is { latitude: number; longitude: number } => point !== null) : [];
    const startsAt = asText(item.zeitraum?.beginn);
    const endsAt = asText(item.zeitraum?.ende);
    const startsMs = startsAt ? Date.parse(startsAt) : NaN;
    const endsMs = endsAt ? Date.parse(endsAt) : NaN;
    if (!coordinates.length) { skipped.push({ key, reason: "MISSING_COORDINATES" }); continue; }
    if (!startsAt || !endsAt || !Number.isFinite(startsMs) || !Number.isFinite(endsMs) || endsMs < windowStart || startsMs > windowEnd) {
      skipped.push({ key, reason: "OUTSIDE_GAME_WINDOW_OR_INVALID_PERIOD" }); continue;
    }
    const latitude = coordinates.reduce((sum, point) => sum + point.latitude, 0) / coordinates.length;
    const longitude = coordinates.reduce((sum, point) => sum + point.longitude, 0) / coordinates.length;
    const severity = item.gleisEinschraenkung === "SCHWER" ? "severe" : "warning";
    events.push({
      id: key,
      category: "disruption",
      title: asText(item.subcause) ?? asText(item.cause) ?? "Railway disruption",
      description: asText(item.text),
      latitude,
      longitude,
      startsAt,
      endsAt,
      severity,
      source: "manual",
    });
  }
  return { events, skipped };
}

export function parseConstructionJson(raw: string | undefined, windowStart: number, windowEnd: number): ParsedDisruptions {
  if (!raw?.trim()) return { events: [], skipped: [] };
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error("INVALID_CONSTRUCTION_JSON"); }
  if (!Array.isArray(input)) throw new Error("INVALID_CONSTRUCTION_JSON_ARRAY");
  const events: MapEvent[] = [];
  const skipped: Array<{ key: string; reason: string }> = [];
  const seenKeys = new Set<string>();
  for (const [index, value] of input.entries()) {
    const item = value as RawConstruction;
    const key = asText(item.baustellenID) ?? `construction-${index + 1}`;
    if (seenKeys.has(key)) { skipped.push({ key, reason: "DUPLICATE_BAUSTELLEN_ID" }); continue; }
    seenKeys.add(key);
    if (item.gleisEinschraenkung !== "SCHWER") { skipped.push({ key, reason: "NOT_SEVERE" }); continue; }
    if (item.wirkung !== "TOTALSPERRUNG" && item.wirkung !== "TEILAUSFALL") { skipped.push({ key, reason: "LOW_RAILWAY_IMPACT" }); continue; }
    const from = convertPoint(item.koordinaten?.von);
    const to = convertPoint(item.koordinaten?.bis);
    const coordinates = [from, to].filter((point): point is { latitude: number; longitude: number } => point !== null);
    const startsAt = asText(item.zeitraum?.beginn);
    const endsAt = asText(item.zeitraum?.ende);
    const startsMs = startsAt ? Date.parse(startsAt) : NaN;
    const endsMs = endsAt ? Date.parse(endsAt) : NaN;
    if (!coordinates.length) { skipped.push({ key, reason: "MISSING_COORDINATES" }); continue; }
    if (!startsAt || !endsAt || !Number.isFinite(startsMs) || !Number.isFinite(endsMs) || endsMs < windowStart || startsMs > windowEnd) {
      skipped.push({ key, reason: "OUTSIDE_GAME_WINDOW_OR_INVALID_PERIOD" }); continue;
    }
    events.push({
      id: key,
      category: "construction",
      title: asText(item.arbeiten) ?? "Construction works",
      description: [asText(item.wirkung), asText(item.langnameVon) && asText(item.langnameBis) ? `${asText(item.langnameVon)} – ${asText(item.langnameBis)}` : null].filter(Boolean).join(" · ") || null,
      latitude: coordinates.reduce((sum, point) => sum + point.latitude, 0) / coordinates.length,
      longitude: coordinates.reduce((sum, point) => sum + point.longitude, 0) / coordinates.length,
      startsAt,
      endsAt,
      severity: item.gleisEinschraenkung === "SCHWER" ? "severe" : "warning",
      source: "manual",
    });
  }
  return { events, skipped };
}

export function parseFootballJson(raw: string | undefined, eventDate: string, windowStart: number, windowEnd: number): ParsedDisruptions {
  if (!raw?.trim()) return { events: [], skipped: [] };
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error("INVALID_FOOTBALL_JSON"); }
  if (!Array.isArray(input)) throw new Error("INVALID_FOOTBALL_JSON_ARRAY");
  const events: MapEvent[] = [];
  const skipped: Array<{ key: string; reason: string }> = [];
  const seenKeys = new Set<string>();
  for (const [index, value] of input.entries()) {
    const item = value as RawFootball;
    const home = asText(item.homeTeam);
    const away = asText(item.awayTeam);
    const location = asText(item.location);
    const timeText = asText(item.time);
    const latitude = asFiniteNumber(item.coordinates?.latitude);
    const longitude = asFiniteNumber(item.coordinates?.longitude);
    const key = `${timeText ?? "match"}:${home ?? index}:${away ?? ""}`;
    if (seenKeys.has(key)) { skipped.push({ key, reason: "DUPLICATE_FOOTBALL_MATCH" }); continue; }
    seenKeys.add(key);
    const startsAt = timeText?.includes("T") ? timeText : `${eventDate}T${timeText ?? ""}:00+02:00`;
    const startsMs = Date.parse(startsAt);
    const endsMs = startsMs + 2 * 60 * 60 * 1000;
    if (latitude === null || longitude === null) { skipped.push({ key, reason: "MISSING_COORDINATES" }); continue; }
    if (!home || !away || !timeText || !Number.isFinite(startsMs) || endsMs < windowStart || startsMs > windowEnd) {
      skipped.push({ key, reason: "OUTSIDE_GAME_WINDOW_OR_INVALID_TIME" }); continue;
    }
    events.push({
      id: key,
      category: "football",
      title: `${home} – ${away}`,
      description: [asText(item.competition), location].filter(Boolean).join(" · ") || null,
      latitude,
      longitude,
      startsAt: new Date(startsMs).toISOString(),
      endsAt: new Date(endsMs).toISOString(),
      severity: "warning",
      source: "manual",
    });
  }
  return { events, skipped };
}

function distanceToSegmentKm(point: RoutePoint, start: RoutePoint, end: RoutePoint) {
  const latScale = 111.32;
  const lonScale = 111.32 * Math.cos(point.lat * Math.PI / 180);
  const px = point.lon * lonScale;
  const py = point.lat * latScale;
  const ax = start.lon * lonScale;
  const ay = start.lat * latScale;
  const bx = end.lon * lonScale;
  const by = end.lat * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + progress * dx), py - (ay + progress * dy));
}

function distanceToRouteKm(point: RoutePoint, route: RoutePoint[]) {
  if (!route.length) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return Math.hypot((point.lat - route[0].lat) * 111.32, (point.lon - route[0].lon) * 111.32 * Math.cos(point.lat * Math.PI / 180));
  return Math.min(...route.slice(1).map((end, index) => distanceToSegmentKm(point, route[index], end)));
}

export function filterEventsByJourneyPaths(events: MapEvent[], routes: RoutePoint[][], thresholdKm = 1) {
  const accepted: MapEvent[] = [];
  const skipped: Array<{ key: string; reason: string }> = [];
  for (const event of events) {
    if (routes.some((route) => distanceToRouteKm({ lat: event.latitude, lon: event.longitude }, route) <= thresholdKm)) accepted.push(event);
    else skipped.push({ key: event.id, reason: "OUTSIDE_SELECTED_JOURNEY_PATH" });
  }
  return { accepted, skipped };
}

/** Count the stored map events close to one journey's route. */
export function countEventsByCategory(events: MapEvent[], route: RoutePoint[]): JourneyEventCounts {
  const counts: JourneyEventCounts = { football: 0, disruption: 0, construction: 0 };
  for (const event of events) {
    const thresholdKm = event.category === "football" ? 10 : 1;
    if (distanceToRouteKm({ lat: event.latitude, lon: event.longitude }, route) <= thresholdKm) counts[event.category] += 1;
  }
  return counts;
}
