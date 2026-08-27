const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export type ApiErrorBody = { error?: string; [key: string]: unknown };

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: ApiErrorBody) {
    super(body.error ?? `API request failed (${status})`);
  }
}

export type Station = { stopId: string; name: string; lat: number | null; lon: number | null };

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
export type SkippedDisruption = { key: string; reason: string };

export type TrainHistory = {
  lineNumber: string;
  lineGameName: string | null;
  lineGameDescription: string | null;
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
  durationStars?: number | null;
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
  cancellation: { ratePercentage: number };
  delay: { averageMinutes: number; minimumMinutes: number | null; maximumMinutes: number | null; delayedPercentage: number | null };
  calculatedAt: string;
};

export type Journey = {
  id: string;
  externalTripId: string;
  displayName: string;
  lineName?: string | null;
  trainNumber?: string | null;
  history?: TrainHistory | null;
  eventCounts?: { football: number; disruption: number; construction: number };
  origin: string;
  destination: string;
  scheduledDeparture: string;
  scheduledArrival?: string;
  durationSeconds: number;
  stopCount?: number | null;
  originStopId?: string | null;
  included?: boolean;
  status?: string;
  exclusionReason?: string | null;
  routeJson?: string | null;
  geometry?: string | null;
  actualArrival?: string | null;
  raceDelayMinutes?: number | null;
  finalDelayMinutes?: number | null;
  currentDelayMinutes?: number | null;
  actualDeparture?: string | null;
  departureDelayMinutes?: number | null;
  liveStatus?: string;
  liveError?: string | null;
  raceColor?: string | null;
};
export type LiveStop = { name?: string; scheduledArrival?: string; scheduledDeparture?: string; actualArrival?: string; actualDeparture?: string };
export type ReplaySnapshot = { delayMinutes: number | null; currentDelayMinutes: number | null; departureDelayMinutes: number | null; finalDelayMinutes: number | null; status: string; actualArrival: string | null; actualDeparture: string | null; routeJson: string | null; recordedAt: string };

export type Game = {
  id: string;
  name: string;
  eventDate: string;
  timezone: string;
  status: string;
  journeyDepartureStart?: string;
  journeyDepartureEnd?: string;
  bettingStart?: string;
  bettingEnd?: string;
  gameEndTime?: string | null;
  stopIds?: string[];
  mapEvents?: MapEvent[];
};
export type ActiveGame = Pick<Game, "id" | "name" | "eventDate" | "timezone" | "bettingStart" | "bettingEnd" | "gameEndTime" | "status">;

export type LiveEvent = {
  id: string;
  type: string;
  trainId?: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "severe";
  source: "generated" | "motis";
  displayName?: string;
  currentDelayMinutes?: number | null;
  previousDelayMinutes?: number | null;
  changeMinutes?: number | null;
  createdAt: string;
};

export type JourneyFetchResult = {
  candidates: Journey[];
  fetchedAt: string;
  fetchedCount: number;
  includedCount: number;
  excludedCount: number;
  stale: boolean;
  stationErrors?: string[];
};

export type AdminDashboard = {
  state: "no_active_game" | "waiting" | "live" | "finished";
  game: { id: string; name: string; eventDate: string; timezone: string; status: string; journeyDepartureStart: string; gameEndTime: string | null; bettingStart: string; bettingEnd: string } | null;
  entries: Array<{
    trainId: string; displayName: string; origin: string; destination: string;
    scheduledDeparture: string; scheduledArrival: string; durationSeconds: number; stopCount: number | null;
    actualArrival: string | null; raceDelayMinutes: number | null; finalDelayMinutes: number | null;
    currentDelayMinutes: number | null; departureDelayMinutes: number | null; status: string; liveError: string | null;
    position: number | null; cancelled: boolean; stale: boolean; raceColor: string | null; betCount: number; routeJson?: string | null; stops?: LiveStop[]; delayHistory: Array<{ delayMinutes: number; recordedAt: string }>; replayHistory: ReplaySnapshot[];
  }>;
  lastUpdatedAt: string | null;
  stale: boolean;
};

export type PopulateBetsResult = { gameId: string; totalTrains: number; createdBets: number; existingBets: number };

