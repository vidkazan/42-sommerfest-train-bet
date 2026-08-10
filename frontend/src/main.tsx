import { Fragment, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { api, type Game, type Journey, type Station } from "./api/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";

type AppMode = "public" | "admin" | "not-found";
type PublicView = "browse" | "progress" | "result";
type AdminView = "access" | "create" | "review" | "active";

function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const refresh = () => map.invalidateSize({ animate: false });
    const timer = window.setTimeout(refresh, 100);
    window.addEventListener("resize", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", refresh);
    };
  }, [map]);
  return null;
}

function decodePolyline(encoded: string): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];
  let index = 0; let lat = 0; let lon = 0;
  while (index < encoded.length) {
    let shift = 0; let result = 0; let byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 31) << shift; shift += 5; } while (byte >= 32);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 31) << shift; shift += 5; } while (byte >= 32);
    lon += (result & 1) ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e6, lon: lon / 1e6 });
  }
  return points;
}

type ProgressTrain = { id: string; displayName: string; scheduledArrival: string; actualArrival: string | null; delaySeconds: number | null; status: string; cancelled: boolean; stale: boolean; geometry?: string | null; routeJson?: string | null };

function TrainMap({ journeys, selectedTrainId, onSelect, progressTrains }: { journeys: Journey[]; selectedTrainId: string | null; onSelect: (id: string) => void; progressTrains: ProgressTrain[] }) {
  const routes = journeys.map((journey) => {
    const live = progressTrains.find((train) => train.id === journey.id);
    const geometry = live?.geometry ?? journey.geometry;
    const routeJson = live?.routeJson ?? journey.routeJson;
    let endpoints: Array<{ lat: number; lon: number }> = [];
    try { endpoints = JSON.parse(routeJson ?? "[]") as Array<{ lat: number; lon: number }>; } catch { /* ignore malformed endpoints */ }
    let encoded: string[] = [];
    try { encoded = JSON.parse(geometry ?? "[]") as string[]; } catch { if (geometry) encoded = [geometry]; }
    const points = encoded.flatMap(decodePolyline);
    if (points.length < 2) endpoints = endpoints.length >= 2 ? [endpoints[0], endpoints[endpoints.length - 1]] : points;
    return { journey, points, endpoints };
  }).filter((route) => route.points.length > 0);
  const allPoints = routes.flatMap((route) => route.points);
  const center: LatLngExpression = allPoints.length ? [allPoints[0].lat, allPoints[0].lon] : [51.3, 10.4];

  return (
    <MapContainer className="train-map" center={center} zoom={8} scrollWheelZoom={false}>
      <MapResizeHandler />
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {routes.map(({ journey, points, endpoints }) => {
        const positions = points.map((point) => [point.lat, point.lon] as LatLngExpression);
        const selected = journey.id === selectedTrainId;
        const live = progressTrains.find((train) => train.id === journey.id);
        const departure = Date.parse(journey.scheduledDeparture);
        const actualArrival = live?.actualArrival ?? journey.actualArrival ?? null;
        const delaySeconds = live?.delaySeconds ?? journey.delaySeconds ?? null;
        const cancelled = live?.cancelled ?? journey.liveStatus === "cancelled";
        const arrival = Date.parse(actualArrival ?? journey.scheduledArrival ?? "");
        const progress = Number.isFinite(departure) && Number.isFinite(arrival) && arrival > departure ? Math.max(0, Math.min(1, (Date.now() - departure) / (arrival - departure))) : 0;
        const markerPoint = points[Math.min(points.length - 1, Math.floor(progress * (points.length - 1)))];
        return (
          <Fragment key={journey.id}>
            <Polyline positions={positions} pathOptions={{ color: selected ? "#e11d48" : "#2563eb", weight: selected ? 6 : 3, opacity: selected ? 1 : 0.65 }} eventHandlers={{ click: () => onSelect(journey.id) }}>
              <Popup>{journey.displayName}: {journey.origin} → {journey.destination}</Popup>
            </Polyline>
            {endpoints.slice(0, 1).map((point) => <CircleMarker key={`${journey.id}-departure`} center={[point.lat, point.lon]} radius={6} pathOptions={{ color: "#16a34a", fillColor: "#fff", fillOpacity: 1 }}><Popup>Departure: {journey.origin}</Popup></CircleMarker>)}
            {endpoints.slice(-1).map((point) => <CircleMarker key={`${journey.id}-arrival`} center={[point.lat, point.lon]} radius={6} pathOptions={{ color: "#7c3aed", fillColor: "#fff", fillOpacity: 1 }}><Popup>Arrival: {journey.destination}</Popup></CircleMarker>)}
            {markerPoint && !cancelled && <CircleMarker center={[markerPoint.lat, markerPoint.lon]} radius={8} pathOptions={{ color: "#111827", fillColor: "#facc15", fillOpacity: 1 }}><Popup><strong>{journey.displayName}</strong><br />{delaySeconds === null || delaySeconds === undefined ? "Delay unavailable" : `${Math.round(delaySeconds / 60)} min delay`}</Popup></CircleMarker>}
          </Fragment>
        );
      })}
    </MapContainer>
  );
}

