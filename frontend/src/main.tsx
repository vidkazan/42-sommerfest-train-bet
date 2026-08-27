import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { api, type AdminDashboard, type Game, type Journey, type LiveEvent, type ReplaySnapshot, type Station } from "./api/client";
import { AdminAccessView, AdminActiveView, AdminDashboardView, AdminGameListView, AdminReviewView, AdminSetupView, Badge, BadgeButton, BetView, Button, Card, BrandHeader, GameHeader, LeaderboardView, LiveEventsView, LiveLeaderboardView, Notice, PlayerOnboarding, RaceChartView, ReplayBadge, TimeLabelView, TrainIcon, TrainMapView, type LiveLeaderboardEntry, type PublicView } from "./design-system";
import "leaflet/dist/leaflet.css";
import "./styles.css";

type AppMode = "public" | "admin" | "not-found";
type AdminView = "access" | "create" | "review" | "active" | "dashboard";

const formatLocalDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const formatLocalTime = (value: Date) => `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
const formatGameEndTime = (value?: string | null) => {
  if (!value) return "unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unavailable" : formatLocalTime(date);
};
const defaultGameSchedule = () => {
  const opening = new Date();
  opening.setMinutes(0, 0, 0);
  opening.setHours(opening.getHours() + 1);
  const closing = new Date(opening.getTime() + 60 * 60 * 1000);
  return {
    eventDate: formatLocalDate(opening),
    opening: formatLocalTime(opening),
    closing: formatLocalTime(closing),
  };
};

const gameCreationDraftStorageKey = "choochoo_game_creation_draft";
const replayFrameDurationMs = 1_000;
const replayMinuteMs = 60_000;
type ReplayableEntry = { trainId: string; raceDelayMinutes: number | null; currentDelayMinutes?: number | null; finalDelayMinutes?: number | null; status?: string; actualArrival?: string | null; actualDeparture?: string | null; routeJson?: string | null; delayHistory?: Array<{ delayMinutes: number; recordedAt: string }>; replayHistory?: ReplaySnapshot[] };
type ReplayFrame<T> = { timestamp: number; entries: T[] };

const readStoredTimestamp = (key: string) => {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch { return null; }
};
const storeTimestamp = (key: string, value: number) => {
  try { localStorage.setItem(key, String(value)); } catch { /* local persistence is best effort */ }
};
function buildReplayFrames<T extends ReplayableEntry>(entries: T[], from: number, to: number): ReplayFrame<T>[] {
  const timestamps = [...new Set(entries.flatMap((entry) => (entry.replayHistory ?? entry.delayHistory ?? [])
    .map((snapshot) => Date.parse(snapshot.recordedAt))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > from && timestamp <= to)
    .map((timestamp) => Math.floor(timestamp / replayMinuteMs) * replayMinuteMs)))].sort((left, right) => left - right);
  return timestamps.map((timestamp) => ({ timestamp, entries: entries.map((entry) => {
    const history = entry.replayHistory ?? (entry.delayHistory ?? []).map((snapshot) => ({ delayMinutes: snapshot.delayMinutes, currentDelayMinutes: snapshot.delayMinutes, departureDelayMinutes: null, finalDelayMinutes: null, status: entry.status ?? "in_progress", actualArrival: entry.actualArrival ?? null, actualDeparture: entry.actualDeparture ?? null, routeJson: entry.routeJson ?? null, recordedAt: snapshot.recordedAt }));
    const candidates = history.filter((snapshot) => Date.parse(snapshot.recordedAt) <= timestamp + replayMinuteMs - 1);
    const snapshot = candidates[candidates.length - 1];
    const replayDelayHistory = history.filter((item) => Date.parse(item.recordedAt) <= timestamp + replayMinuteMs - 1 && item.delayMinutes !== null).map((item) => ({ delayMinutes: item.delayMinutes as number, recordedAt: item.recordedAt }));
    return snapshot ? { ...entry, raceDelayMinutes: snapshot.delayMinutes, currentDelayMinutes: snapshot.currentDelayMinutes, finalDelayMinutes: snapshot.finalDelayMinutes, status: snapshot.status, actualArrival: snapshot.actualArrival, actualDeparture: snapshot.actualDeparture, routeJson: snapshot.routeJson ?? entry.routeJson, delayHistory: replayDelayHistory } : { ...entry, raceDelayMinutes: null, currentDelayMinutes: null, finalDelayMinutes: null, status: "waiting_for_departure", delayHistory: replayDelayHistory };
  }) }));
}
function earliestReplayTimestamp<T extends ReplayableEntry>(entries: T[], fallback: number) {
  const timestamps = entries.flatMap((entry) => (entry.replayHistory ?? entry.delayHistory ?? []).map((snapshot) => Date.parse(snapshot.recordedAt)).filter((timestamp) => Number.isFinite(timestamp)));
  return timestamps.length > 0 ? Math.min(...timestamps) : fallback;
}
type GameCreationDraft = {
  gameName: string;
  eventDate: string;
  bettingStart: string;
  bettingEnd: string;
  journeyDepartureStart: string;
  journeyDepartureEnd: string;
  manualStationIds: string;
  selectedStations: Station[];
};

const readGameCreationDraft = (): Partial<GameCreationDraft> | null => {
  try {
    const stored = localStorage.getItem(gameCreationDraftStorageKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<GameCreationDraft>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

function App() {
  const appBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pathWithoutBase = appBasePath && window.location.pathname.startsWith(appBasePath)
    ? window.location.pathname.slice(appBasePath.length) || "/"
    : window.location.pathname;
  const gamePathMatch = pathWithoutBase.match(/^\/game\/([^/]+)\/?$/);
  const publicGameId = gamePathMatch?.[1] ?? null;
  const mode: AppMode = pathWithoutBase === "/admin" ? "admin" : publicGameId ? "public" : "not-found";
  const [publicView, setPublicView] = useState<PublicView>("browse");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [adminView, setAdminView] = useState<AdminView>("access");
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminInput, setAdminInput] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [stationQuery, setStationQuery] = useState("");
  const [stationResults, setStationResults] = useState<Station[]>([]);
  const [selectedStations, setSelectedStations] = useState<Station[]>([]);
  const [manualStationIds, setManualStationIds] = useState("");
  const [gameName, setGameName] = useState("ChooChoo Delay Race");
  const [defaultSchedule] = useState(defaultGameSchedule);
  const [eventDate, setEventDate] = useState(defaultSchedule.eventDate);
  const [bettingStart, setBettingStart] = useState(defaultSchedule.opening);
  const [bettingEnd, setBettingEnd] = useState(defaultSchedule.closing);
  const [journeyDepartureStart, setJourneyDepartureStart] = useState(defaultSchedule.opening);
  const [journeyDepartureEnd, setJourneyDepartureEnd] = useState(defaultSchedule.closing);
  const [gameCreationDraftHydrated, setGameCreationDraftHydrated] = useState(false);
  const [disruptionsJson, setDisruptionsJson] = useState("");
  const [constructionJson, setConstructionJson] = useState("");
  const [footballJson, setFootballJson] = useState("");
  const [stationLoading, setStationLoading] = useState(false);
  const [stationError, setStationError] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [adminGame, setAdminGame] = useState<Game | null>(null);
  const [adminGames, setAdminGames] = useState<Game[]>([]);
  const [adminDashboard, setAdminDashboard] = useState<AdminDashboard | null>(null);
  const [adminPopulateMessage, setAdminPopulateMessage] = useState<string | null>(null);
  const [selectedJourneyIds, setSelectedJourneyIds] = useState<string[]>([]);
  const [minimumJourneyDuration, setMinimumJourneyDuration] = useState("0");
  const [minimumJourneyStars, setMinimumJourneyStars] = useState("0");
  const [maximumJourneyStars, setMaximumJourneyStars] = useState("25");
  const [minimumDelayMinutes, setMinimumDelayMinutes] = useState("0");
  const [maximumDelayMinutes, setMaximumDelayMinutes] = useState("60");
  const [onlyJourneysWithGameName, setOnlyJourneysWithGameName] = useState(false);
  const [whitelistSaved, setWhitelistSaved] = useState(false);
  const [skippedDisruptions, setSkippedDisruptions] = useState<Array<{ key: string; reason: string }>>([]);
  const [disruptionMessage, setDisruptionMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateStationSelection = (station: Station, selected: boolean) => {
    const currentIds = manualStationIds.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean);
    const next = selected
      ? selectedStations.filter((item) => item.stopId !== station.stopId)
      : [...selectedStations, station];
    const nextIds = selected
      ? currentIds.filter((id) => id !== station.stopId)
      : [...currentIds, station.stopId];
    setSelectedStations(next);
    setManualStationIds([...new Set(nextIds)].join("\n"));
  };
  const [username, setUsername] = useState("");
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null);
  const [betSubmitted, setBetSubmitted] = useState(false);
  const [hasConfirmedBet, setHasConfirmedBet] = useState(false);
  const [betLoading, setBetLoading] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);
  const [usernameCheckLoading, setUsernameCheckLoading] = useState(false);
  const [usernameCheckError, setUsernameCheckError] = useState<string | null>(null);
  const [storedUserId, setStoredUserId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LiveLeaderboardEntry[]>([]);
  const [leaderboardUpdatedAt, setLeaderboardUpdatedAt] = useState<string | null>(null);
  const [leaderboardStale, setLeaderboardStale] = useState(false);
  const [nextProgressUpdateAt, setNextProgressUpdateAt] = useState<number | null>(null);
  const [progressUpdating, setProgressUpdating] = useState(false);
  const [publicReplayFrames, setPublicReplayFrames] = useState<ReplayFrame<LiveLeaderboardEntry>[]>([]);
  const [publicReplayIndex, setPublicReplayIndex] = useState(0);
  const [publicReplayRemainingSeconds, setPublicReplayRemainingSeconds] = useState(0);
  const [publicReplayActive, setPublicReplayActive] = useState(false);
  const [adminNextUpdateAt, setAdminNextUpdateAt] = useState<number | null>(null);
  const publicReplayActiveRef = useRef(false);
  const publicRequestRef = useRef(false);
  const adminRequestRef = useRef(false);
  const loadProgressRef = useRef<(() => Promise<void>) | null>(null);
  const latestPublicTimestampRef = useRef<number | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [results, setResults] = useState<{ status: string; final: boolean; winners: Array<{ username: string; delaySeconds: number; outcome?: "delay" | "cancellation"; position?: number; trainId?: string; trainName?: string; raceColor?: string | null; bettors?: string[] }>; trains: unknown[] } | null>(null);

  useEffect(() => {
    if (mode !== "public" || !publicGameId) return;
    setOnboardingOpen(localStorage.getItem(`choochoo-onboarding-seen:${publicGameId}`) !== "true");
  }, [mode, publicGameId]);

  const closeOnboarding = () => {
    if (publicGameId) localStorage.setItem(`choochoo-onboarding-seen:${publicGameId}`, "true");
    setOnboardingOpen(false);
  };

  useEffect(() => {
    if (mode !== "admin") return;
    const draft = readGameCreationDraft();
    if (draft) {
      if (typeof draft.gameName === "string") setGameName(draft.gameName);
      if (typeof draft.eventDate === "string") setEventDate(draft.eventDate);
      if (typeof draft.bettingStart === "string") setBettingStart(draft.bettingStart);
      if (typeof draft.bettingEnd === "string") setBettingEnd(draft.bettingEnd);
      if (typeof draft.journeyDepartureStart === "string") setJourneyDepartureStart(draft.journeyDepartureStart);
      if (typeof draft.journeyDepartureEnd === "string") setJourneyDepartureEnd(draft.journeyDepartureEnd);
      if (typeof draft.manualStationIds === "string") setManualStationIds(draft.manualStationIds);
      if (Array.isArray(draft.selectedStations)) {
        setSelectedStations(draft.selectedStations.filter((station): station is Station => Boolean(
          station && typeof station === "object" && typeof station.stopId === "string" && typeof station.name === "string",
        )));
      }
    }
    setGameCreationDraftHydrated(true);
  }, [mode]);

  useEffect(() => {
    if (mode !== "admin" || !gameCreationDraftHydrated) return;
    const draft: GameCreationDraft = { gameName, eventDate, bettingStart, bettingEnd, journeyDepartureStart, journeyDepartureEnd, manualStationIds, selectedStations };
    try { localStorage.setItem(gameCreationDraftStorageKey, JSON.stringify(draft)); } catch { /* local persistence is best effort */ }
  }, [mode, gameCreationDraftHydrated, gameName, eventDate, bettingStart, bettingEnd, journeyDepartureStart, journeyDepartureEnd, manualStationIds, selectedStations]);

  const bettingClosed = Boolean(game?.bettingEnd && Date.parse(game.bettingEnd) <= clockNow);

  const selectTrain = (trainId: string) => {
    setSelectedTrainId(trainId);
  };

  const acceptAdminDashboard = (next: AdminDashboard) => {
    setAdminDashboard(next);
  };

  useEffect(() => {
    if (mode !== "public") return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (mode === "public" && bettingClosed) setPublicView("race");
  }, [mode, bettingClosed]);

  useEffect(() => {
    if (mode !== "public") return;
    if (!publicGameId) return;
    Promise.all([api.getGame(publicGameId), api.getTrains(publicGameId)])
      .then(([activeGame, trains]) => {
        setGame(activeGame.game);
        setJourneys(trains.trains);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Could not load the game");
      })
      .finally(() => setLoading(false));
  }, [mode, publicGameId]);

  useEffect(() => {
    if (mode !== "public") return;
    let active = true;
    const refreshJourneys = async () => {
      try {
        const next = await api.getTrains(publicGameId ?? "");
        if (active) setJourneys(next.trains);
      } catch { /* retain the last successful journey snapshot */ }
    };
    const timer = window.setInterval(refreshJourneys, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [mode, publicGameId]);

  useEffect(() => {
    if (mode !== "public") return;
    try {
      const saved = JSON.parse(localStorage.getItem("trainbet_user") ?? "null") as { gameId?: string; userId?: string; nickname?: string } | null;
      if (!saved?.userId || !saved.nickname) return;
      if (saved.gameId !== publicGameId) return;
      setStoredUserId(saved.userId);
      setUsername(saved.nickname);
      api.getParticipantMe(publicGameId ?? "").then((participant) => {
        if (participant.participantId !== saved.userId || !participant.hasBet) throw new Error("stale identity");
        setSelectedTrainId(participant.trainId);
        setBetSubmitted(true);
        setHasConfirmedBet(true);
        setPublicView("race");
      }).catch(() => {
        localStorage.removeItem("trainbet_user");
        setStoredUserId(null);
        setHasConfirmedBet(false);
      });
    } catch {
      localStorage.removeItem("trainbet_user");
      setHasConfirmedBet(false);
    }
  }, [mode, publicGameId]);

  useEffect(() => {
    if (mode !== "public" || (!hasConfirmedBet && !bettingClosed)) return;
    let active = true;
    let timer: number | null = null;
    const refreshIntervalMs = 60_000;
    const replayKey = `choochoo-race-last-viewed:${publicGameId}`;
    const loadProgress = async () => {
      if (!active || publicRequestRef.current || publicReplayActiveRef.current) return;
      publicRequestRef.current = true;
      setProgressUpdating(true);
      try {
        const [nextLeaderboard, nextJourneys, nextEvents] = await Promise.all([api.getLeaderboard(publicGameId ?? ""), api.getTrains(publicGameId ?? ""), api.getEvents(publicGameId ?? "")]);
        if (active) {
          const latestTimestamp = nextLeaderboard.lastUpdatedAt ? Date.parse(nextLeaderboard.lastUpdatedAt) : Math.max(...nextLeaderboard.entries.flatMap((entry) => (entry.delayHistory ?? []).map((snapshot) => Date.parse(snapshot.recordedAt))), 0);
          const previousTimestamp = readStoredTimestamp(replayKey);
          const frames = previousTimestamp && latestTimestamp > previousTimestamp + replayMinuteMs ? buildReplayFrames(nextLeaderboard.entries, previousTimestamp, latestTimestamp) : [];
          latestPublicTimestampRef.current = latestTimestamp || null;
          setLeaderboard(nextLeaderboard.entries); setLeaderboardUpdatedAt(nextLeaderboard.lastUpdatedAt); setLeaderboardStale(nextLeaderboard.stale); setJourneys(nextJourneys.trains); setLiveEvents(nextEvents.events);
          if (frames.length > 0 && !publicReplayActiveRef.current) {
            publicReplayActiveRef.current = true; setPublicReplayFrames(frames); setPublicReplayIndex(0); setPublicReplayRemainingSeconds(frames.length); setPublicReplayActive(true); setNextProgressUpdateAt(null);
          } else if (!publicReplayActiveRef.current && latestTimestamp && document.visibilityState === "visible") storeTimestamp(replayKey, latestTimestamp);
        }
      } catch { /* retain the last successful progress snapshot */ }
      finally {
        if (active) {
          setProgressUpdating(false);
          publicRequestRef.current = false;
          if (!publicReplayActiveRef.current) {
            setNextProgressUpdateAt(Date.now() + refreshIntervalMs);
            timer = window.setTimeout(() => { void loadProgress(); }, refreshIntervalMs);
          }
        }
      }
    };
    const refreshOnReturn = () => { if (document.visibilityState === "visible") void loadProgress(); };
    window.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("pageshow", refreshOnReturn);
    loadProgressRef.current = loadProgress;
    setNextProgressUpdateAt(Date.now() + refreshIntervalMs);
    void loadProgress();
    return () => { active = false; publicRequestRef.current = false; loadProgressRef.current = null; setProgressUpdating(false); if (timer !== null) window.clearTimeout(timer); window.removeEventListener("visibilitychange", refreshOnReturn); window.removeEventListener("pageshow", refreshOnReturn); };
  }, [mode, hasConfirmedBet, bettingClosed, publicGameId]);

  useEffect(() => {
    if (!publicReplayActive || publicReplayFrames.length === 0 || !publicGameId) return;
    const replayKey = `choochoo-race-last-viewed:${publicGameId}`;
    const timer = window.setInterval(() => {
      setPublicReplayIndex((current) => {
        if (current + 1 >= publicReplayFrames.length) {
          publicReplayActiveRef.current = false; setPublicReplayActive(false); setPublicReplayFrames([]); setPublicReplayRemainingSeconds(0);
          if (latestPublicTimestampRef.current) storeTimestamp(replayKey, latestPublicTimestampRef.current);
          setNextProgressUpdateAt(Date.now() + 60_000);
          void loadProgressRef.current?.();
          return 0;
        }
        setPublicReplayRemainingSeconds((seconds) => Math.max(0, seconds - 1));
        return current + 1;
      });
    }, replayFrameDurationMs);
    return () => window.clearInterval(timer);
  }, [publicReplayActive, publicReplayFrames.length, publicGameId]);

  const skipPublicReplay = () => {
    if (!publicReplayActive) return;
    publicReplayActiveRef.current = false; setPublicReplayActive(false); setPublicReplayFrames([]); setPublicReplayIndex(0); setPublicReplayRemainingSeconds(0);
    if (publicGameId && latestPublicTimestampRef.current) storeTimestamp(`choochoo-race-last-viewed:${publicGameId}`, latestPublicTimestampRef.current);
    setNextProgressUpdateAt(Date.now() + 60_000);
    void loadProgressRef.current?.();
  };

  const startPublicReplay = () => {
    if (publicReplayActiveRef.current || leaderboard.length === 0) return;
    const latestTimestamp = latestPublicTimestampRef.current ?? Date.now();
    const firstTimestamp = earliestReplayTimestamp(leaderboard, latestTimestamp);
    const frames = buildReplayFrames(leaderboard, firstTimestamp - 1, latestTimestamp);
    if (frames.length === 0) return;
    publicReplayActiveRef.current = true; setPublicReplayFrames(frames); setPublicReplayIndex(0); setPublicReplayRemainingSeconds(frames.length); setPublicReplayActive(true); setNextProgressUpdateAt(null);
  };

  useEffect(() => {
    if (!adminToken) return;
    api.listAdminGames(adminToken).then((result) => setAdminGames(result.games)).catch(() => undefined);
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken || adminView !== "dashboard") return;
    let active = true;
    const refreshDashboard = async () => {
      try {
        if (!adminDashboard?.game?.id || adminRequestRef.current) return;
        adminRequestRef.current = true;
        const next = await api.getAdminDashboard(adminDashboard.game.id, adminToken);
        if (active) acceptAdminDashboard(next);
      } catch { /* keep the last dashboard snapshot visible */ }
      finally { adminRequestRef.current = false; }
      if (active) setAdminNextUpdateAt(Date.now() + 60_000);
    };
    const refreshOnReturn = () => { if (document.visibilityState === "visible") void refreshDashboard(); };
    window.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("pageshow", refreshOnReturn);
    const timer = window.setInterval(refreshDashboard, 60_000);
    return () => { active = false; adminRequestRef.current = false; window.clearInterval(timer); window.removeEventListener("visibilitychange", refreshOnReturn); window.removeEventListener("pageshow", refreshOnReturn); };
  }, [adminDashboard?.game?.id, adminToken, adminView]);

  const openAdminDashboard = async (gameToShow: Game) => {
    if (!adminToken) return;
    setAdminLoading(true);
    setAdminError(null);
    try {
      const dashboard = await api.getAdminDashboard(gameToShow.id, adminToken);
      acceptAdminDashboard(dashboard);
      setAdminNextUpdateAt(Date.now() + 60_000);
      setAdminView("dashboard");
    } catch (reason: unknown) {
      setAdminError(reason instanceof Error ? reason.message : "Could not load dashboard");
    } finally {
      setAdminLoading(false);
    }
  };

  const populateAdminBets = async (gameToPopulate: Game) => {
    if (!adminToken) return;
    setAdminLoading(true);
    setAdminError(null);
    setAdminPopulateMessage(null);
    try {
      const result = await api.populateBets(gameToPopulate.id, adminToken);
      setAdminPopulateMessage(`${result.createdBets} demo bet${result.createdBets === 1 ? "" : "s"} added${result.existingBets ? `; ${result.existingBets} already existed` : ""}.`);
    } catch (reason: unknown) {
      setAdminError(reason instanceof Error ? reason.message : "Could not populate demo bets");
    } finally {
      setAdminLoading(false);
    }
  };

  const continueAdminGame = async (gameToContinue: Game) => {
    if (!adminToken) return;
    setAdminLoading(true);
    setAdminError(null);
    setWhitelistSaved(false);
    setSkippedDisruptions([]);
    setDisruptionMessage(null);
    try {
      const draft = await api.getAdminGame(gameToContinue.id, adminToken);
      setAdminGame(draft.game);
      setJourneys(draft.journeys);
      setSelectedJourneyIds(draft.journeys.filter((journey) => journey.included).map((journey) => journey.externalTripId));
      setAdminView("review");
    } catch (reason: unknown) {
      setAdminError(reason instanceof Error ? reason.message : "Could not continue game draft");
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== "public" || (!hasConfirmedBet && !bettingClosed)) return;
    let active = true;
    const loadResults = async () => {
      try { const next = await api.getResults(publicGameId ?? ""); if (active) setResults(next); } catch { /* retain last result */ }
    };
    void loadResults();
    const timer = window.setInterval(loadResults, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [mode, hasConfirmedBet, bettingClosed, publicGameId]);

  const submitBet = async () => {
    if (!selectedTrainId || !username.trim()) return;
    setBetLoading(true);
    setBetError(null);
    try {
      const participant = await api.createParticipant(username, publicGameId ?? "");
      await api.submitBet(selectedTrainId, publicGameId ?? "");
      localStorage.setItem("trainbet_user", JSON.stringify({ gameId: publicGameId, userId: participant.participantId, nickname: participant.username }));
      setStoredUserId(participant.participantId);
      setBetSubmitted(true);
      setHasConfirmedBet(true);
      setPublicView("race");
    } catch (reason: unknown) {
      setBetError(reason instanceof Error ? reason.message : "Could not submit bet");
    } finally {
      setBetLoading(false);
    }
  };

  const checkUsername = async () => {
    const normalizedUsername = username.trim();
    setUsernameCheckError(null);
    if (normalizedUsername.length < 2 || normalizedUsername.length > 24) {
      setUsernameCheckError("Username must be between 2 and 24 characters.");
      return false;
    }
    setUsername(normalizedUsername);
    setUsernameCheckLoading(true);
    try {
      const result = await api.checkUsernameAvailability(normalizedUsername, publicGameId ?? "");
      if (!result.available) {
        setUsernameCheckError("This username is already taken.");
        return false;
      }
      return true;
    } catch (reason: unknown) {
      setUsernameCheckError(reason instanceof Error ? reason.message : "Could not check username");
      return false;
    } finally {
      setUsernameCheckLoading(false);
    }
  };

  const submitAdminAccess = async () => {
    setAdminError(null);
    setAdminLoading(true);
    try {
      const token = adminInput;
      await api.checkAdmin(token);
      setAdminToken(token);
      setAdminInput("");
      setAdminView("create");
    } catch (reason: unknown) {
      setAdminError(reason instanceof Error ? reason.message : "Admin authentication failed");
    } finally {
      setAdminLoading(false);
    }
  };

  const deleteAdminGame = async (gameToDelete: Game) => {
    if (!adminToken || !window.confirm(`Permanently delete ${gameToDelete.name}? All bets and journeys will be deleted.`)) return;
    try {
      await api.removeGame(gameToDelete.id, adminToken);
      setAdminGames((current) => current.filter((game) => game.id !== gameToDelete.id));
      if (adminGame?.id === gameToDelete.id) { setAdminGame(null); setJourneys([]); setAdminView("create"); }
    } catch (reason: unknown) {
      setAdminError(reason instanceof Error ? reason.message : "Could not delete game");
    }
  };

  const searchStations = async () => {
    if (stationQuery.trim().length < 2 || !adminToken) return;
    setStationLoading(true);
    setStationError(null);
    try {
      setStationResults(await api.searchStations(stationQuery, adminToken));
    } catch (reason: unknown) {
      setStationError(reason instanceof Error ? reason.message : "Station search failed");
    } finally {
      setStationLoading(false);
    }
  };

  const updateManualStationIds = (value: string) => {
    const ids = new Set(value.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean));
    setManualStationIds(value);
    setSelectedStations((current) => current.filter((station) => ids.has(station.stopId)));
  };

  const createDraftGame = async () => {
    const stopIds = [...new Set(manualStationIds.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean))];
    if (!adminToken || stopIds.length === 0) return;
    setAdminLoading(true);
    setAdminError(null);
    try {
      const result = await api.createGame({ name: gameName.trim() || "ChooChoo Delay Race", eventDate, bettingStart: `${eventDate}T${bettingStart}:00+02:00`, bettingEnd: `${eventDate}T${bettingEnd}:00+02:00`, journeyDepartureStart: `${eventDate}T${journeyDepartureStart}:00+02:00`, journeyDepartureEnd: `${eventDate}T${journeyDepartureEnd}:00+02:00`, stopIds }, adminToken);
      setAdminGame(result.game);
      try { localStorage.removeItem(gameCreationDraftStorageKey); } catch { /* local persistence is best effort */ }
      setSkippedDisruptions([]);
      setDisruptionMessage(null);
      setAdminGames((current) => [result.game, ...current]);
      setAdminView("review");
    } catch (reason: unknown) {
      setAdminError(reason instanceof Error ? reason.message : "Could not create game");
    } finally {
      setAdminLoading(false);
    }
  };

  const applyDisruptions = async () => {
    if (!adminToken || !adminGame) return;
    setAdminLoading(true);
    setAdminError(null);
    setDisruptionMessage(null);
    try {
      const preview = await api.applyDisruptions(adminGame.id, disruptionsJson, constructionJson, footballJson, adminToken, true);
      const accepted = preview.mapEvents.length;
      const skipped = preview.skippedDisruptions.length;
      const confirmed = window.confirm(`Apply ${accepted} disruption${accepted === 1 ? "" : "s"}${skipped ? ` and skip ${skipped}` : ""}? This replaces the existing snapshot.`);
      if (!confirmed) return;
      const result = await api.applyDisruptions(adminGame.id, disruptionsJson, constructionJson, footballJson, adminToken);
      setAdminGame((current) => current ? { ...current, mapEvents: result.mapEvents } : current);
      setSkippedDisruptions(result.skippedDisruptions);
      setDisruptionMessage(`Applied ${result.mapEvents.length} map event${result.mapEvents.length === 1 ? "" : "s"}.`);
    } catch (reason: unknown) {
      setAdminError(reason instanceof Error ? reason.message : "Could not apply disruptions");
    } finally {
      setAdminLoading(false);
    }
  };

  const fetchAdminJourneys = async () => {
    if (!adminToken || !adminGame) return;
    setAdminLoading(true);
    try {
      const result = await api.fetchJourneys(adminGame.id, adminToken);
      setJourneys(result.candidates);
      setSelectedJourneyIds([]);
    } catch (reason: unknown) {
      setAdminError(reason instanceof Error ? reason.message : "Could not fetch journeys");
    } finally {
      setAdminLoading(false);
    }
  };

  const toggleAdminJourney = (tripId: string) => {
    setSelectedJourneyIds((current) => current.includes(tripId) ? current.filter((id) => id !== tripId) : [...current, tripId]);
  };

  const saveAdminWhitelist = async () => {
    if (!adminToken || !adminGame) return;
    setAdminLoading(true);
    setAdminError(null);
    try {
      await api.selectJourneys(adminGame.id, selectedJourneyIds, adminToken);
      setWhitelistSaved(true);
      const refreshed = await api.getAdminGame(adminGame.id, adminToken);
      setJourneys(refreshed.journeys);
    } catch (reason: unknown) {
      setAdminError(reason instanceof Error ? reason.message : "Could not save selected journeys");
    } finally {
      setAdminLoading(false);
    }
  };

  const activateAdminGame = async () => {
    if (!adminToken || !adminGame || !window.confirm("Activate this game? The journey whitelist cannot be changed afterwards.")) return;
    setAdminLoading(true);
    setAdminError(null);
    try {
      const result = await api.confirmGame(adminGame.id, adminToken);
      setAdminGame((current) => current ? { ...current, status: result.status } : current);
      const dashboard = await api.getAdminDashboard(adminGame.id, adminToken);
      acceptAdminDashboard(dashboard);
      setAdminView("dashboard");
    } catch (reason: unknown) {
      setAdminError(reason instanceof Error ? reason.message : "Could not activate game");
    } finally {
      setAdminLoading(false);
    }
  };

  if (mode === "not-found") {
    return <main className="app-shell"><BrandHeader logoSrc={`${import.meta.env.BASE_URL}choochoo-logo.png`} /><section className="card"><h1>Game not found</h1><p>Open a game using its shared game link.</p></section></main>;
  }

  if (mode === "admin") {
    if (adminView === "dashboard" && adminDashboard) {
      return <main className="admin-dashboard-shell"><BrandHeader logoSrc={`${import.meta.env.BASE_URL}choochoo-logo.png`} /><AdminDashboardView key={adminDashboard.game?.id ?? "dashboard"} dashboard={adminDashboard} nextUpdateAt={adminNextUpdateAt} /></main>;
    }
    return (
      <main className="app-shell">
        <BrandHeader logoSrc={`${import.meta.env.BASE_URL}choochoo-logo.png`} />
        <section className="hero">
          <p className="eyebrow">Admin mode</p>
          <h1>Game setup</h1>
          <p>Configure the journeys available for the event.</p>
        </section>
        <section className="card">
          {adminView === "access" && <AdminAccessView value={adminInput} loading={adminLoading} error={adminError} onChange={setAdminInput} onSubmit={submitAdminAccess} />}
          {adminView === "create" && (
            <>
              <AdminGameListView games={adminGames} loading={adminLoading} error={adminError} message={adminPopulateMessage} onDelete={deleteAdminGame} onContinue={continueAdminGame} onDashboard={openAdminDashboard} onPopulateBets={populateAdminBets} />
              <AdminSetupView stationQuery={stationQuery} stationResults={stationResults} selectedStations={selectedStations} manualStationIds={manualStationIds} stationLoading={stationLoading} stationError={stationError} gameName={gameName} eventDate={eventDate} bettingStart={bettingStart} bettingEnd={bettingEnd} journeyDepartureStart={journeyDepartureStart} journeyDepartureEnd={journeyDepartureEnd} loading={adminLoading} error={adminError} onStationQueryChange={setStationQuery} onSearchStations={searchStations} onToggleStation={updateStationSelection} onManualStationIdsChange={updateManualStationIds} onGameNameChange={setGameName} onEventDateChange={setEventDate} onBettingStartChange={setBettingStart} onBettingEndChange={setBettingEnd} onJourneyStartChange={setJourneyDepartureStart} onJourneyEndChange={setJourneyDepartureEnd} onCreateGame={createDraftGame} />
            </>
          )}
          {adminView === "review" && adminGame && <AdminReviewView game={adminGame} journeys={journeys} minimumDuration={minimumJourneyDuration} minimumStars={minimumJourneyStars} maximumStars={maximumJourneyStars} minimumDelayMinutes={minimumDelayMinutes} maximumDelayMinutes={maximumDelayMinutes} onlyJourneysWithGameName={onlyJourneysWithGameName} selectedJourneyIds={selectedJourneyIds} disruptionsJson={disruptionsJson} constructionJson={constructionJson} footballJson={footballJson} skippedDisruptions={skippedDisruptions} disruptionMessage={disruptionMessage} loading={adminLoading} whitelistSaved={whitelistSaved} error={adminError} onDisruptionsJsonChange={setDisruptionsJson} onConstructionJsonChange={setConstructionJson} onFootballJsonChange={setFootballJson} onApplyDisruptions={applyDisruptions} onFetch={fetchAdminJourneys} onMinimumDurationChange={setMinimumJourneyDuration} onMinimumStarsChange={setMinimumJourneyStars} onMaximumStarsChange={setMaximumJourneyStars} onMinimumDelayMinutesChange={setMinimumDelayMinutes} onMaximumDelayMinutesChange={setMaximumDelayMinutes} onOnlyJourneysWithGameNameChange={setOnlyJourneysWithGameName} onToggleJourney={toggleAdminJourney} onSave={saveAdminWhitelist} onActivate={activateAdminGame} />}
          {adminView === "active" && adminGame && <AdminActiveView game={adminGame} />}
        </section>
      </main>
    );
  }

  const liveStateVisible = hasConfirmedBet || bettingClosed;
  const bettedEntries = leaderboard.filter((entry) => entry.bettors.length > 0);
  const publicReplayFrame = publicReplayActive ? publicReplayFrames[publicReplayIndex] : undefined;
  const replayBettedEntries = publicReplayFrame?.entries.filter((entry) => entry.bettors.length > 0);
  const bettedTrainIds = new Set(bettedEntries.map((entry) => entry.trainId));
  const liveJourneys = liveStateVisible ? journeys.filter((journey) => bettedTrainIds.has(journey.id)) : journeys;
  const bettedLiveEvents = liveEvents.filter((event) => Boolean(event.trainId && bettedTrainIds.has(event.trainId)));
  const myTrainId = bettedEntries.find((entry) => entry.bettors.some((bettor) => bettor.participantId === storedUserId))?.trainId ?? null;
  const betViewProps = { journeys, selectedTrainId, username, betSubmitted, loading: betLoading, error: betError, usernameCheckLoading, usernameCheckError, onSelectTrain: selectTrain, onUsernameChange: (value: string) => { setUsername(value); setUsernameCheckError(null); }, onCheckUsername: checkUsername, onSubmit: submitBet };
  const canShowRace = liveStateVisible && bettedEntries.length > 0;

  return (
    <main className="app-shell public-shell">
      <BrandHeader logoSrc={`${import.meta.env.BASE_URL}choochoo-logo.png`} />
      {publicView === "browse" && <GameHeader title="Which train will pick up the most delay?" description="Pick a train and watch the race live. The biggest delay at its final stop wins." />}
      {game && <div className="public-help"><Button type="button" variant="secondary" onClick={() => setOnboardingOpen(true)}>How it works</Button></div>}
      <PlayerOnboarding open={onboardingOpen} onClose={closeOnboarding} />
      {publicView === "browse" && <section className="public-map public-map--bet" aria-label="Train map">
        {!loading && liveJourneys.length > 0
          ? <TrainMapView journeys={liveJourneys} mapEvents={game?.mapEvents} selectedTrainId={selectedTrainId} currentParticipantId={storedUserId} onSelect={selectTrain} liveEntries={liveStateVisible ? bettedEntries : leaderboard} />
          : <div className="map-placeholder"><TrainIcon label="Train map" /><span className="map-label">Train map</span></div>}
      </section>}
      {!betSubmitted && !bettingClosed && publicView === "browse" && !loading && !error && game && journeys.length > 0 ? <>
        <Card className="bet-card-only"><BetView {...betViewProps} cardsOnly /></Card>
        <BetView {...betViewProps} actionsOnly />
      </> : <Card>
        <nav className="view-tabs" aria-label="Game views">
          {canShowRace && <BadgeButton type="button" className={`ds-text-medium ${publicView === "race" ? "active" : ""}`.trim()} onClick={() => setPublicView("race")}>Race</BadgeButton>}
          {!betSubmitted && !bettingClosed && <BadgeButton type="button" className={`ds-text-medium ${publicView === "browse" ? "active" : ""}`.trim()} onClick={() => setPublicView("browse")}>Bet</BadgeButton>}
          {hasConfirmedBet && <BadgeButton type="button" className={`ds-text-medium ${publicView === "progress" ? "active" : ""}`.trim()} onClick={() => setPublicView("progress")}>Progress</BadgeButton>}
          {hasConfirmedBet && <BadgeButton type="button" className={`ds-text-medium ${publicView === "leaderboard" ? "active" : ""}`.trim()} onClick={() => setPublicView("leaderboard")}>Bets</BadgeButton>}
          {hasConfirmedBet && <BadgeButton type="button" className={`ds-text-medium ${publicView === "events" ? "active" : ""}`.trim()} onClick={() => setPublicView("events")}>Events</BadgeButton>}
          <ReplayBadge active={publicReplayActive} replayTimestamp={publicReplayFrame?.timestamp} onReplay={startPublicReplay} onSkip={skipPublicReplay} />
          <Badge variant="secondary" className="view-tabs__end-time">Ends {formatGameEndTime(game?.gameEndTime)}</Badge>
        </nav>
        {hasConfirmedBet && publicView === "progress" && !loading && !error && <LiveLeaderboardView entries={bettedEntries} journeys={journeys} currentParticipantId={storedUserId} selectedTrainId={selectedTrainId} onSelectTrain={selectTrain} lastUpdatedAt={leaderboardUpdatedAt} stale={leaderboardStale} />}
        {canShowRace && publicView === "race" && !loading && !error && <RaceChartView entries={bettedEntries} journeys={journeys} currentParticipantId={storedUserId} final={Boolean(results?.final && results.status !== "pending")} nextUpdateAt={nextProgressUpdateAt} updating={progressUpdating} replayEntries={replayBettedEntries} replayTimestamp={publicReplayFrame?.timestamp} onSelectTrain={selectTrain} onOpenBets={() => setPublicView("leaderboard")} />}
        {hasConfirmedBet && publicView === "leaderboard" && !loading && !error && <LeaderboardView
          entries={bettedEntries}
          journeys={journeys}
          currentParticipantId={storedUserId}
          selectedTrainId={selectedTrainId}
          onSelectTrain={selectTrain}
          lastUpdatedAt={leaderboardUpdatedAt}
          stale={leaderboardStale}
          final={Boolean(results?.final && results.status !== "pending")}
          finalStatus={results?.status}
          myUsername={username}
          myBetPlace={bettedEntries.find((entry) => entry.trainId === myTrainId)?.position ?? null}
          myBetWon={Boolean(results?.winners.some((winner) => winner.trainId === myTrainId))}
        />}
        {hasConfirmedBet && publicView === "events" && !loading && !error && <LiveEventsView myTrainId={myTrainId} events={bettedLiveEvents} entries={bettedEntries} journeys={journeys} onSelectTrain={selectTrain} />}
        {loading && <p role="status">Loading journeys…</p>}
        {!loading && error && <p role="alert">{error}</p>}
        {!loading && !error && game && journeys.length === 0 && <p>No journeys are available yet.</p>}
      </Card>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
