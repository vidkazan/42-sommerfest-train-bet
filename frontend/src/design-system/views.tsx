import { Fragment, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { DivIcon, LatLngBounds, type LatLngExpression } from "leaflet";
import type { AdminDashboard, Game, Journey, LiveEvent, MapEvent, SkippedDisruption, Station } from "../api/client";
import { colors } from "./tokens";
import { Badge, BadgeButton, Button, Notice, StatusBadge, TrainIcon } from "./components";
import { TimeLabelView } from "./TimeLabelView";
import { JourneyCard } from "./JourneyCard";

export type PublicView = "browse" | "progress" | "race" | "leaderboard" | "events";
export type ViewStatus = "waiting" | "waiting_for_departure" | "in_progress" | "arrived" | "cancelled" | "stale";
export type LiveLeaderboardEntry = {
  trainId: string; displayName: string; origin: string; destination: string; position: number | null;
  scheduledDeparture: string; scheduledArrival: string; durationSeconds: number; actualArrival: string | null; raceDelayMinutes: number | null; finalDelayMinutes: number | null; status: string;
  stopCount: number | null; currentDelayMinutes: number | null; departureDelayMinutes: number | null;
  cancelled: boolean; stale: boolean; bettors: Array<{ participantId: string; username: string }>; geometry?: string | null; routeJson?: string | null;
};
export type GameHeaderViewProps = { eyebrow?: string; title: string; description: string };
export type BrandHeaderProps = { logoSrc: string };
export type TrainMapViewProps = { journeys: Journey[]; mapEvents?: MapEvent[]; selectedTrainId: string | null; liveEntries: LiveLeaderboardEntry[]; currentParticipantId?: string | null; onSelect: (trainId: string) => void };
export type BetViewProps = { journeys: Journey[]; selectedTrainId: string | null; username: string; betSubmitted: boolean; loading: boolean; error: string | null; usernameCheckLoading: boolean; usernameCheckError: string | null; onSelectTrain: (trainId: string) => void; onUsernameChange: (username: string) => void; onCheckUsername: () => Promise<boolean>; onSubmit: () => void };
export type LiveLeaderboardViewProps = { entries: LiveLeaderboardEntry[]; currentParticipantId: string | null; selectedTrainId: string | null; onSelectTrain: (trainId: string) => void; lastUpdatedAt: string | null; stale: boolean };
export type LiveEventsViewProps = { myTrainId: string | null; events: LiveEvent[]; onSelectTrain: (trainId: string) => void };
export type LeaderboardViewProps = { entries: LiveLeaderboardEntry[]; currentParticipantId: string | null; selectedTrainId: string | null; onSelectTrain: (trainId: string) => void; lastUpdatedAt: string | null; stale: boolean; final?: boolean; finalStatus?: string; myUsername?: string; myBetPlace?: number | null; myBetWon?: boolean };
export type RaceChartViewProps = { entries: LiveLeaderboardEntry[]; currentParticipantId: string | null; final?: boolean };
export type ResultsViewProps = { status: string; final: boolean; winners: Array<{ username: string; delaySeconds: number; position?: number; trainId?: string; trainName?: string; bettors?: string[] }>; myUsername: string; myTrainName: string | null; myTrainDelayMinutes: number | null; myBetPlace: number | null; myBetWon: boolean };
export type AdminAccessViewProps = { value: string; loading: boolean; error: string | null; onChange: (value: string) => void; onSubmit: () => void };
export type AdminGameListViewProps = { games: Game[]; onDelete: (game: Game) => void; onDashboard: (game: Game) => void };
export type AdminSetupViewProps = {
  stationQuery: string; stationResults: Station[]; selectedStations: Station[]; manualStationIds: string; stationLoading: boolean; stationError: string | null;
  gameName: string; eventDate: string; bettingStart: string; bettingEnd: string; journeyDepartureStart: string; journeyDepartureEnd: string; gameEndTime: string;
  loading: boolean; error: string | null;
  onStationQueryChange: (value: string) => void; onSearchStations: () => void; onToggleStation: (station: Station, selected: boolean) => void;
  onManualStationIdsChange: (value: string) => void; onGameNameChange: (value: string) => void; onEventDateChange: (value: string) => void;
  onBettingStartChange: (value: string) => void; onBettingEndChange: (value: string) => void; onJourneyStartChange: (value: string) => void; onJourneyEndChange: (value: string) => void; onGameEndTimeChange: (value: string) => void; onCreateGame: () => void;
};
export type AdminReviewViewProps = { game: Game; journeys: Journey[]; minimumDuration: string; selectedJourneyIds: string[]; disruptionsJson: string; constructionJson: string; footballJson: string; skippedDisruptions: SkippedDisruption[]; disruptionMessage: string | null; loading: boolean; whitelistSaved: boolean; error: string | null; onDisruptionsJsonChange: (value: string) => void; onConstructionJsonChange: (value: string) => void; onFootballJsonChange: (value: string) => void; onApplyDisruptions: () => void; onFetch: () => void; onMinimumDurationChange: (value: string) => void; onToggleJourney: (tripId: string) => void; onSave: () => void; onActivate: () => void };
export type AdminActiveViewProps = { game: Game };

const racePalette = [
  "color-mix(in srgb, var(--transport-u-blue) 72%, #000)",
  "color-mix(in srgb, var(--transport-tram-red) 72%, #000)",
  "color-mix(in srgb, #f97316 68%, #000)",
  "color-mix(in srgb, var(--transport-taxi-yellow) 72%, #000)",
  "color-mix(in srgb, var(--chew-fill-green-secondary) 78%, #000)",
  "color-mix(in srgb, var(--transport-bus-magenta) 72%, #000)",
  "color-mix(in srgb, #8b5cf6 68%, #000)",
  "color-mix(in srgb, var(--transport-ship-cyan) 68%, #000)",
  "color-mix(in srgb, var(--transport-s-green) 72%, #000)",
  "color-mix(in srgb, var(--chew-fill-red-primary) 72%, #000)",
  "color-mix(in srgb, #0891b2 68%, #000)",
  "color-mix(in srgb, #c026d3 68%, #000)",
  "color-mix(in srgb, #65a30d 68%, #000)",
  "color-mix(in srgb, #db2777 68%, #000)",
  "color-mix(in srgb, #4f46e5 68%, #000)",
  "color-mix(in srgb, #ea580c 68%, #000)",
  "color-mix(in srgb, #0e7490 72%, #000)",
  "color-mix(in srgb, #a21caf 68%, #000)",
  "color-mix(in srgb, #15803d 68%, #000)",
  "color-mix(in srgb, #6b7280 72%, #000)",
  "color-mix(in srgb, #be123c 68%, #000)",
  "color-mix(in srgb, #4338ca 68%, #000)",
  "color-mix(in srgb, #0f766e 68%, #000)",
  "color-mix(in srgb, #7c3aed 68%, #000)",
];

function fallbackRaceColor(trainId: string) {
  let hash = 0;
  for (const character of trainId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return racePalette[hash % racePalette.length] ?? `hsl(${hash % 360} 65% 34%)`;
}

function buildRaceColorMap(entries: AdminDashboard["entries"]) {
  const colorsByTrain = new Map<string, string>();
  const used = new Set<string>();
  const stableEntries = [...entries].sort((left, right) => left.trainId.localeCompare(right.trainId));
  for (const entry of stableEntries) {
    const persisted = entry.raceColor?.toUpperCase();
    if (persisted && racePalette.includes(persisted) && !used.has(persisted)) {
      colorsByTrain.set(entry.trainId, persisted);
      used.add(persisted);
      continue;
    }
    let hash = 0;
    for (const character of entry.trainId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    let assigned: string | undefined;
    for (let offset = 0; offset < racePalette.length; offset += 1) {
      const candidate = racePalette[(hash + offset) % racePalette.length];
      if (!used.has(candidate)) { assigned = candidate; break; }
    }
    if (!assigned) {
      let variant = 0;
      do {
        assigned = `hsl(${(hash + variant * 137.5) % 360} 65% 34%)`;
        variant += 1;
      } while (used.has(assigned));
    }
    colorsByTrain.set(entry.trainId, assigned);
    used.add(assigned);
  }
  return colorsByTrain;
}

export function CountdownBadge({ target }: { target?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const targetTime = target ? Date.parse(target) : NaN;
  if (!Number.isFinite(targetTime)) return <StatusBadge variant="muted">End time unavailable</StatusBadge>;
  const remaining = Math.max(0, targetTime - now);
  if (remaining === 0) return null;
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const value = hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
  return <Badge variant="blue" className="admin-dashboard__countdown">Ends in {value}</Badge>;
}

export function AdminDashboardView({ dashboard }: { dashboard: AdminDashboard }) {
  const stateLabel = dashboard.state === "live" ? "Race in progress" : dashboard.state === "finished" ? "Race finished" : "Waiting for the race";
  const finished = dashboard.state === "finished";
  const sortedEntries = [...dashboard.entries].sort((left, right) => {
    const leftCancelled = left.cancelled || left.status === "cancelled";
    const rightCancelled = right.cancelled || right.status === "cancelled";
    if (leftCancelled !== rightCancelled) return Number(leftCancelled) - Number(rightCancelled);
    const leftDelay = finished ? left.finalDelayMinutes : left.raceDelayMinutes;
    const rightDelay = finished ? right.finalDelayMinutes : right.raceDelayMinutes;
    if (leftDelay === null && rightDelay !== null) return 1;
    if (leftDelay !== null && rightDelay === null) return -1;
    return (rightDelay ?? -Infinity) - (leftDelay ?? -Infinity);
  });
  const maxDelay = Math.max(0, ...sortedEntries.map((entry) => Math.max(0, (finished ? entry.finalDelayMinutes : entry.raceDelayMinutes) ?? 0)));
  const colorsByTrain = buildRaceColorMap(dashboard.entries);
  const initialAxisMax = Math.max(10, Math.ceil((maxDelay + 1) / 5) * 5);
  const [axisMax, setAxisMax] = useState(initialAxisMax);
  useEffect(() => {
    if (maxDelay >= axisMax) setAxisMax(Math.max(10, Math.ceil((maxDelay + 5) / 5) * 5));
  }, [axisMax, maxDelay]);
  const axisTicks = Array.from({ length: Math.floor(axisMax / 5) + 1 }, (_, index) => index * 5);
  return <section className="admin-dashboard" aria-label="Race dashboard">
    <header className="admin-dashboard__header">
      <div><h1>{dashboard.game?.name ?? "Race dashboard"}</h1></div>
      <div className="admin-dashboard__header-status"><CountdownBadge target={dashboard.game?.gameEndTime} /><StatusBadge variant={dashboard.state === "finished" ? "muted" : dashboard.state === "live" ? "success" : "info"}>{stateLabel}</StatusBadge></div>
    </header>
    <div className="admin-dashboard__meta"><span>{dashboard.entries.length} trains</span><span>{dashboard.lastUpdatedAt ? `Updated ${new Date(dashboard.lastUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for live data"}</span>{dashboard.stale && <span className="admin-dashboard__stale">Live data may be stale</span>}</div>
    {sortedEntries.length === 0 ? <p className="admin-dashboard__empty">Waiting for selected trains to start reporting.</p> : <>
      <div className="admin-race-axis" aria-hidden="true"><span className="admin-race-axis__spacer" /><div className="admin-race-axis__ticks">{axisTicks.map((tick) => <span key={tick} style={{ left: `${(tick / axisMax) * 100}%` }}>{tick === axisMax ? `${tick}+` : tick}</span>)}</div></div>
      <div className="admin-race-stage" style={{ "--race-row-count": sortedEntries.length } as CSSProperties}>
        {sortedEntries.map((entry, index) => {
          const delay = finished ? entry.finalDelayMinutes : entry.raceDelayMinutes;
          const positiveDelay = Math.max(0, delay ?? 0);
          const progress = Math.min(100, (positiveDelay / axisMax) * 100);
          const color = colorsByTrain.get(entry.trainId) ?? fallbackRaceColor(entry.trainId);
          const cancelled = entry.cancelled || entry.status === "cancelled";
          const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`;
          const status = cancelled ? "Cancelled" : entry.status === "arrived" ? "Arrived" : entry.status === "in_progress" ? "In transit" : entry.stale ? "Live data stale" : "Waiting for departure";
          return <article className={`admin-race-row ${index === 0 && !cancelled ? "admin-race-row--leader" : ""}`} key={entry.trainId} style={{ transform: `translateY(calc(${index} * var(--race-row-height)))` }}>
            <div className="admin-race-row__identity"><span className="admin-race-row__rank">{medal}</span><Badge variant="clear" className={`admin-race-row__train-badge ${cancelled ? "is-cancelled" : ""}`} style={{ background: cancelled ? "var(--ds-border)" : color }}>{entry.displayName}</Badge></div>
            <div className="admin-race-row__track"><span className="admin-race-row__bar" style={{ background: cancelled ? "var(--ds-border)" : color, width: `${progress}%` }} /><span className="admin-race-row__marker" style={{ background: cancelled ? "var(--ds-border)" : color, left: `${progress}%` }} /><Badge variant="clear" className="admin-race-row__value" style={{ background: "transparent", color: cancelled ? "var(--ds-text-muted)" : color }}>{cancelled ? "OUT" : delay === null ? "—" : `${delay >= 0 ? "+" : "−"}${Math.abs(delay)} min`}</Badge></div>
            <span className="admin-race-row__status">{status}</span>
          </article>;
        })}
      </div>
    </>}
  </section>;
}

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

export function BrandHeader({ logoSrc }: BrandHeaderProps) {
  return <header className="brand-header"><img src={logoSrc} alt="" className="brand-header__logo" /><span className="brand-header__name">ChooChoo Delay Race</span></header>;
}

export function BetView({ journeys, selectedTrainId, username, betSubmitted, loading, error, usernameCheckLoading, usernameCheckError, onSelectTrain, onUsernameChange, onCheckUsername, onSubmit }: BetViewProps) {
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  useEffect(() => {
    if (!selectedTrainId) return;
    document.querySelector(`[data-journey-id="${selectedTrainId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
      <form className="bet-form bet-selection__actions" onSubmit={async (event) => { event.preventDefault(); if (await onCheckUsername()) setConfirmationOpen(true); }}>
        <input id="username" aria-label="Username" value={username} onChange={(event) => onUsernameChange(event.target.value)} minLength={2} maxLength={24} placeholder="Your name" required autoComplete="nickname" />
        {usernameCheckError && <p className="error" role="alert">{usernameCheckError}</p>}
        <BadgeButton type="submit" className="bet-confirm-button ds-text-huge" disabled={usernameCheckLoading || !selectedTrainId}>{usernameCheckLoading ? "Checking…" : selectedTrainId ? `Bet on ${journeys.find((journey) => journey.id === selectedTrainId)?.displayName ?? "train"}` : "Select a train"}</BadgeButton>
      </form>
      {confirmationOpen && selectedTrainId && <dialog className="bet-confirmation" open aria-labelledby="bet-confirmation-title">
        <div className="bet-confirmation__panel">
          <h2 id="bet-confirmation-title">Confirm your bet</h2>
          <p className="ds-text-medium">You’re betting on <strong>{journeys.find((journey) => journey.id === selectedTrainId)?.displayName ?? "this train"}</strong> as <strong>{username}</strong>.</p>
          <Notice className="bet-rules">The train with the biggest actual delay at its final stop wins. Cancelled trains are out of the race. Ties share the win.</Notice>
          <div className="bet-confirmation__actions">
            <BadgeButton type="button" className="bet-confirmation__back" onClick={() => setConfirmationOpen(false)} disabled={loading}>Go back</BadgeButton>
            <BadgeButton type="button" className="bet-confirmation__submit" onClick={() => onSubmit()} disabled={loading}>{loading ? "Submitting…" : "Confirm bet"}</BadgeButton>
          </div>
        </div>
      </dialog>}
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

function formatPlace(position: number) {
  const suffix = position % 100 >= 11 && position % 100 <= 13 ? "th" : position % 10 === 1 ? "st" : position % 10 === 2 ? "nd" : position % 10 === 3 ? "rd" : "th";
  return `${position}${suffix} place`;
}

export function LiveLeaderboardView({ entries, currentParticipantId, selectedTrainId, onSelectTrain, lastUpdatedAt, stale }: LiveLeaderboardViewProps) {
  const prioritizedEntries = prioritizeCurrentBet(entries, currentParticipantId);
  const myTrainId = entries.find((entry) => entry.bettors.some((bettor) => bettor.participantId === currentParticipantId))?.trainId;
  const updatedMinutesAgo = getUpdatedMinutesAgo(lastUpdatedAt);
  return <section className="progress-view" aria-label="Live progress">
    <section className="progress-race" aria-label="Live race">
      <div className="progress-meta ds-text-medium"><Notice>{stale ? "Live data is temporarily stale." : "Updates every minute."}</Notice>{updatedMinutesAgo !== null && <span>Last update — {updatedMinutesAgo === 0 ? "just now" : `${updatedMinutesAgo} min ago`}</span>}</div>
      {!prioritizedEntries.length ? <p>No bets yet.</p> : <div className="journey-list" aria-label="Live leaderboard">{prioritizedEntries.map((entry) => {
        const journey: Journey = { id: entry.trainId, externalTripId: entry.trainId, displayName: entry.displayName, origin: entry.origin, destination: entry.destination, scheduledDeparture: entry.scheduledDeparture, scheduledArrival: entry.scheduledArrival, durationSeconds: entry.durationSeconds, stopCount: entry.stopCount, actualArrival: entry.actualArrival, raceDelayMinutes: entry.raceDelayMinutes, finalDelayMinutes: entry.finalDelayMinutes, departureDelayMinutes: entry.departureDelayMinutes, status: entry.cancelled ? "cancelled" : undefined, liveStatus: entry.status };
        return <JourneyCard key={entry.trainId} journey={journey} mode="leaderboard" position={entry.position} raceStatus={getRaceState(entry) ?? undefined} bettors={entry.bettors} currentParticipantId={currentParticipantId} selected={entry.trainId === selectedTrainId} onSelect={() => onSelectTrain(entry.trainId)} />;
      })}</div>}
    </section>
  </section>;
}

export function LiveEventsView({ myTrainId, events, onSelectTrain }: LiveEventsViewProps) {
  const [onlyMyTrain, setOnlyMyTrain] = useState(false);
  const visibleEvents = onlyMyTrain ? events.filter((event) => event.trainId === myTrainId) : events;
  return <section className="live-events live-events-view" aria-label="Events">
      <div className="live-events__heading"><h2>Events</h2><label className="live-events__filter"><input type="checkbox" checked={onlyMyTrain} onChange={(event) => setOnlyMyTrain(event.target.checked)} disabled={!myTrainId} /> Only my train</label></div>
      {!visibleEvents.length ? <p className="live-events__empty">{onlyMyTrain ? "No events for your train yet." : "No drama yet. The trains are behaving."}</p> : <div className="live-events__list">{visibleEvents.map((event) => {
        const selectable = Boolean(event.trainId);
        const selectEventTrain = () => { if (event.trainId) onSelectTrain(event.trainId); };
        const numericEvent = event.currentDelayMinutes !== undefined && event.currentDelayMinutes !== null;
        const currentDelay = numericEvent ? event.currentDelayMinutes : null;
        const change = event.changeMinutes ?? null;
        const changeLabel = change === null ? "—" : `${change > 0 ? "↑ " : change < 0 ? "↓ " : "— "}${Math.abs(change)}`;
        const title = (event.displayName ?? event.title).split(" ")[0];
        return <article className={`live-event ${selectable ? "selectable" : ""}`.trim()} key={event.id} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} onClick={selectable ? selectEventTrain : undefined} onKeyDown={selectable ? (keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") { keyboardEvent.preventDefault(); selectEventTrain(); } } : undefined}>
        <div className="live-event__body">
          <div className="live-event__top"><strong>{title}</strong><time dateTime={event.createdAt}>{eventAge(event.createdAt)}</time>{event.trainId === myTrainId && <Badge variant="blue" className="live-event__my-train">My train</Badge>}</div>
          <div className="live-event__numbers">{numericEvent ? <strong className={`live-event__delay live-event__delay--${currentDelay! > 0 ? "late" : currentDelay! < 0 ? "early" : "on-time"}`}>{currentDelay! >= 0 ? "+" : "−"}{Math.abs(currentDelay!)} min</strong> : <strong className="live-event__delay">{event.title}</strong>}{numericEvent && <Badge variant="green" className="live-event__change">{changeLabel}</Badge>}</div>
          <p className="live-event__message">{numericEvent && event.message.startsWith("Delay ") ? event.title : event.message}</p>
        </div>
        {event.source === "motis" && <div className="live-event__badges"><Badge variant={eventVariant(event)}>MOTIS</Badge></div>}
      </article>})}</div>}
    </section>;
}

export function RaceChartView({ entries, currentParticipantId, final = false }: RaceChartViewProps) {
  const myTrainId = entries.find((entry) => entry.bettors.some((bettor) => bettor.participantId === currentParticipantId))?.trainId ?? null;
  const sorted = [...entries].sort((left, right) => {
    const leftDelay = final ? left.finalDelayMinutes : left.raceDelayMinutes;
    const rightDelay = final ? right.finalDelayMinutes : right.raceDelayMinutes;
    return (rightDelay ?? -Infinity) - (leftDelay ?? -Infinity);
  });
  const maxDelay = Math.max(0, ...sorted.map((entry) => Math.max(0, final ? entry.finalDelayMinutes ?? 0 : entry.raceDelayMinutes ?? 0)));
  const axisMax = maxDelay <= 10 ? 10 : Math.ceil(maxDelay / 10) * 10;
  const gridSteps = [0, 25, 50, 75, 100];
  return <section className="race-chart-view" aria-label="Delay race">
    <header className="race-chart__header"><div><h2>The delay race</h2><p>Biggest actual delay at the final stop wins.</p></div></header>
    <div className="race-chart__axis" aria-hidden="true"><span className="race-chart__axis-spacer" />{gridSteps.map((step) => <span key={step}>{Math.round(axisMax * step / 100)} min</span>)}</div>
    <div className="race-chart__plot">
      {gridSteps.map((step) => <span className="race-chart__grid-line" key={step} style={{ left: `calc(var(--race-label-width) + (100% - var(--race-label-width)) * ${step / 100})` }} />)}
      {sorted.map((entry) => {
        const delay = final ? entry.finalDelayMinutes : entry.raceDelayMinutes;
        const positiveDelay = Math.max(0, delay ?? 0);
        const width = axisMax ? (positiveDelay / axisMax) * 100 : 0;
        const mine = entry.trainId === myTrainId;
        return <div className={`race-chart__row ${mine ? "mine" : ""}`.trim()} key={entry.trainId}>
          <div className="race-chart__label"><span>{entry.displayName}</span>{mine && <Badge variant="blue">My train</Badge>}</div>
          <div className="race-chart__bar-area"><span className="race-chart__bar" style={{ width: `${width}%` }} /><span className="race-chart__value">{delay === null || delay === undefined ? "—" : `${delay >= 0 ? "+" : "−"}${Math.abs(delay)} min`}</span></div>
        </div>;
      })}
    </div>
  </section>;
}

export function LeaderboardView({ entries, currentParticipantId, selectedTrainId, onSelectTrain, lastUpdatedAt, stale, final = false, finalStatus, myUsername, myBetPlace, myBetWon }: LeaderboardViewProps) {
  const finalEntries = final ? [...entries].sort((left, right) => {
    const leftValid = !left.cancelled && left.finalDelayMinutes !== null;
    const rightValid = !right.cancelled && right.finalDelayMinutes !== null;
    if (leftValid !== rightValid) return Number(rightValid) - Number(leftValid);
    return (right.finalDelayMinutes ?? -Infinity) - (left.finalDelayMinutes ?? -Infinity);
  }).map((entry, index, sorted) => ({ ...entry, position: !entry.cancelled && entry.finalDelayMinutes !== null ? (index === 0 || entry.finalDelayMinutes !== sorted[index - 1].finalDelayMinutes ? index + 1 : sorted[index - 1].position) : null })) : entries;
  const prioritizedEntries = prioritizeCurrentBet(finalEntries, currentParticipantId);
  const currentBetEntry = finalEntries.find((entry) => entry.bettors.some((bettor) => bettor.participantId === currentParticipantId));
  const currentBetPlace = currentBetEntry?.position ?? myBetPlace;
  const updatedMinutesAgo = getUpdatedMinutesAgo(lastUpdatedAt);
  return <section className="leaderboard-view" aria-label="Leaderboard">
    <h2>{final ? "Final standings" : "Who’s betting on each train?"}</h2>
    {final && finalStatus === "finished" && myUsername && <div className="results-my-bet">
      <Badge variant="blue">{myUsername}</Badge>
      <strong className="results-my-bet__status">{currentBetPlace ? `${myBetWon ? "You got" : "You did not win — you got"} ${formatPlace(currentBetPlace)}` : "You did not win"}</strong>
    </div>}
    {final && finalStatus === "no_winner" && <Notice>No winner — every selected train was cancelled.</Notice>}
    <div className="progress-meta ds-text-medium"><Notice>{stale ? "Live data is temporarily stale." : "Updates every minute."}</Notice>{updatedMinutesAgo !== null && <span>Last update — {updatedMinutesAgo === 0 ? "just now" : `${updatedMinutesAgo} min ago`}</span>}</div>
    {!prioritizedEntries.length ? <p>No bets yet.</p> : <div className="leaderboard-list">{prioritizedEntries.map((entry) => {
      const rankVariant = entry.position === 1 ? "red" : entry.position === 2 ? "orange" : entry.position === 3 ? "yellow" : "secondary";
      const delayMinutes = final ? entry.finalDelayMinutes : entry.raceDelayMinutes;
      const delay = delayMinutes !== null && delayMinutes !== undefined ? `${delayMinutes >= 0 ? "+" : "−"}${Math.abs(delayMinutes)} min` : null;
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

export function ResultsView({ status, final, winners, myUsername, myTrainName, myTrainDelayMinutes, myBetPlace, myBetWon }: ResultsViewProps) {
  const placeBadge = (index: number) => <Badge variant={index === 0 ? "red" : index === 1 ? "orange" : index === 2 ? "yellow" : "secondary"}>{formatPlace(index + 1)}</Badge>;
  return <section aria-label="Final results">
    <h2>Results</h2>
    {!final || status === "pending" ? <Notice>Waiting for all trains to reach their final station.</Notice>
      : status === "no_winner" ? <Notice>No winner — every selected train was cancelled.</Notice>
        : <div className="winner-result">
          <div className="results-my-bet">
            <Badge variant="blue">{myUsername}</Badge>
            <strong className="results-my-bet__status">{myBetPlace ? `${myBetWon ? "You got" : "You did not win — you got"} ${formatPlace(myBetPlace)}` : "You did not win"}</strong>
          </div>
          <div className="results-winner-list">{winners.map((winner, index) => <article className="results-winner-cell" key={`${winner.username}-${index}`}>
            <div className="results-winner-cell__top">{winner.position ? <Badge variant={winner.position === 1 ? "red" : winner.position === 2 ? "orange" : winner.position === 3 ? "yellow" : "secondary"}>{formatPlace(winner.position)}</Badge> : placeBadge(index)}</div>
            <div className="results-winner-cell__bottom"><span>+{Math.round(winner.delaySeconds / 60)} min</span><span>{winner.trainName ?? "Train"}</span></div>
            <div className="results-winner-cell__bettors">{winner.bettors?.join(" · ") ?? winner.username}</div>
          </article>)}</div>
        </div>}
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

export function AdminGameListView({ games, onDelete, onDashboard }: AdminGameListViewProps) {
  return <>
    <h2>Games</h2>
    {games.length === 0 ? <p>No games created yet.</p> : <div className="journey-list">
      {games.map((game) => <article className="journey-card" key={game.id}>
        <strong>{game.name}</strong>
        <span>{game.eventDate} · {game.status}</span>
        <span>{game.bettingStart ? `${new Date(game.bettingStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${game.bettingEnd ? new Date(game.bettingEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}` : ""}</span>
        <div className="admin-game-actions"><a href={`/game/${game.id}`} target="_blank" rel="noreferrer">Open public game</a>{(game.status === "active" || game.status === "finished") && <Button type="button" variant="secondary" onClick={() => onDashboard(game)}>Dashboard</Button>}</div>
        <Button type="button" variant="secondary" onClick={() => onDelete(game)}>Delete game</Button>
      </article>)}
    </div>}
  </>;
}

export function AdminSetupView({ stationQuery, stationResults, selectedStations, manualStationIds, stationLoading, stationError, gameName, eventDate, bettingStart, bettingEnd, journeyDepartureStart, journeyDepartureEnd, gameEndTime, loading, error, onStationQueryChange, onSearchStations, onToggleStation, onManualStationIdsChange, onGameNameChange, onEventDateChange, onBettingStartChange, onBettingEndChange, onJourneyStartChange, onJourneyEndChange, onGameEndTimeChange, onCreateGame }: AdminSetupViewProps) {
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
      <label className="field-label" htmlFor="game-end-time">Game end time</label><input id="game-end-time" type="time" value={gameEndTime} onChange={(event) => onGameEndTimeChange(event.target.value)} required /><p className="field-help">When the last selected train is expected to arrive.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <Button type="submit" disabled={loading || (selectedStations.length === 0 && !manualStationIds.trim())}>{loading ? "Creating…" : "Create draft game"}</Button>
    </form>
  </>;
}

export function AdminReviewView({ game, journeys, minimumDuration, selectedJourneyIds, disruptionsJson, constructionJson, footballJson, skippedDisruptions, disruptionMessage, loading, whitelistSaved, error, onDisruptionsJsonChange, onConstructionJsonChange, onFootballJsonChange, onApplyDisruptions, onFetch, onMinimumDurationChange, onToggleJourney, onSave, onActivate }: AdminReviewViewProps) {
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
      {whitelistSaved && <section className="admin-disruptions" aria-label="Railway disruptions">
        <h3>Map events</h3>
        <p className="field-help">Paste events after selecting journeys. Disruptions and Baustellen use 1 km; football matches use 10 km from selected journey paths.</p>
        <label className="field-label" htmlFor="disruptions-json">Disruptions JSON</label>
        <textarea id="disruptions-json" value={disruptionsJson} onChange={(event) => onDisruptionsJsonChange(event.target.value)} placeholder='Paste a JSON array from the disruption feed' rows={8} />
        <label className="field-label" htmlFor="construction-json">Baustellen JSON</label>
        <textarea id="construction-json" value={constructionJson} onChange={(event) => onConstructionJsonChange(event.target.value)} placeholder='Paste a JSON array from the Baustellen feed' rows={8} />
        <label className="field-label" htmlFor="football-json">Football matches JSON</label>
        <textarea id="football-json" value={footballJson} onChange={(event) => onFootballJsonChange(event.target.value)} placeholder='Paste a JSON array of matches' rows={8} />
        <Button type="button" variant="secondary" onClick={onApplyDisruptions} disabled={loading}>{loading ? "Applying…" : "Apply disruptions"}</Button>
        {disruptionMessage && <p className="field-help" role="status">{disruptionMessage}</p>}
        {skippedDisruptions.length > 0 && <p className="field-help" role="status">{skippedDisruptions.length} map event record(s) were skipped.</p>}
      </section>}
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

function trainPosition(journey: Journey, points: Array<{ lat: number; lon: number }>, live?: LiveLeaderboardEntry) {
  if (!points.length) return null;
  const departure = Date.parse(journey.scheduledDeparture);
  const actualArrival = live?.actualArrival ?? journey.actualArrival ?? null;
  const arrival = Date.parse(actualArrival ?? journey.scheduledArrival ?? "");
  const progress = Number.isFinite(departure) && Number.isFinite(arrival) && arrival > departure
    ? Math.max(0, Math.min(1, (Date.now() - departure) / (arrival - departure))) : 0;
  return points[Math.min(points.length - 1, Math.floor(progress * (points.length - 1)))];
}

function MapSelectedLineHandler({ points, selectedTrainId }: { points: Array<{ lat: number; lon: number }>; selectedTrainId: string | null }) {
  const map = useMap();
  const pointsKey = points.map((point) => `${point.lat},${point.lon}`).join(";");
  useEffect(() => {
    if (!selectedTrainId || !points.length) return;
    const bounds = new LatLngBounds(points.map((point) => [point.lat, point.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 10, animate: true });
  }, [map, pointsKey, selectedTrainId]);
  return null;
}

function MapEventLayer({ mapEvents }: { mapEvents: MapEvent[] }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const updateZoom = () => setZoom(map.getZoom());
    map.on("zoomend", updateZoom);
    return () => { map.off("zoomend", updateZoom); };
  }, [map]);
  const clusterSize = Math.max(0.001, Math.min(0.25, 0.5 / 2 ** Math.max(0, zoom - 5)));
  const eventGroups = [...mapEvents.reduce((groups, event) => {
    const latitudeCell = Math.floor(event.latitude / clusterSize);
    const longitudeCell = Math.floor(event.longitude / clusterSize);
    const key = `${latitudeCell}:${longitudeCell}`;
    const current = groups.get(key) ?? [];
    current.push(event);
    groups.set(key, current);
    return groups;
  }, new Map<string, MapEvent[]>()).values()].map((events) => ({
    events,
    latitude: events.reduce((sum, event) => sum + event.latitude, 0) / events.length,
    longitude: events.reduce((sum, event) => sum + event.longitude, 0) / events.length,
  }));
  const eventIcon = (events: MapEvent[]) => {
    const category = events[0]?.category ?? "disruption";
    const symbol = events.length > 1 ? events.length : category === "construction" ? "⚒" : category === "football" ? "⚽" : "⚠";
    return new DivIcon({ className: "train-map__event-icon", html: `<span class="train-map__event-marker train-map__event-marker--${category}">${symbol}</span>`, iconSize: [20, 20], iconAnchor: [10, 10] });
  };
  return <>{eventGroups.map((group) => <Marker key={group.events.map((event) => event.id).join("-")} position={[group.latitude, group.longitude]} icon={eventIcon(group.events)}>
    <Popup><div className="train-map__event-popup">{group.events.map((event) => <article key={event.id}><strong>{event.title}</strong><p>{event.description ?? (event.category === "football" ? "Football match" : "Railway event")}</p><small>{new Date(event.startsAt).toLocaleString()} – {new Date(event.endsAt).toLocaleString()}</small></article>)}</div></Popup>
  </Marker>)}</>;
}

export function TrainMapView({ journeys, mapEvents = [], selectedTrainId, liveEntries, currentParticipantId, onSelect }: TrainMapViewProps) {
  const routes = journeys.map((journey) => {
    const live = liveEntries.find((train) => train.trainId === journey.id);
    const geometry = live?.geometry ?? journey.geometry;
    const routeJson = live?.routeJson ?? journey.routeJson;
    let endpoints: Array<{ lat: number; lon: number }> = [];
    try { endpoints = JSON.parse(routeJson ?? "[]") as Array<{ lat: number; lon: number }>; } catch { /* ignore malformed endpoints */ }
    let encoded: string[] = [];
    try { encoded = JSON.parse(geometry ?? "[]") as string[]; } catch { if (geometry) encoded = [geometry]; }
    const points = encoded.flatMap(decodePolyline);
    const endpointPoints = endpoints.length >= 2
      ? [endpoints[0], endpoints[endpoints.length - 1]]
      : points.length >= 2 ? [points[0], points[points.length - 1]] : points;
    return { journey, points, endpoints: endpointPoints };
  }).filter((route) => route.points.length > 0);
  const allPoints = routes.flatMap((route) => route.points);
  const center: LatLngExpression = allPoints.length ? [allPoints[0].lat, allPoints[0].lon] : [51.3, 10.4];
  const selectedRoute = routes.find((route) => route.journey.id === selectedTrainId);

  return <MapContainer className="train-map" center={center} zoom={8} scrollWheelZoom={false}>
    <MapResizeHandler />
    <MapFitTrips points={allPoints} />
    <MapSelectedLineHandler points={selectedRoute?.points ?? []} selectedTrainId={selectedTrainId} />
    <MapEventLayer mapEvents={mapEvents} />
    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <div className="train-map__caption">The train with the biggest delay gain wins.</div>
    <div className="train-map__legend" aria-label="Map legend">
      <span><i className="train-map__legend-swatch train-map__legend-swatch--route" />Route</span>
      <span><i className="train-map__legend-swatch train-map__legend-swatch--mine" />Your train</span>
      <span><i className="train-map__legend-swatch train-map__legend-swatch--leader" />Leading</span>
      <span><i className="train-map__legend-swatch train-map__legend-swatch--cancelled" />Cancelled</span>
      <span><i className="train-map__legend-event" />Disruption</span>
      <span><i className="train-map__legend-event train-map__legend-event--construction" />Baustelle</span>
      <span><i className="train-map__legend-event train-map__legend-event--football" />Football</span>
    </div>
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
      const isLeading = live?.position === 1;
      const rankColor = isLeading ? "#DD2222" : live?.position === 2 ? "#F97316" : live?.position === 3 ? "#DD9900" : null;
      const actualArrival = live?.actualArrival ?? journey.actualArrival ?? null;
      const raceDelayMinutes = live?.raceDelayMinutes ?? journey.raceDelayMinutes ?? null;
      const cancelled = live?.cancelled ?? journey.liveStatus === "cancelled";
      const finished = live?.status === "arrived" || journey.liveStatus === "arrived";
      const lineColor = cancelled ? "#737373" : selected ? (rankColor ?? (isMine ? "#105182" : colors.map.routeSelected)) : isLeading ? "#DD2222" : colors.map.route;
      const markerColor = cancelled ? "#737373" : isLeading ? colors.fill.red : live?.position === 2 ? "#f97316" : live?.position === 3 ? colors.fill.yellow : isMine ? colors.transport.u : colors.map.train;
      const markerPoint = trainPosition(journey, points, live);
      const markerIndex = points.indexOf(markerPoint ?? points[0]);
      const markerDirection = directionAngle(points, markerIndex);
      const lineName = journey.lineName ?? journey.displayName.match(/^([^\s(]+(?:\s*\d+[A-Z]?))/i)?.[1] ?? journey.displayName;
      const safeDisplayName = lineName.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
      const labelDelay = raceDelayMinutes === null || raceDelayMinutes === undefined ? "" : ` · ${raceDelayMinutes >= 0 ? "+" : "−"}${Math.abs(raceDelayMinutes)} min`;
      const labelState = cancelled ? " · CANCELLED" : selected || isMine ? " · YOUR TRAIN" : isLeading ? " · LEADING" : "";
      const trainIcon = new DivIcon({ className: "train-map__marker-icon", html: `<span class="train-map__marker-label" style="--train-marker-color:${markerColor}">${safeDisplayName}${labelDelay}${labelState}</span><span class="train-map__marker" aria-label="${cancelled ? "Train cancelled" : finished ? "Train finished" : "Train direction"}" style="--train-marker-color:${markerColor};--train-marker-angle:${markerDirection}deg"><span class="train-map__marker-arrow" aria-hidden="true">${cancelled ? "×" : finished ? "✓" : "➜"}</span></span>`, iconSize: [24, 42], iconAnchor: [12, 12] });
      return <Fragment key={journey.id}>
        <Polyline positions={positions} pathOptions={{ color: lineColor, weight: selected || isMine || isLeading ? 6 : 3, opacity: selected || isMine || isLeading ? 1 : 0.85, dashArray: cancelled ? "8 8" : undefined }} eventHandlers={{ click: (event) => { event.target.bringToFront(); onSelect(journey.id); } }}>
          <Popup>{journey.displayName}: {journey.origin} → {journey.destination}</Popup>
        </Polyline>
        {endpoints.map((point, index) => <CircleMarker key={`${journey.id}-${index === 0 ? "origin" : "arrival"}`} center={[point.lat, point.lon]} radius={index === 0 ? 4 : 5} pathOptions={{ color: lineColor, fillColor: lineColor, fillOpacity: 1, weight: 2 }}><Popup>{index === 0 ? `Departure: ${journey.origin}` : `Arrival: ${journey.destination}`}</Popup></CircleMarker>)}
        {markerPoint && <Marker pane="markerPane" position={[markerPoint.lat, markerPoint.lon]} icon={trainIcon} eventHandlers={{ click: () => onSelect(journey.id) }}><Popup><strong>{journey.displayName}</strong><br />{cancelled ? "Cancelled — out of the race" : raceDelayMinutes === null || raceDelayMinutes === undefined ? "Delay unavailable" : `${raceDelayMinutes >= 0 ? "+" : "−"}${Math.abs(raceDelayMinutes)} min delay gained`}</Popup></Marker>}
      </Fragment>;
    })}
  </MapContainer>;
}