async function request<T>(path: string, init: RequestInit = {}, adminToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (adminToken) headers.set("Authorization", `Bearer ${adminToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

export const api = {
  checkAdmin: (token: string) => request<{ ok: true }>("/api/admin/auth/check", {}, token),
  getAdminDashboard: (gameId: string, token: string) => request<AdminDashboard>(`/api/admin/games/${encodeURIComponent(gameId)}/dashboard`, {}, token),
  populateBets: (gameId: string, token: string) => request<PopulateBetsResult>(`/api/admin/games/${encodeURIComponent(gameId)}/populate-bets`, { method: "POST" }, token),

  searchStations: (text: string, token: string) =>
    request<Station[]>(`/api/admin/stations/search?text=${encodeURIComponent(text)}`, {}, token),

  createGame: (body: { name?: string; eventDate: string; bettingStart: string; bettingEnd: string; journeyDepartureStart: string; journeyDepartureEnd: string; stopIds: string[] }, token: string) =>
    request<{ game: Game; skippedDisruptions?: SkippedDisruption[] }>("/api/admin/games", { method: "POST", body: JSON.stringify(body) }, token),
  applyDisruptions: (gameId: string, disruptionsJson: string, constructionJson: string, footballJson: string, token: string, preview = false) =>
    request<{ preview: boolean; mapEvents: MapEvent[]; skippedDisruptions: SkippedDisruption[]; appliedAt?: string }>(
      `/api/admin/games/${gameId}/disruptions/apply`,
      { method: "POST", body: JSON.stringify({ disruptionsJson, constructionJson, footballJson, preview }) },
      token,
    ),
  listAdminGames: (token: string) => request<{ games: Game[] }>("/api/admin/games", {}, token),
  removeGame: (gameId: string, token: string) => request<{ gameId: string; removed: true }>(`/api/admin/games/${gameId}/remove`, { method: "POST" }, token),

  fetchJourneys: (gameId: string, token: string) =>
    request<JourneyFetchResult>(`/api/admin/games/${gameId}/fetch-journeys`, { method: "POST" }, token),

  getAdminGame: (gameId: string, token: string) =>
    request<{ game: Game; journeys: Journey[]; counts: Record<string, number>; events: unknown[] }>(`/api/admin/games/${gameId}`, {}, token),

  selectJourneys: (gameId: string, tripIds: string[], token: string) =>
    request<{ gameId: string; tripIds: string[]; selectedCount: number; savedAt: string }>(
      `/api/admin/games/${gameId}/journeys/select`,
      { method: "POST", body: JSON.stringify({ tripIds }) },
      token,
    ),

  confirmGame: (gameId: string, token: string) =>
    request<{ gameId: string; status: "active"; selectedCount: number; activatedAt: string }>(
      `/api/admin/games/${gameId}/confirm`,
      { method: "POST" },
      token,
    ),

  getGame: (gameId: string) => request<{ game: Game }>(`/api/games/${encodeURIComponent(gameId)}`),
  listActiveGames: () => request<{ games: ActiveGame[] }>("/api/games"),
  getTrains: (gameId: string) => request<{ trains: Journey[]; lastUpdatedAt: string | null; stale: boolean }>(`/api/trains?gameId=${encodeURIComponent(gameId)}`),
  getProgress: (gameId: string) => request<{ trains: Array<{ id: string; displayName: string; scheduledDeparture: string; scheduledArrival: string; actualArrival: string | null; raceDelayMinutes: number | null; currentDelayMinutes: number | null; departureDelayMinutes: number | null; status: string; cancelled: boolean; stale: boolean; raceColor?: string | null; geometry?: string | null; routeJson?: string | null; stops?: LiveStop[] }>; lastUpdatedAt: string | null; stale: boolean }>(`/api/progress?gameId=${encodeURIComponent(gameId)}`),
  getLeaderboard: (gameId: string) => request<{ entries: Array<{ trainId: string; displayName: string; origin: string; destination: string; position: number | null; scheduledDeparture: string; scheduledArrival: string; durationSeconds: number; stopCount: number | null; actualArrival: string | null; raceDelayMinutes: number | null; finalDelayMinutes: number | null; currentDelayMinutes: number | null; departureDelayMinutes: number | null; status: string; cancelled: boolean; stale: boolean; raceColor?: string | null; routeJson?: string | null; stops?: LiveStop[]; delayHistory: Array<{ delayMinutes: number; recordedAt: string }>; replayHistory: ReplaySnapshot[]; bettors: Array<{ participantId: string; username: string }> }>; lastUpdatedAt: string | null; stale: boolean }>(`/api/leaderboard?gameId=${encodeURIComponent(gameId)}`),
  getEvents: (gameId: string, limit = 5) => request<{ events: LiveEvent[] }>(`/api/events?gameId=${encodeURIComponent(gameId)}&limit=${limit}`),
  getResults: (gameId: string) => request<{ status: string; final: boolean; winners: Array<{ username: string; delaySeconds: number; outcome?: "delay" | "cancellation"; position?: number; trainId?: string; trainName?: string; raceColor?: string | null; bettors?: string[] }>; trains: unknown[] }>(`/api/results?gameId=${encodeURIComponent(gameId)}`),
  getParticipantMe: (gameId: string) => request<{ participantId: string; username: string; trainId: string; hasBet: true }>(`/api/participants/me?gameId=${encodeURIComponent(gameId)}`),
  checkUsernameAvailability: (username: string, gameId: string) =>
    request<{ available: boolean }>(`/api/participants/availability?gameId=${encodeURIComponent(gameId)}&username=${encodeURIComponent(username)}`),

  createParticipant: (username: string, gameId: string) =>
    request<{ participantId: string; username: string }>("/api/participants", {
      method: "POST",
      body: JSON.stringify({ username, gameId }),
    }),

  submitBet: (trainId: string, gameId: string) =>
    request<{ ok: true; trainId: string }>("/api/bets", {
      method: "POST",
      body: JSON.stringify({ trainId, gameId }),
    }),
};
