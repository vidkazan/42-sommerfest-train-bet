import { Fragment, useEffect, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { DivIcon, LatLngBounds, type LatLngExpression } from "leaflet";
import type { Game, Journey, LiveEvent, Station } from "../api/client";
import { colors } from "./tokens";
import { Badge, BadgeButton, Button, Notice, StatusBadge, TrainIcon } from "./components";
import { TimeLabelView } from "./TimeLabelView";
import { JourneyCard } from "./JourneyCard";

export type PublicView = "browse" | "progress" | "leaderboard" | "result";
export type ViewStatus = "waiting" | "waiting_for_departure" | "in_progress" | "arrived" | "cancelled" | "stale";
export type LiveLeaderboardEntry = {
  trainId: string; displayName: string; origin: string; destination: string; position: number | null;
  scheduledDeparture: string; scheduledArrival: string; durationSeconds: number; actualArrival: string | null; raceDelayMinutes: number | null; finalDelayMinutes: number | null; status: string;
  stopCount: number | null; currentDelayMinutes: number | null; departureDelayMinutes: number | null;
  cancelled: boolean; stale: boolean; bettors: Array<{ participantId: string; username: string }>; geometry?: string | null; routeJson?: string | null;
};
export type GameHeaderViewProps = { eyebrow?: string; title: string; description: string };
export type TrainMapViewProps = { journeys: Journey[]; selectedTrainId: string | null; liveEntries: LiveLeaderboardEntry[]; currentParticipantId?: string | null; onSelect: (trainId: string) => void };
export type BetViewProps = { journeys: Journey[]; selectedTrainId: string | null; username: string; betSubmitted: boolean; loading: boolean; error: string | null; usernameCheckLoading: boolean; usernameCheckError: string | null; onSelectTrain: (trainId: string) => void; onUsernameChange: (username: string) => void; onCheckUsername: () => Promise<boolean>; onSubmit: () => void };
export type LiveLeaderboardViewProps = { entries: LiveLeaderboardEntry[]; currentParticipantId: string | null; selectedTrainId: string | null; onSelectTrain: (trainId: string) => void; lastUpdatedAt: string | null; stale: boolean; events: LiveEvent[] };
export type LeaderboardViewProps = { entries: LiveLeaderboardEntry[]; currentParticipantId: string | null; selectedTrainId: string | null; onSelectTrain: (trainId: string) => void; lastUpdatedAt: string | null; stale: boolean };
export type ResultsViewProps = { status: string; final: boolean; winners: Array<{ username: string; delaySeconds: number }> };
export type AdminAccessViewProps = { value: string; loading: boolean; error: string | null; onChange: (value: string) => void; onSubmit: () => void };
export type AdminGameListViewProps = { games: Game[]; onDelete: (game: Game) => void };
export type AdminSetupViewProps = {
  stationQuery: string; stationResults: Station[]; selectedStations: Station[]; manualStationIds: string; stationLoading: boolean; stationError: string | null;
  gameName: string; eventDate: string; bettingStart: string; bettingEnd: string; journeyDepartureStart: string; journeyDepartureEnd: string;
  loading: boolean; error: string | null;
  onStationQueryChange: (value: string) => void; onSearchStations: () => void; onToggleStation: (station: Station, selected: boolean) => void;
  onManualStationIdsChange: (value: string) => void; onGameNameChange: (value: string) => void; onEventDateChange: (value: string) => void;
  onBettingStartChange: (value: string) => void; onBettingEndChange: (value: string) => void; onJourneyStartChange: (value: string) => void; onJourneyEndChange: (value: string) => void; onCreateGame: () => void;
};
export type AdminReviewViewProps = { game: Game; journeys: Journey[]; minimumDuration: string; selectedJourneyIds: string[]; loading: boolean; whitelistSaved: boolean; error: string | null; onFetch: () => void; onMinimumDurationChange: (value: string) => void; onToggleJourney: (tripId: string) => void; onSave: () => void; onActivate: () => void };
export type AdminActiveViewProps = { game: Game };

type RaceState = "OUT OF THE RACE";

function getRaceState(entry: LiveLeaderboardEntry): RaceState | null {
  if (entry.cancelled) return "OUT OF THE RACE";
  if (entry.stale || entry.raceDelayMinutes === null || entry.raceDelayMinutes === undefined) return null;
  return null;
}

function raceStateVariant(state: RaceState) {
  if (state === "OUT OF THE RACE") return "red" as const;
  return "secondary" as const;
}

export function GameHeader({ eyebrow, title, description }: GameHeaderViewProps) {
  return <section className="hero">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></section>;
}

export function BetView({ journeys, selectedTrainId, username, betSubmitted, loading, error, usernameCheckLoading, usernameCheckError, onSelectTrain, onUsernameChange, onCheckUsername, onSubmit }: BetViewProps) {
  const [nameConfirmed, setNameConfirmed] = useState(false);

  useEffect(() => {
    if (!selectedTrainId) return;
    document.querySelector(`[data-journey-id="${selectedTrainId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedTrainId]);

  useEffect(() => {
    setNameConfirmed(false);
  }, [selectedTrainId]);

  return <>
    {betSubmitted && <p className="notice">Your bet is confirmed. Follow the live progress below.</p>}
    {!betSubmitted && <div className="bet-selection">
      <div className="bet-selection__header">
        <span className="bet-selection__username ds-text-medium">{selectedTrainId ? `You’re betting on ${journeys.find((journey) => journey.id === selectedTrainId)?.displayName ?? "this train"}` : "Pick a train to get started"}</span>
      </div>
      <div className="journey-list bet-selection__list">
        {journeys.map((journey) => <JourneyCard key={journey.id} journey={journey} mode="public" selected={selectedTrainId === journey.id} disabled={betSubmitted} onSelect={(selectedJourney) => onSelectTrain(selectedJourney.id)} />)}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {selectedTrainId && !nameConfirmed && <form className="bet-form" onSubmit={async (event) => { event.preventDefault(); if (await onCheckUsername()) setNameConfirmed(true); }}>
        <p className="ds-text-medium">What’s your name?</p>
        <label className="field-label" htmlFor="username">Username</label>
        <input id="username" value={username} onChange={(event) => onUsernameChange(event.target.value)} minLength={2} maxLength={24} placeholder="Your name" required autoComplete="nickname" />
        {usernameCheckError && <p className="error" role="alert">{usernameCheckError}</p>}
        <BadgeButton type="submit" className="ds-text-huge" disabled={usernameCheckLoading}>{usernameCheckLoading ? "Checking…" : "Continue"}</BadgeButton>
      </form>}
      {selectedTrainId && nameConfirmed && <>
        <p className="bet-selection__username ds-text-medium">Ready to confirm as {username}.</p>
        <Notice className="bet-rules">Your train must accumulate the most delay by its final stop. Cancelled trains are out of the race. Ties share the win.</Notice>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
          <BadgeButton type="submit" className="bet-confirm-button ds-text-huge" disabled={loading}>{loading ? "Submitting…" : `Bet on ${journeys.find((journey) => journey.id === selectedTrainId)?.displayName ?? "train"}`}</BadgeButton>
        </form>
      </>}
    </div>}
  </>;
}

function prioritizeCurrentBet(entries: LiveLeaderboardEntry[], currentParticipantId: string | null) {
  if (!currentParticipantId) return entries;
  return [...entries].sort((left, right) => {
    const leftIsMine = left.bettors.some((bettor) => bettor.participantId === currentParticipantId);
    const rightIsMine = right.bettors.some((bettor) => bettor.participantId === currentParticipantId);
    return Number(rightIsMine) - Number(leftIsMine);
  });
}

function getUpdatedMinutesAgo(lastUpdatedAt: string | null) {
  return lastUpdatedAt ? Math.max(0, Math.floor((Date.now() - new Date(lastUpdatedAt).getTime()) / 60_000)) : null;
}

function eventVariant(event: LiveEvent) {
  return event.severity === "severe" ? "red" as const : event.severity === "warning" ? "orange" as const : "secondary" as const;
}

function eventAge(createdAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
  return minutes === 0 ? "just now" : `${minutes} min ago`;
}

export function LiveLeaderboardView({ entries, currentParticipantId, selectedTrainId, onSelectTrain, lastUpdatedAt, stale, events }: LiveLeaderboardViewProps) {
  const prioritizedEntries = prioritizeCurrentBet(entries, currentParticipantId);
  const myTrainId = entries.find((entry) => entry.bettors.some((bettor) => bettor.participantId === currentParticipantId))?.trainId;
  const updatedMinutesAgo = getUpdatedMinutesAgo(lastUpdatedAt);
  return <section className="progress-view" aria-label="Live progress">
    <div className="progress-meta ds-text-medium"><Notice>{stale ? "Live data is temporarily stale." : "Updates every minute."}</Notice>{updatedMinutesAgo !== null && <span>Last update — {updatedMinutesAgo === 0 ? "just now" : `${updatedMinutesAgo} min ago`}</span>}</div>
    {!prioritizedEntries.length ? <p>No bets yet.</p> : <div className="journey-list" aria-label="Live leaderboard">{prioritizedEntries.map((entry) => {
      const journey: Journey = { id: entry.trainId, externalTripId: entry.trainId, displayName: entry.displayName, origin: entry.origin, destination: entry.destination, scheduledDeparture: entry.scheduledDeparture, scheduledArrival: entry.scheduledArrival, durationSeconds: entry.durationSeconds, stopCount: entry.stopCount, actualArrival: entry.actualArrival, raceDelayMinutes: entry.raceDelayMinutes, finalDelayMinutes: entry.finalDelayMinutes, departureDelayMinutes: entry.departureDelayMinutes, status: entry.cancelled ? "cancelled" : undefined, liveStatus: entry.status };
      return <JourneyCard key={entry.trainId} journey={journey} mode="leaderboard" position={entry.position} raceStatus={getRaceState(entry) ?? undefined} bettors={entry.bettors} currentParticipantId={currentParticipantId} selected={entry.trainId === selectedTrainId} onSelect={() => onSelectTrain(entry.trainId)} />;
    })}</div>}
    <section className="live-events" aria-label="Live events">
      <div className="live-events__heading"><h2>Live events</h2><span className="live-events__status">Always watching</span></div>
      {!events.length ? <p className="live-events__empty">No drama yet. The trains are behaving.</p> : <div className="live-events__list">{events.map((event) => {
        const selectable = Boolean(event.trainId);
        const selectEventTrain = () => { if (event.trainId) onSelectTrain(event.trainId); };
        return <article className={`live-event ${selectable ? "selectable" : ""}`.trim()} key={event.id} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} onClick={selectable ? selectEventTrain : undefined} onKeyDown={selectable ? (keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") { keyboardEvent.preventDefault(); selectEventTrain(); } } : undefined}>
        <div className="live-event__badges">{event.source === "motis" && <Badge variant={eventVariant(event)}>MOTIS</Badge>}{event.trainId === myTrainId && <Badge variant="blue">My train</Badge>}</div>
        <div><strong>{event.title}</strong><p>{event.message}</p></div>
        <time dateTime={event.createdAt}>{eventAge(event.createdAt)}</time>
      </article>})}</div>}
    </section>
  </section>;
}

export function LeaderboardView({ entries, currentParticipantId, selectedTrainId, onSelectTrain, lastUpdatedAt, stale }: LeaderboardViewProps) {
  const prioritizedEntries = prioritizeCurrentBet(entries, currentParticipantId);
  const updatedMinutesAgo = getUpdatedMinutesAgo(lastUpdatedAt);
  return <section className="leaderboard-view" aria-label="Leaderboard">
    <h2>Who’s betting on each train?</h2>
    <div className="progress-meta ds-text-medium"><Notice>{stale ? "Live data is temporarily stale." : "Updates every minute."}</Notice>{updatedMinutesAgo !== null && <span>Last update — {updatedMinutesAgo === 0 ? "just now" : `${updatedMinutesAgo} min ago`}</span>}</div>
    {!prioritizedEntries.length ? <p>No bets yet.</p> : <div className="leaderboard-list">{prioritizedEntries.map((entry) => {
      const rankVariant = entry.position === 1 ? "red" : entry.position === 2 ? "orange" : entry.position === 3 ? "yellow" : "secondary";
      const delay = entry.raceDelayMinutes !== null && entry.raceDelayMinutes !== undefined ? `${entry.raceDelayMinutes >= 0 ? "+" : "−"}${Math.abs(entry.raceDelayMinutes)} min` : null;
      const raceState = getRaceState(entry);
      const selected = entry.trainId === selectedTrainId;
      return <article className={`leaderboard-row ${selected ? "selected" : ""}`} key={entry.trainId} role="button" tabIndex={0} onClick={() => onSelectTrain(entry.trainId)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectTrain(entry.trainId); } }}>
        <div className="leaderboard-row__top">
          <Badge variant={rankVariant}>{entry.position ? `${entry.position}${entry.position % 100 >= 11 && entry.position % 100 <= 13 ? "th" : entry.position % 10 === 1 ? "st" : entry.position % 10 === 2 ? "nd" : entry.position % 10 === 3 ? "rd" : "th"} place` : "Waiting"}</Badge>
          {raceState && <Badge variant={raceStateVariant(raceState)}>{raceState}</Badge>}
          <strong>{entry.displayName}</strong>
          {delay && <Badge variant="secondary">{delay}</Badge>}
        </div>
        <span className="leaderboard-row__route">{entry.origin} → {entry.destination}</span>
        {entry.bettors.length > 0
          ? <div className="leaderboard-row__bettors">{entry.bettors.map((bettor) => bettor.participantId === currentParticipantId
            ? <Badge key={bettor.participantId} variant="blue" className="ds-text-medium">YOU · {bettor.username}</Badge>
            : <Badge key={bettor.participantId} variant="secondary" className="ds-text-medium">{bettor.username}</Badge>)}</div>
          : <span className="leaderboard-row__empty">No bettors yet</span>}
      </article>;
    })}</div>}
  </section>;
}

export function ResultsView({ status, final, winners }: ResultsViewProps) {
  return <section aria-label="Final results">
    <h2>Results</h2>
    {!final || status === "pending" ? <Notice>Waiting for all trains to reach their final station.</Notice>
      : status === "no_winner" ? <Notice>No winner — every selected train was cancelled.</Notice>
        : <div className="winner-result"><div className="confetti" aria-hidden="true">🎉 🎊 ✨ <TrainIcon decorative /> ✨ 🎊 🎉</div><Notice>Winner{winners.length > 1 ? "s" : ""}</Notice><ol>{winners.map((winner) => <li key={winner.username}>{winner.username} · {Math.round(winner.delaySeconds / 60)} min delay</li>)}</ol></div>}
  </section>;
}

export function AdminAccessView({ value, loading, error, onChange, onSubmit }: AdminAccessViewProps) {
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <label className="field-label" htmlFor="admin-token">Admin token</label>
    <input id="admin-token" type="password" value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" required />
    {error && <p className="error" role="alert">{error}</p>}
    <Button type="submit" disabled={loading}>{loading ? "Checking…" : "Continue"}</Button>
  </form>;
}

export function AdminGameListView({ games, onDelete }: AdminGameListViewProps) {
  return <>
    <h2>Games</h2>
    {games.length === 0 ? <p>No games created yet.</p> : <div className="journey-list">
      {games.map((game) => <article className="journey-card" key={game.id}>
        <strong>{game.name}</strong>
        <span>{game.eventDate} · {game.status}</span>
        <span>{game.bettingStart ? `${new Date(game.bettingStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${game.bettingEnd ? new Date(game.bettingEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}` : ""}</span>
        <a href={`/game/${game.id}`} target="_blank" rel="noreferrer">Open public game</a>
        <Button type="button" variant="secondary" onClick={() => onDelete(game)}>Delete game</Button>
      </article>)}
    </div>}
  </>;
}

export function AdminSetupView({ stationQuery, stationResults, selectedStations, manualStationIds, stationLoading, stationError, gameName, eventDate, bettingStart, bettingEnd, journeyDepartureStart, journeyDepartureEnd, loading, error, onStationQueryChange, onSearchStations, onToggleStation, onManualStationIdsChange, onGameNameChange, onEventDateChange, onBettingStartChange, onBettingEndChange, onJourneyStartChange, onJourneyEndChange, onCreateGame }: AdminSetupViewProps) {
  const manualIdsChanged = (value: string) => onManualStationIdsChange(value);
  return <>
    <hr />
    <h2>Select origin stations</h2>
    <form onSubmit={(event) => { event.preventDefault(); onSearchStations(); }}>
      <label className="field-label" htmlFor="station-search">Search station</label>
      <div className="inline-form"><input id="station-search" value={stationQuery} onChange={(event) => onStationQueryChange(event.target.value)} placeholder="Hamm" /><Button type="submit" disabled={stationLoading}>{stationLoading ? "Searching…" : "Search"}</Button></div>
    </form>
    {stationError && <p className="error" role="alert">{stationError}</p>}
    {stationResults.length > 0 && <div className="station-list">{stationResults.map((station) => {
      const selected = selectedStations.some((item) => item.stopId === station.stopId);
      return <button type="button" className={`station-option ${selected ? "selected" : ""}`} key={station.stopId} onClick={() => onToggleStation(station, selected)}><strong>{station.name}</strong><span>{selected ? "Selected" : station.stopId}</span></button>;
    })}</div>}
    <h3>Selected stations ({selectedStations.length})</h3>
    {selectedStations.length === 0 && <p>No stations selected.</p>}
    <div className="selected-stations">{selectedStations.map((station) => <span className="station-chip" key={station.stopId}>{station.name}<button type="button" aria-label={`Remove ${station.name}`} onClick={() => onToggleStation(station, true)}>×</button></span>)}</div>
    <label className="field-label" htmlFor="manual-station-ids">Additional station IDs</label>
    <textarea id="manual-station-ids" value={manualStationIds} onChange={(event) => manualIdsChanged(event.target.value)} placeholder="One MOTIS stop ID per line" rows={3} />
    <p className="field-help">Paste IDs separated by spaces, commas, or new lines.</p>
    <form onSubmit={(event) => { event.preventDefault(); onCreateGame(); }}>
      <h3>Game details</h3>
      <label className="field-label" htmlFor="game-name">Name</label><input id="game-name" value={gameName} onChange={(event) => onGameNameChange(event.target.value)} />
      <label className="field-label" htmlFor="event-date">Event date</label><input id="event-date" type="date" value={eventDate} onChange={(event) => onEventDateChange(event.target.value)} required />
      <label className="field-label" htmlFor="betting-start">Betting opens</label><input id="betting-start" type="time" value={bettingStart} onChange={(event) => onBettingStartChange(event.target.value)} required />
      <label className="field-label" htmlFor="betting-end">Betting closes</label><input id="betting-end" type="time" value={bettingEnd} onChange={(event) => onBettingEndChange(event.target.value)} required />
      <label className="field-label" htmlFor="journey-start">Journey departures from</label><input id="journey-start" type="time" value={journeyDepartureStart} onChange={(event) => onJourneyStartChange(event.target.value)} required />
      <label className="field-label" htmlFor="journey-end">Journey departures until</label><input id="journey-end" type="time" value={journeyDepartureEnd} onChange={(event) => onJourneyEndChange(event.target.value)} required />
      {error && <p className="error" role="alert">{error}</p>}
      <Button type="submit" disabled={loading || (selectedStations.length === 0 && !manualStationIds.trim())}>{loading ? "Creating…" : "Create draft game"}</Button>
    </form>
  </>;
}

export function AdminReviewView({ game, journeys, minimumDuration, selectedJourneyIds, loading, whitelistSaved, error, onFetch, onMinimumDurationChange, onToggleJourney, onSave, onActivate }: AdminReviewViewProps) {
  return <>
    <h2>{game.name}</h2>
    <p>Draft created. Next, fetch candidate journeys for the selected stations.</p>
    <Button type="button" onClick={onFetch} disabled={loading}>{loading ? "Fetching…" : "Fetch journeys"}</Button>
    {journeys.length > 0 && <>
      <p>{journeys.length} candidate journeys received.</p>
      <label className="field-label" htmlFor="minimum-duration">Minimum journey duration</label>
      <select id="minimum-duration" value={minimumDuration} onChange={(event) => onMinimumDurationChange(event.target.value)}>
        <option value="0">Any duration</option><option value="1">At least 1 hour</option><option value="2">At least 2 hours</option><option value="3">At least 3 hours</option><option value="4">At least 4 hours</option>
      </select>
      <div className="journey-list" aria-label="Candidate journeys">{journeys.filter((journey) => journey.durationSeconds >= Number(minimumDuration) * 3600).map((journey) => <JourneyCard key={journey.externalTripId} journey={journey} mode="admin" selected={selectedJourneyIds.includes(journey.externalTripId)} onToggle={(selectedJourney) => onToggleJourney(selectedJourney.externalTripId)} />)}</div>
      <Button type="button" disabled={loading || selectedJourneyIds.length === 0} onClick={onSave}>{loading ? "Saving…" : `Save whitelist (${selectedJourneyIds.length})`}</Button>
      <Button type="button" variant="secondary" disabled={loading || !whitelistSaved} onClick={onActivate}>Activate game</Button>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}

export function AdminActiveView({ game }: AdminActiveViewProps) {
  return <section aria-label="Active game"><h2>{game.name}</h2><StatusBadge variant="success">Active</StatusBadge><p>Game is live and the journey whitelist is locked.</p><a href={`/game/${game.id}`} target="_blank" rel="noreferrer">Open public game</a></section>;
}

function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const refresh = () => map.invalidateSize({ animate: false });
    const timer = window.setTimeout(refresh, 100);
    window.addEventListener("resize", refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener("resize", refresh); };
  }, [map]);
  return null;
}

function MapFitTrips({ points }: { points: Array<{ lat: number; lon: number }> }) {
  const map = useMap();
  const boundsKey = points.map((point) => `${point.lat},${point.lon}`).join(";");
  useEffect(() => {
    if (!points.length) return;
    const bounds = new LatLngBounds(points.map((point) => [point.lat, point.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 9, animate: false });
  }, [map, boundsKey]);
  return null;
}

function MapFocusTrip({ points }: { points: Array<{ lat: number; lon: number }> }) {
  const map = useMap();
  const focusKey = points.map((point) => `${point.lat},${point.lon}`).join(";");
  useEffect(() => {
    if (!points.length) return;
    const bounds = new LatLngBounds(points.map((point) => [point.lat, point.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 10, animate: true });
  }, [map, focusKey]);
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

function directionAngle(points: Array<{ lat: number; lon: number }>, index: number) {
  const current = points[index];
  const next = points[Math.min(points.length - 1, index + 1)];
  const previous = points[Math.max(0, index - 1)];
  const target = next.lat !== current.lat || next.lon !== current.lon ? next : previous;
  return Math.round((Math.atan2(target.lon - current.lon, target.lat - current.lat) * 180) / Math.PI);
}

export function TrainMapView({ journeys, selectedTrainId, liveEntries, currentParticipantId, onSelect }: TrainMapViewProps) {
  const routes = journeys.map((journey) => {
    const live = liveEntries.find((train) => train.trainId === journey.id);
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
  const selectedPoints = routes.find((route) => route.journey.id === selectedTrainId)?.points ?? [];
  const center: LatLngExpression = allPoints.length ? [allPoints[0].lat, allPoints[0].lon] : [51.3, 10.4];

  return <MapContainer className="train-map" center={center} zoom={8} scrollWheelZoom={false}>
    <MapResizeHandler />
    <MapFitTrips points={allPoints} />
    <MapFocusTrip points={selectedPoints} />
    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {[...routes].sort((a, b) => {
      const aEntry = liveEntries.find((entry) => entry.trainId === a.journey.id);
      const bEntry = liveEntries.find((entry) => entry.trainId === b.journey.id);
      const aPriority = a.journey.id === selectedTrainId || aEntry?.bettors.some((bettor) => bettor.participantId === currentParticipantId);
      const bPriority = b.journey.id === selectedTrainId || bEntry?.bettors.some((bettor) => bettor.participantId === currentParticipantId);
      return Number(aPriority) - Number(bPriority);
    }).map(({ journey, points, endpoints }) => {
      const positions = points.map((point) => [point.lat, point.lon] as LatLngExpression);
      const selected = journey.id === selectedTrainId;
      const live = liveEntries.find((train) => train.trainId === journey.id);
      const isMine = live?.bettors.some((bettor) => bettor.participantId === currentParticipantId) ?? false;
      const rankColor = live?.position === 1 ? "#DD2222" : live?.position === 2 ? "#F97316" : live?.position === 3 ? "#DD9900" : null;
      const lineColor = selected && rankColor ? rankColor : selected && isMine ? "#105182" : colors.map.route;
      const markerColor = live?.position === 1 ? colors.fill.red : live?.position === 2 ? "#f97316" : live?.position === 3 ? colors.fill.yellow : isMine ? colors.transport.u : colors.map.train;
      const departure = Date.parse(journey.scheduledDeparture);
      const actualArrival = live?.actualArrival ?? journey.actualArrival ?? null;
      const raceDelayMinutes = live?.raceDelayMinutes ?? journey.raceDelayMinutes ?? null;
      const cancelled = live?.cancelled ?? journey.liveStatus === "cancelled";
      const arrival = Date.parse(actualArrival ?? journey.scheduledArrival ?? "");
      const progress = Number.isFinite(departure) && Number.isFinite(arrival) && arrival > departure ? Math.max(0, Math.min(1, (Date.now() - departure) / (arrival - departure))) : 0;
      const markerIndex = Math.min(points.length - 1, Math.floor(progress * (points.length - 1)));
      const markerPoint = points[markerIndex];
      const markerDirection = directionAngle(points, markerIndex);
      const trainIcon = new DivIcon({ className: "train-map__marker-icon", html: `<span class="train-map__marker" style="--train-marker-color:${markerColor};--train-marker-angle:${markerDirection}deg"><span class="train-map__marker-arrow" aria-hidden="true">➜</span></span>`, iconSize: [24, 24], iconAnchor: [12, 12] });
      return <Fragment key={journey.id}>
        <Polyline positions={positions} pathOptions={{ color: lineColor, weight: selected || isMine ? 6 : 3, opacity: selected || isMine ? 1 : 0.85 }} eventHandlers={{ click: (event) => { event.target.bringToFront(); onSelect(journey.id); } }}>
          <Popup>{journey.displayName}: {journey.origin} → {journey.destination}</Popup>
        </Polyline>
        {endpoints.slice(-1).map((point) => <CircleMarker key={`${journey.id}-arrival`} center={[point.lat, point.lon]} radius={4} pathOptions={{ color: lineColor, fillColor: lineColor, fillOpacity: 1, weight: 2 }}><Popup>Arrival: {journey.destination}</Popup></CircleMarker>)}
        {markerPoint && !cancelled && <Marker pane="markerPane" position={[markerPoint.lat, markerPoint.lon]} icon={trainIcon} eventHandlers={{ click: () => onSelect(journey.id) }}><Popup><strong>{journey.displayName}</strong><br />{raceDelayMinutes === null || raceDelayMinutes === undefined ? "Delay unavailable" : `${raceDelayMinutes >= 0 ? "+" : "−"}${Math.abs(raceDelayMinutes)} min delay gained`}</Popup></Marker>}
      </Fragment>;
    })}
  </MapContainer>;
}