function App() {
  const gamePathMatch = window.location.pathname.match(/^\/game\/([^/]+)\/?$/);
  const publicGameId = gamePathMatch?.[1] ?? null;
  const mode: AppMode = window.location.pathname === "/admin" ? "admin" : publicGameId ? "public" : "not-found";
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
  const [gameName, setGameName] = useState("Sommerfest train bet");
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
  const [storedUserId, setStoredUserId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ trains: ProgressTrain[]; lastUpdatedAt: string | null; stale: boolean } | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ participantId: string; username: string; position: number | null; delaySeconds: number | null; status: string }>>([]);
  const [results, setResults] = useState<{ status: string; final: boolean; winners: Array<{ username: string; delaySeconds: number }>; trains: unknown[] } | null>(null);

  useEffect(() => {
    if (mode !== "public") return;
    Promise.all([publicGameId ? api.getGame(publicGameId) : api.getActiveGame(), api.getTrains(publicGameId ?? undefined)])
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
        const next = await api.getTrains(publicGameId ?? undefined);
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
      api.getParticipantMe(publicGameId ?? undefined).then((participant) => {
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
    if (mode !== "public" || publicView !== "progress") return;
    let active = true;
    const loadProgress = async () => {
      try {
        const [nextProgress, nextLeaderboard, nextJourneys] = await Promise.all([api.getProgress(publicGameId ?? undefined), api.getLeaderboard(publicGameId ?? undefined), api.getTrains(publicGameId ?? undefined)]);
        if (active) { setProgress(nextProgress); setLeaderboard(nextLeaderboard.entries); setJourneys(nextJourneys.trains); }
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
      try { const next = await api.getResults(publicGameId ?? undefined); if (active) setResults(next); } catch { /* retain last result */ }
    };
    void loadResults();
    const timer = window.setInterval(loadResults, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [mode, betSubmitted, publicGameId]);

  if (mode === "not-found") {
    return <main className="app-shell"><section className="card"><h1>Game not found</h1><p>Open a game using its shared game link.</p></section></main>;
  }

  if (mode === "admin") {
    return (
      <main className="app-shell">
        <section className="hero">
          <p className="eyebrow">Admin mode</p>
          <h1>Game setup</h1>
          <p>Configure the journeys available for the event.</p>
        </section>
        <section className="card">
          {adminView === "access" && (
            <form onSubmit={async (event) => {
              event.preventDefault();
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
            }}>
              <label className="field-label" htmlFor="admin-token">Admin token</label>
              <input id="admin-token" type="password" value={adminInput} onChange={(event) => setAdminInput(event.target.value)} autoComplete="off" required />
              {adminError && <p className="error" role="alert">{adminError}</p>}
              <button type="submit" disabled={adminLoading}>{adminLoading ? "Checking…" : "Continue"}</button>
            </form>
          )}
          {adminView === "create" && (
            <>
              <h2>Games</h2>
              {adminGames.length === 0 ? <p>No games created yet.</p> : <div className="journey-list">
                {adminGames.map((item) => <article className="journey-card" key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{item.eventDate} · {item.status}</span>
                  <span>{item.bettingStart ? `${new Date(item.bettingStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${item.bettingEnd ? new Date(item.bettingEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}` : ""}</span>
                  <a href={`/game/${item.id}`} target="_blank" rel="noreferrer">Open public game</a>
                  <button type="button" className="secondary" onClick={async () => {
                    if (!adminToken || !window.confirm(`Permanently delete ${item.name}? All bets and journeys will be deleted.`)) return;
                    try {
                      await api.removeGame(item.id, adminToken);
                      setAdminGames((current) => current.filter((gameItem) => gameItem.id !== item.id));
                      if (adminGame?.id === item.id) { setAdminGame(null); setJourneys([]); setAdminView("create"); }
                    } catch (reason: unknown) {
                      setAdminError(reason instanceof Error ? reason.message : "Could not delete game");
                    }
                  }}>Delete game</button>
                </article>)}
              </div>}
              <hr />
              <h2>Select origin stations</h2>
              <form onSubmit={async (event) => {
                event.preventDefault();
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
              }}>
                <label className="field-label" htmlFor="station-search">Search station</label>
                <div className="inline-form">
                  <input id="station-search" value={stationQuery} onChange={(event) => setStationQuery(event.target.value)} placeholder="Hamm" />
                  <button type="submit" disabled={stationLoading}>{stationLoading ? "Searching…" : "Search"}</button>
                </div>
              </form>
              {stationError && <p className="error" role="alert">{stationError}</p>}
              {stationResults.length > 0 && (
                <div className="station-list">
                  {stationResults.map((station) => {
                    const selected = selectedStations.some((item) => item.stopId === station.stopId);
                    return (
                      <button
                        type="button"
                        className={`station-option ${selected ? "selected" : ""}`}
                        key={station.stopId}
                        onClick={() => updateStationSelection(station, selected)}
                      >
                        <strong>{station.name}</strong>
                        <span>{selected ? "Selected" : station.stopId}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <h3>Selected stations ({selectedStations.length})</h3>
              {selectedStations.length === 0 && <p>No stations selected.</p>}
              <div className="selected-stations">
                {selectedStations.map((station) => (
                  <span className="station-chip" key={station.stopId}>
                    {station.name}
                    <button type="button" aria-label={`Remove ${station.name}`} onClick={() => updateStationSelection(station, true)}>×</button>
                  </span>
                ))}
              </div>
              <label className="field-label" htmlFor="manual-station-ids">Additional station IDs</label>
              <textarea id="manual-station-ids" value={manualStationIds} onChange={(event) => {
                const value = event.target.value;
                const ids = new Set(value.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean));
                setManualStationIds(value);
                setSelectedStations((current) => current.filter((station) => ids.has(station.stopId)));
              }} placeholder="One MOTIS stop ID per line" rows={3} />
              <p className="field-help">Paste IDs separated by spaces, commas, or new lines.</p>
              <form onSubmit={async (event) => {
                event.preventDefault();
                const stopIds = [...new Set(manualStationIds.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean))];
                if (!adminToken || stopIds.length === 0) return;
                setAdminLoading(true);
                setAdminError(null);
                try {
                  const result = await api.createGame({
                  name: gameName.trim() || "Sommerfest train bet",
                    eventDate,
                    bettingStart: `${eventDate}T${bettingStart}:00+02:00`,
                    bettingEnd: `${eventDate}T${bettingEnd}:00+02:00`,
                    journeyDepartureStart: `${eventDate}T${journeyDepartureStart}:00+02:00`,
                    journeyDepartureEnd: `${eventDate}T${journeyDepartureEnd}:00+02:00`,
                    stopIds,
                  }, adminToken);
                  setAdminGame(result.game);
                  setAdminGames((current) => [result.game, ...current]);
                  setAdminView("review");
                } catch (reason: unknown) {
                  setAdminError(reason instanceof Error ? reason.message : "Could not create game");
                } finally {
                  setAdminLoading(false);
                }
              }}>
                <h3>Game details</h3>
                <label className="field-label" htmlFor="game-name">Name</label>
                <input id="game-name" value={gameName} onChange={(event) => setGameName(event.target.value)} />
                <label className="field-label" htmlFor="event-date">Event date</label>
                <input id="event-date" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required />
                <label className="field-label" htmlFor="betting-start">Betting opens</label>
                <input id="betting-start" type="time" value={bettingStart} onChange={(event) => setBettingStart(event.target.value)} required />
                <label className="field-label" htmlFor="betting-end">Betting closes</label>
                <input id="betting-end" type="time" value={bettingEnd} onChange={(event) => setBettingEnd(event.target.value)} required />
                <label className="field-label" htmlFor="journey-start">Journey departures from</label>
                <input id="journey-start" type="time" value={journeyDepartureStart} onChange={(event) => setJourneyDepartureStart(event.target.value)} required />
                <label className="field-label" htmlFor="journey-end">Journey departures until</label>
                <input id="journey-end" type="time" value={journeyDepartureEnd} onChange={(event) => setJourneyDepartureEnd(event.target.value)} required />
                {adminError && <p className="error" role="alert">{adminError}</p>}
                <button type="submit" disabled={adminLoading || (selectedStations.length === 0 && !manualStationIds.trim())}>
                  {adminLoading ? "Creating…" : "Create draft game"}
                </button>
              </form>
            </>
          )}
          {adminView === "review" && adminGame && (
            <>
              <h2>{adminGame.name}</h2>
              <p>Draft created. Next, fetch candidate journeys for the selected stations.</p>
              <button type="button" onClick={async () => {
                if (!adminToken) return;
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
              }} disabled={adminLoading}>{adminLoading ? "Fetching…" : "Fetch journeys"}</button>
              {journeys.length > 0 && (
                <>
                  <p>{journeys.length} candidate journeys received.</p>
                  <label className="field-label" htmlFor="minimum-duration">Minimum journey duration</label>
                  <select id="minimum-duration" value={minimumJourneyDuration} onChange={(event) => setMinimumJourneyDuration(event.target.value)}>
                    <option value="0">Any duration</option>
                    <option value="1">At least 1 hour</option>
                    <option value="2">At least 2 hours</option>
                    <option value="3">At least 3 hours</option>
                    <option value="4">At least 4 hours</option>
                  </select>
                  <div className="journey-list" aria-label="Candidate journeys">
                    {journeys.filter((journey) => journey.durationSeconds >= Number(minimumJourneyDuration) * 3600).map((journey) => {
                      const departure = new Date(journey.scheduledDeparture);
                      const arrival = journey.scheduledArrival ? new Date(journey.scheduledArrival) : null;
                      const hours = Math.floor(journey.durationSeconds / 3600);
                      const minutes = Math.round((journey.durationSeconds % 3600) / 60);
                      return (
                        <label className="journey-card" key={journey.externalTripId}>
                          <input
                            type="checkbox"
                            checked={selectedJourneyIds.includes(journey.externalTripId)}
                            onChange={() => setSelectedJourneyIds((current) => current.includes(journey.externalTripId)
                              ? current.filter((id) => id !== journey.externalTripId)
                              : [...current, journey.externalTripId])}
                          />
                          <strong>{journey.displayName}</strong>
                          <span>{journey.origin} → {journey.destination}</span>
                          <span>{departure.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {arrival && ` – ${arrival.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                            {` · ${hours}h ${minutes}m`}</span>
                          {journey.status === "excluded" && <span className="error">Excluded: {journey.exclusionReason ?? "rule mismatch"}</span>}
                        </label>
                      );
                    })}
                  </div>
                  <button type="button" disabled={adminLoading || selectedJourneyIds.length === 0} onClick={async () => {
                    if (!adminToken || !adminGame) return;
                    setAdminLoading(true);
                    setAdminError(null);
                    try {
                      await api.selectJourneys(adminGame.id, selectedJourneyIds, adminToken);
                      setWhitelistSaved(true);
                      setJourneys((current) => current.map((journey) => ({
                        ...journey,
                        included: selectedJourneyIds.includes(journey.externalTripId),
                      })));
                    } catch (reason: unknown) {
                      setAdminError(reason instanceof Error ? reason.message : "Could not save selected journeys");
                    } finally {
                      setAdminLoading(false);
                    }
                  }}>{adminLoading ? "Saving…" : `Save whitelist (${selectedJourneyIds.length})`}</button>
                  <button type="button" className="secondary" disabled={adminLoading || !whitelistSaved} onClick={async () => {
                    if (!adminToken || !adminGame) return;
                    if (!window.confirm("Activate this game? The journey whitelist cannot be changed afterwards.")) return;
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
                  }}>Activate game</button>
                </>
              )}
              {adminError && <p className="error" role="alert">{adminError}</p>}
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">42 Wolfsburg Sommerfest</p>
        <h1>Train Bet</h1>
        <p>Choose the regional train that will gain the most delay during its journey.</p>
      </section>
      <section aria-label="Train map">
        {!loading && journeys.length > 0
          ? <TrainMap journeys={journeys} selectedTrainId={selectedTrainId} onSelect={setSelectedTrainId} progressTrains={progress?.trains ?? []} />
          : <div className="map-placeholder"><span className="train-marker">🚂</span><span className="map-label">Train map</span></div>}
      </section>
      <section className="card">
        <nav className="view-tabs" aria-label="Game views">
          {!betSubmitted && <button type="button" className={publicView === "browse" ? "active" : "secondary"} onClick={() => setPublicView("browse")}>Browse</button>}
          <button type="button" className={publicView === "progress" ? "active" : "secondary"} onClick={() => setPublicView("progress")}>Progress</button>
          {results?.final && results.status !== "pending" && <button type="button" className={publicView === "result" ? "active" : "secondary"} onClick={() => setPublicView("result")}>Results</button>}
        </nav>
        {publicView === "progress" && !loading && !error && (
          <section aria-label="Live progress">
            <h2>Live progress</h2>
            <p className="notice">{progress?.stale ? "Live data is temporarily stale." : "Updates every minute."}</p>
            {progress?.lastUpdatedAt && <p>Last update: {new Date(progress.lastUpdatedAt).toLocaleTimeString()}</p>}
            <h3>Trains</h3>
            {!progress || progress.trains.length === 0 ? <p>No live train data yet.</p> : <div className="journey-list">{progress.trains.map((train) => <article className="journey-card" key={train.id}>
              <strong>{train.displayName}</strong>
              <span>{train.cancelled ? "Cancelled — not ranked" : train.status === "waiting_for_departure" ? "Waiting for departure" : train.status === "arrived" && train.actualArrival ? `Arrived ${new Date(train.actualArrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "In transit"}</span>
              <span>{train.delaySeconds === null ? "Delay unavailable" : train.delaySeconds === 0 ? "On time" : `${train.delaySeconds > 0 ? "+" : "−"}${Math.round(Math.abs(train.delaySeconds) / 60)} min ${train.delaySeconds > 0 ? "delay" : "early"}`}{train.status === "in_progress" ? " · realtime estimate" : ""}{train.stale ? " · stale" : ""}</span>
            </article>)}</div>}
            <h3>Leaderboard</h3>
            {leaderboard.length === 0 ? <p>No bets yet.</p> : <ol>{leaderboard.map((entry) => <li key={entry.participantId} className={entry.participantId === storedUserId ? "current-user" : undefined}><strong>{entry.position ? `#${entry.position} ` : "⏳ "}{entry.username}</strong> · {entry.status === "waiting" || entry.status === "waiting_for_departure" ? (entry.status === "waiting_for_departure" ? "waiting for departure" : "waiting for arrival") : entry.status === "cancelled" ? "cancelled" : `${Math.round((entry.delaySeconds ?? 0) / 60)} min delay`}</li>)}</ol>}
          </section>
        )}
        {publicView === "result" && !loading && !error && (
          <section aria-label="Final results">
            <h2>Results</h2>
            {!results || results.status === "pending" ? <p className="notice">Waiting for all trains to reach their final station.</p>
              : results.status === "no_winner" ? <p className="notice">No winner — every selected train was cancelled.</p>
                : <div className="winner-result"><div className="confetti" aria-hidden="true">🎉 🎊 ✨ 🚂 ✨ 🎊 🎉</div><p className="notice">Winner{results.winners.length > 1 ? "s" : ""}</p><ol>{results.winners.map((winner) => <li key={winner.username}>{winner.username} · {Math.round(winner.delaySeconds / 60)} min delay</li>)}</ol></div>}
          </section>
        )}
        {loading && <p role="status">Loading journeys…</p>}
        {!loading && error && <p role="alert">{error}</p>}
        {!loading && !error && game && journeys.length === 0 && <p>No journeys are available yet.</p>}
        {publicView === "browse" && !loading && !error && game && journeys.length > 0 && (
          <>
            <h2>{game.name}</h2>
            <p>Choose your train.</p>
            {betSubmitted && <p className="notice">Your bet is confirmed. Follow the live progress below.</p>}
            {!betSubmitted && <form onSubmit={async (event) => {
              event.preventDefault();
              if (!selectedTrainId || !username.trim()) return;
              setBetLoading(true);
              setBetError(null);
              try {
                const participant = await api.createParticipant(username, publicGameId ?? undefined);
                await api.submitBet(selectedTrainId, publicGameId ?? undefined);
                localStorage.setItem("trainbet_user", JSON.stringify({ gameId: publicGameId, userId: participant.participantId, nickname: participant.username }));
                setStoredUserId(participant.participantId);
                setBetSubmitted(true);
                setPublicView("progress");
              } catch (reason: unknown) {
                setBetError(reason instanceof Error ? reason.message : "Could not submit bet");
              } finally {
                setBetLoading(false);
              }
            }}>
              <label className="field-label" htmlFor="username">Username</label>
              <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={2} maxLength={24} placeholder="Your name" required />
              <p>{selectedTrainId ? `Selected: ${journeys.find((journey) => journey.id === selectedTrainId)?.displayName ?? "train"}` : "Select one train below."}</p>
              {betError && <p className="error" role="alert">{betError}</p>}
              <button type="submit" disabled={betLoading || !selectedTrainId}>{betLoading ? "Submitting…" : "Confirm my bet"}</button>
            </form>}
            <div className="journey-list">
              {journeys.map((journey) => (
                <article className={`journey-card ${selectedTrainId === journey.id ? "selected" : ""}`} key={journey.id}>
                  <strong>{journey.displayName}</strong>
                  <span>{journey.origin} → {journey.destination}</span>
                  <span>
                    {new Date(journey.scheduledDeparture).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {journey.scheduledArrival && ` – ${new Date(journey.scheduledArrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                    {` · ${Math.floor(journey.durationSeconds / 3600)}h ${Math.round((journey.durationSeconds % 3600) / 60)}m`}
                  </span>
                  {!betSubmitted && <button type="button" className="secondary" onClick={() => setSelectedTrainId(journey.id)}>{selectedTrainId === journey.id ? "Selected" : "Choose train"}</button>}
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
