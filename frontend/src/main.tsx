import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { api, type AdminDashboard, type Game, type Journey, type LiveEvent, type Station } from "./api/client";
import { AdminAccessView, AdminActiveView, AdminDashboardView, AdminGameListView, AdminReviewView, AdminSetupView, BadgeButton, BetView, Button, Card, BrandHeader, GameHeader, LeaderboardView, LiveEventsView, LiveLeaderboardView, Notice, RaceChartView, TimeLabelView, TrainIcon, TrainMapView, type LiveLeaderboardEntry, type PublicView } from "./design-system";
import "leaflet/dist/leaflet.css";
import "./styles.css";

type AppMode = "public" | "admin" | "not-found";
type AdminView = "access" | "create" | "review" | "active" | "dashboard";

const formatLocalDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const formatLocalTime = (value: Date) => `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
const defaultGameSchedule = () => {
  const opening = new Date();
  opening.setMinutes(0, 0, 0);
  opening.setHours(opening.getHours() + 1);
  const closing = new Date(opening.getTime() + 60 * 60 * 1000);
  const gameEnd = new Date(opening.getTime() + 270 * 60 * 1000);
  return {
    eventDate: formatLocalDate(opening),
    opening: formatLocalTime(opening),
    closing: formatLocalTime(closing),
    gameEnd: formatLocalTime(gameEnd),
  };
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
  const [gameEndTime, setGameEndTime] = useState(defaultSchedule.gameEnd);
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
  const [selectedJourneyIds, setSelectedJourneyIds] = useState<string[]>([]);
  const [minimumJourneyDuration, setMinimumJourneyDuration] = useState("0");
  const [minimumJourneyStars, setMinimumJourneyStars] = useState("0");
  const [maximumJourneyStars, setMaximumJourneyStars] = useState("20");
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
  const [betLoading, setBetLoading] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);
  const [usernameCheckLoading, setUsernameCheckLoading] = useState(false);
  const [usernameCheckError, setUsernameCheckError] = useState<string | null>(null);
  const [storedUserId, setStoredUserId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LiveLeaderboardEntry[]>([]);
  const [leaderboardUpdatedAt, setLeaderboardUpdatedAt] = useState<string | null>(null);
  const [leaderboardStale, setLeaderboardStale] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [results, setResults] = useState<{ status: string; final: boolean; winners: Array<{ username: string; delaySeconds: number; outcome?: "delay" | "cancellation"; position?: number; trainId?: string; trainName?: string; raceColor?: string | null; bettors?: string[] }>; trains: unknown[] } | null>(null);

  const bettingClosed = Boolean(game?.bettingEnd && Date.parse(game.bettingEnd) <= clockNow);

  const selectTrain = (trainId: string) => {
    setSelectedTrainId(trainId);
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
        setPublicView("progress");
      }).catch(() => {
        localStorage.removeItem("trainbet_user");
        setStoredUserId(null);
      });
    } catch {
      localStorage.removeItem("trainbet_user");
    }
  }, [mode, publicGameId]);

  useEffect(() => {
    if (mode !== "public" || (publicView !== "progress" && publicView !== "leaderboard" && publicView !== "race")) return;
    let active = true;
    const loadProgress = async () => {
      try {
        const [nextLeaderboard, nextJourneys, nextEvents] = await Promise.all([api.getLeaderboard(publicGameId ?? ""), api.getTrains(publicGameId ?? ""), api.getEvents(publicGameId ?? "")]);
        if (active) { setLeaderboard(nextLeaderboard.entries); setLeaderboardUpdatedAt(nextLeaderboard.lastUpdatedAt); setLeaderboardStale(nextLeaderboard.stale); setJourneys(nextJourneys.trains); setLiveEvents(nextEvents.events); }
      } catch { /* retain the last successful progress snapshot */ }
    };
    void loadProgress();
    const timer = window.setInterval(loadProgress, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [mode, publicView, publicGameId]);

  useEffect(() => {
    if (!adminToken) return;
    api.listAdminGames(adminToken).then((result) => setAdminGames(result.games)).catch(() => undefined);
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken || adminView !== "dashboard") return;
    let active = true;
    const refreshDashboard = async () => {
      try {
        if (!adminDashboard?.game?.id) return;
        const next = await api.getAdminDashboard(adminDashboard.game.id, adminToken);
        if (active) setAdminDashboard(next);
      } catch { /* keep the last dashboard snapshot visible */ }
    };
    const timer = window.setInterval(refreshDashboard, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [adminDashboard?.game?.id, adminToken, adminView]);

  const openAdminDashboard = async (gameToShow: Game) => {
    if (!adminToken) return;
    setAdminLoading(true);
    setAdminError(null);
    try {
      const dashboard = await api.getAdminDashboard(gameToShow.id, adminToken);
      setAdminDashboard(dashboard);
      setAdminView("dashboard");
    } catch (reason: unknown) {
      setAdminError(reason instanceof Error ? reason.message : "Could not load dashboard");
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== "public" || (!betSubmitted && !bettingClosed)) return;
    let active = true;
    const loadResults = async () => {
      try { const next = await api.getResults(publicGameId ?? ""); if (active) setResults(next); } catch { /* retain last result */ }
    };
    void loadResults();
    const timer = window.setInterval(loadResults, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [mode, betSubmitted, bettingClosed, publicGameId]);

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
      setPublicView("progress");
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
      const result = await api.createGame({ name: gameName.trim() || "ChooChoo Delay Race", eventDate, bettingStart: `${eventDate}T${bettingStart}:00+02:00`, bettingEnd: `${eventDate}T${bettingEnd}:00+02:00`, journeyDepartureStart: `${eventDate}T${journeyDepartureStart}:00+02:00`, journeyDepartureEnd: `${eventDate}T${journeyDepartureEnd}:00+02:00`, gameEndTime: `${eventDate}T${gameEndTime}:00+02:00`, stopIds }, adminToken);
      setAdminGame(result.game);
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
      setAdminDashboard(dashboard);
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
      return <main className="admin-dashboard-shell"><BrandHeader logoSrc={`${import.meta.env.BASE_URL}choochoo-logo.png`} /><AdminDashboardView key={adminDashboard.game?.id ?? "dashboard"} dashboard={adminDashboard} /></main>;
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
              <AdminGameListView games={adminGames} onDelete={deleteAdminGame} onDashboard={openAdminDashboard} />
              <AdminSetupView stationQuery={stationQuery} stationResults={stationResults} selectedStations={selectedStations} manualStationIds={manualStationIds} stationLoading={stationLoading} stationError={stationError} gameName={gameName} eventDate={eventDate} bettingStart={bettingStart} bettingEnd={bettingEnd} journeyDepartureStart={journeyDepartureStart} journeyDepartureEnd={journeyDepartureEnd} gameEndTime={gameEndTime} loading={adminLoading} error={adminError} onStationQueryChange={setStationQuery} onSearchStations={searchStations} onToggleStation={updateStationSelection} onManualStationIdsChange={updateManualStationIds} onGameNameChange={setGameName} onEventDateChange={setEventDate} onBettingStartChange={setBettingStart} onBettingEndChange={setBettingEnd} onJourneyStartChange={setJourneyDepartureStart} onJourneyEndChange={setJourneyDepartureEnd} onGameEndTimeChange={setGameEndTime} onCreateGame={createDraftGame} />
            </>
          )}
          {adminView === "review" && adminGame && <AdminReviewView game={adminGame} journeys={journeys} minimumDuration={minimumJourneyDuration} minimumStars={minimumJourneyStars} maximumStars={maximumJourneyStars} minimumDelayMinutes={minimumDelayMinutes} maximumDelayMinutes={maximumDelayMinutes} onlyJourneysWithGameName={onlyJourneysWithGameName} selectedJourneyIds={selectedJourneyIds} disruptionsJson={disruptionsJson} constructionJson={constructionJson} footballJson={footballJson} skippedDisruptions={skippedDisruptions} disruptionMessage={disruptionMessage} loading={adminLoading} whitelistSaved={whitelistSaved} error={adminError} onDisruptionsJsonChange={setDisruptionsJson} onConstructionJsonChange={setConstructionJson} onFootballJsonChange={setFootballJson} onApplyDisruptions={applyDisruptions} onFetch={fetchAdminJourneys} onMinimumDurationChange={setMinimumJourneyDuration} onMinimumStarsChange={setMinimumJourneyStars} onMaximumStarsChange={setMaximumJourneyStars} onMinimumDelayMinutesChange={setMinimumDelayMinutes} onMaximumDelayMinutesChange={setMaximumDelayMinutes} onOnlyJourneysWithGameNameChange={setOnlyJourneysWithGameName} onToggleJourney={toggleAdminJourney} onSave={saveAdminWhitelist} onActivate={activateAdminGame} />}
          {adminView === "active" && adminGame && <AdminActiveView game={adminGame} />}
        </section>
      </main>
    );
  }

  const myTrainId = leaderboard.find((entry) => entry.bettors.some((bettor) => bettor.participantId === storedUserId))?.trainId ?? null;
  const betViewProps = { journeys, selectedTrainId, username, betSubmitted, loading: betLoading, error: betError, usernameCheckLoading, usernameCheckError, onSelectTrain: selectTrain, onUsernameChange: (value: string) => { setUsername(value); setUsernameCheckError(null); }, onCheckUsername: checkUsername, onSubmit: submitBet };
  const canShowRace = betSubmitted || bettingClosed;

  return (
    <main className="app-shell public-shell">
      <BrandHeader logoSrc={`${import.meta.env.BASE_URL}choochoo-logo.png`} />
      <GameHeader title="Which train will pick up the most delay?" description="Pick a train and watch the race live. The biggest delay at its final stop wins." />
      <section aria-label="Train map">
        {!loading && journeys.length > 0
          ? <TrainMapView journeys={journeys} mapEvents={game?.mapEvents} selectedTrainId={selectedTrainId} currentParticipantId={storedUserId} onSelect={selectTrain} liveEntries={leaderboard} />
          : <div className="map-placeholder"><TrainIcon label="Train map" /><span className="map-label">Train map</span></div>}
      </section>
      {!betSubmitted && !bettingClosed && publicView === "browse" && !loading && !error && game && journeys.length > 0 ? <>
        <Card className="bet-card-only"><BetView {...betViewProps} cardsOnly /></Card>
        <BetView {...betViewProps} actionsOnly />
      </> : <Card>
        <nav className="view-tabs" aria-label="Game views">
          {!betSubmitted && !bettingClosed && <BadgeButton type="button" className={`ds-text-medium ${publicView === "browse" ? "active" : ""}`.trim()} onClick={() => setPublicView("browse")}>Bet</BadgeButton>}
          {betSubmitted && <BadgeButton type="button" className={`ds-text-medium ${publicView === "progress" ? "active" : ""}`.trim()} onClick={() => setPublicView("progress")}>Progress</BadgeButton>}
          {canShowRace && <BadgeButton type="button" className={`ds-text-medium ${publicView === "race" ? "active" : ""}`.trim()} onClick={() => setPublicView("race")}>Race</BadgeButton>}
          {betSubmitted && <BadgeButton type="button" className={`ds-text-medium ${publicView === "leaderboard" ? "active" : ""}`.trim()} onClick={() => setPublicView("leaderboard")}>Bets</BadgeButton>}
          {betSubmitted && <BadgeButton type="button" className={`ds-text-medium ${publicView === "events" ? "active" : ""}`.trim()} onClick={() => setPublicView("events")}>Events</BadgeButton>}
        </nav>
        {betSubmitted && publicView === "progress" && !loading && !error && <LiveLeaderboardView entries={leaderboard} currentParticipantId={storedUserId} selectedTrainId={selectedTrainId} onSelectTrain={selectTrain} lastUpdatedAt={leaderboardUpdatedAt} stale={leaderboardStale} />}
        {canShowRace && publicView === "race" && !loading && !error && <RaceChartView entries={leaderboard} currentParticipantId={storedUserId} final={Boolean(results?.final && results.status !== "pending")} onSelectTrain={selectTrain} />}
        {betSubmitted && publicView === "leaderboard" && !loading && !error && <LeaderboardView
          entries={leaderboard}
          currentParticipantId={storedUserId}
          selectedTrainId={selectedTrainId}
          onSelectTrain={selectTrain}
          lastUpdatedAt={leaderboardUpdatedAt}
          stale={leaderboardStale}
          final={Boolean(results?.final && results.status !== "pending")}
          finalStatus={results?.status}
          myUsername={username}
          myBetPlace={leaderboard.find((entry) => entry.trainId === myTrainId)?.position ?? null}
          myBetWon={Boolean(results?.winners.some((winner) => winner.trainId === myTrainId))}
        />}
        {betSubmitted && publicView === "events" && !loading && !error && <LiveEventsView myTrainId={myTrainId} events={liveEvents} entries={leaderboard} onSelectTrain={selectTrain} />}
        {loading && <p role="status">Loading journeys…</p>}
        {!loading && error && <p role="alert">{error}</p>}
        {!loading && !error && game && journeys.length === 0 && <p>No journeys are available yet.</p>}
      </Card>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
