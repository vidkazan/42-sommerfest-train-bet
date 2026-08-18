import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { api, type Game, type Journey, type LiveEvent, type Station } from "./api/client";
import { AdminAccessView, AdminActiveView, AdminGameListView, AdminReviewView, AdminSetupView, BadgeButton, BetView, Button, Card, BrandHeader, GameHeader, LeaderboardView, LiveEventsView, LiveLeaderboardView, Notice, RaceChartView, TimeLabelView, TrainIcon, TrainMapView, type LiveLeaderboardEntry, type PublicView } from "./design-system";
import "leaflet/dist/leaflet.css";
import "./styles.css";

type AppMode = "public" | "admin" | "not-found";
type AdminView = "access" | "create" | "review" | "active";

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
  const [eventDate, setEventDate] = useState("2026-08-09");
  const [bettingStart, setBettingStart] = useState("17:00");
  const [bettingEnd, setBettingEnd] = useState("18:00");
  const [journeyDepartureStart, setJourneyDepartureStart] = useState("17:00");
  const [journeyDepartureEnd, setJourneyDepartureEnd] = useState("17:30");
  const [stationLoading, setStationLoading] = useState(false);
  const [stationError, setStationError] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [adminGame, setAdminGame] = useState<Game | null>(null);
  const [adminGames, setAdminGames] = useState<Game[]>([]);
  const [selectedJourneyIds, setSelectedJourneyIds] = useState<string[]>([]);
  const [minimumJourneyDuration, setMinimumJourneyDuration] = useState("0");
  const [whitelistSaved, setWhitelistSaved] = useState(false);
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
  const [results, setResults] = useState<{ status: string; final: boolean; winners: Array<{ username: string; delaySeconds: number; position?: number; trainId?: string; trainName?: string; bettors?: string[] }>; trains: unknown[] } | null>(null);

  const selectTrain = (trainId: string) => {
    setSelectedTrainId(trainId);
  };


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
    if (mode !== "public" || (publicView !== "progress" && publicView !== "leaderboard")) return;
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
    if (mode !== "public" || !betSubmitted) return;
    let active = true;
    const loadResults = async () => {
      try { const next = await api.getResults(publicGameId ?? ""); if (active) setResults(next); } catch { /* retain last result */ }
    };
    void loadResults();
    const timer = window.setInterval(loadResults, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [mode, betSubmitted, publicGameId]);

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
      await api.checkAdmin(adminInput);
      setAdminToken(adminInput);
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
      setAdminGames((current) => [result.game, ...current]);
      setAdminView("review");
    } catch (reason: unknown) {
      setAdminError(reason instanceof Error ? reason.message : "Could not create game");
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
      setJourneys((current) => current.map((journey) => ({ ...journey, included: selectedJourneyIds.includes(journey.externalTripId) })));
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
      setAdminView("active");
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
              <AdminGameListView games={adminGames} onDelete={deleteAdminGame} />
              <AdminSetupView stationQuery={stationQuery} stationResults={stationResults} selectedStations={selectedStations} manualStationIds={manualStationIds} stationLoading={stationLoading} stationError={stationError} gameName={gameName} eventDate={eventDate} bettingStart={bettingStart} bettingEnd={bettingEnd} journeyDepartureStart={journeyDepartureStart} journeyDepartureEnd={journeyDepartureEnd} loading={adminLoading} error={adminError} onStationQueryChange={setStationQuery} onSearchStations={searchStations} onToggleStation={updateStationSelection} onManualStationIdsChange={updateManualStationIds} onGameNameChange={setGameName} onEventDateChange={setEventDate} onBettingStartChange={setBettingStart} onBettingEndChange={setBettingEnd} onJourneyStartChange={setJourneyDepartureStart} onJourneyEndChange={setJourneyDepartureEnd} onCreateGame={createDraftGame} />
            </>
          )}
          {adminView === "review" && adminGame && <AdminReviewView game={adminGame} journeys={journeys} minimumDuration={minimumJourneyDuration} selectedJourneyIds={selectedJourneyIds} loading={adminLoading} whitelistSaved={whitelistSaved} error={adminError} onFetch={fetchAdminJourneys} onMinimumDurationChange={setMinimumJourneyDuration} onToggleJourney={toggleAdminJourney} onSave={saveAdminWhitelist} onActivate={activateAdminGame} />}
          {adminView === "active" && adminGame && <AdminActiveView game={adminGame} />}
        </section>
      </main>
    );
  }

  const myTrainId = leaderboard.find((entry) => entry.bettors.some((bettor) => bettor.participantId === storedUserId))?.trainId ?? null;

  return (
    <main className="app-shell public-shell">
      <BrandHeader logoSrc={`${import.meta.env.BASE_URL}choochoo-logo.png`} />
      <GameHeader title="Which train will pick up the most delay?" description="Pick a train and watch the race live. The biggest delay at its final stop wins." />
      <section aria-label="Train map">
        {!loading && journeys.length > 0
          ? <TrainMapView journeys={journeys} selectedTrainId={selectedTrainId} currentParticipantId={storedUserId} onSelect={selectTrain} liveEntries={leaderboard} />
          : <div className="map-placeholder"><TrainIcon label="Train map" /><span className="map-label">Train map</span></div>}
      </section>
      <Card>
        <nav className="view-tabs" aria-label="Game views">
          {!betSubmitted && <BadgeButton type="button" className={`ds-text-medium ${publicView === "browse" ? "active" : ""}`.trim()} onClick={() => setPublicView("browse")}>Bet</BadgeButton>}
          {betSubmitted && <BadgeButton type="button" className={`ds-text-medium ${publicView === "progress" ? "active" : ""}`.trim()} onClick={() => setPublicView("progress")}>Progress</BadgeButton>}
          {betSubmitted && <BadgeButton type="button" className={`ds-text-medium ${publicView === "race" ? "active" : ""}`.trim()} onClick={() => setPublicView("race")}>Race</BadgeButton>}
          {betSubmitted && <BadgeButton type="button" className={`ds-text-medium ${publicView === "leaderboard" ? "active" : ""}`.trim()} onClick={() => setPublicView("leaderboard")}>Bets</BadgeButton>}
          {betSubmitted && <BadgeButton type="button" className={`ds-text-medium ${publicView === "events" ? "active" : ""}`.trim()} onClick={() => setPublicView("events")}>Events</BadgeButton>}
        </nav>
        {betSubmitted && publicView === "progress" && !loading && !error && <LiveLeaderboardView entries={leaderboard} currentParticipantId={storedUserId} selectedTrainId={selectedTrainId} onSelectTrain={selectTrain} lastUpdatedAt={leaderboardUpdatedAt} stale={leaderboardStale} />}
        {betSubmitted && publicView === "race" && !loading && !error && <RaceChartView entries={leaderboard} currentParticipantId={storedUserId} final={Boolean(results?.final && results.status !== "pending")} />}
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
        {betSubmitted && publicView === "events" && !loading && !error && <LiveEventsView myTrainId={myTrainId} events={liveEvents} onSelectTrain={selectTrain} />}
        {loading && <p role="status">Loading journeys…</p>}
        {!loading && error && <p role="alert">{error}</p>}
        {!loading && !error && game && journeys.length === 0 && <p>No journeys are available yet.</p>}
        {publicView === "browse" && !loading && !error && game && journeys.length > 0 && (
          <>
            <p className="ds-text-medium">Choose the train whose delay will increase the most during its journey.</p>
            <BetView journeys={journeys} selectedTrainId={selectedTrainId} username={username} betSubmitted={betSubmitted} loading={betLoading} error={betError} usernameCheckLoading={usernameCheckLoading} usernameCheckError={usernameCheckError} onSelectTrain={selectTrain} onUsernameChange={(value) => { setUsername(value); setUsernameCheckError(null); }} onCheckUsername={checkUsername} onSubmit={submitBet} />
          </>
        )}
      </Card>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
