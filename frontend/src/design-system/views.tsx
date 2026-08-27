import { Fragment, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { DivIcon, LatLngBounds, type LatLngExpression } from "leaflet";
import type { ActiveGame, AdminDashboard, Game, Journey, LiveEvent, LiveStop, MapEvent, ReplaySnapshot, SkippedDisruption, Station } from "../api/client";
import { colors } from "./tokens";
import { Badge, BadgeButton, Button, DelayBadge, Notice, ReplayBadge, StatusBadge, TrainIcon } from "./components";
import { TimeLabelView } from "./TimeLabelView";
import { JourneyCard } from "./JourneyCard";
import { trainColor } from "./trainColors";
import { applyHistoryRatings } from "../historyRatings";
import { RaceStage } from "./RaceStage";
import { gameNameEmoji, TrainLabel, TrainLabelButton } from "./TrainLabel";

const publicGamePath = (gameId: string) => `${import.meta.env.BASE_URL}game/${gameId}`;
const mapZoomBoost = 0.8;

export type PublicView = "browse" | "results" | "progress" | "race" | "leaderboard" | "events";
export type ViewStatus = "waiting" | "waiting_for_departure" | "in_progress" | "arrived" | "cancelled" | "stale";
export type LiveLeaderboardEntry = {
  trainId: string; displayName: string; origin: string; destination: string; position: number | null;
  scheduledDeparture: string; scheduledArrival: string; durationSeconds: number; actualArrival: string | null; raceDelayMinutes: number | null; finalDelayMinutes: number | null; status: string;
  stopCount: number | null; currentDelayMinutes: number | null; departureDelayMinutes: number | null;
  cancelled: boolean; stale: boolean; bettors: Array<{ participantId: string; username: string }>; geometry?: string | null; routeJson?: string | null; stops?: LiveStop[];
  betCount?: number;
  raceColor?: string | null; delayHistory?: Array<{ delayMinutes: number; recordedAt: string }>; replayHistory: ReplaySnapshot[];
};
export type GameHeaderViewProps = { eyebrow?: string; title: string; description: string };
export type BrandHeaderProps = { logoSrc: string };
export type TrainMapViewProps = { journeys: Journey[]; mapEvents?: MapEvent[]; selectedTrainId: string | null; liveEntries: LiveLeaderboardEntry[]; currentParticipantId?: string | null; onSelect: (trainId: string) => void };
export type BetViewProps = { journeys: Journey[]; selectedTrainId: string | null; username: string; betSubmitted: boolean; loading: boolean; error: string | null; usernameCheckLoading: boolean; usernameCheckError: string | null; onSelectTrain: (trainId: string) => void; onUsernameChange: (username: string) => void; onCheckUsername: () => Promise<boolean>; onSubmit: () => void; cardsOnly?: boolean; actionsOnly?: boolean };
export type LiveLeaderboardViewProps = { entries: LiveLeaderboardEntry[]; journeys: Journey[]; currentParticipantId: string | null; selectedTrainId: string | null; onSelectTrain: (trainId: string) => void; lastUpdatedAt: string | null; stale: boolean };
export type LiveEventsViewProps = { myTrainId: string | null; events: LiveEvent[]; entries: LiveLeaderboardEntry[]; journeys: Journey[]; onSelectTrain: (trainId: string) => void };
export type LeaderboardViewProps = { entries: LiveLeaderboardEntry[]; journeys: Journey[]; currentParticipantId: string | null; selectedTrainId: string | null; onSelectTrain: (trainId: string) => void; lastUpdatedAt: string | null; stale: boolean; final?: boolean; finalStatus?: string; myUsername?: string; myBetPlace?: number | null; myBetWon?: boolean; resultsView?: boolean };
export type RaceChartViewProps = { entries: LiveLeaderboardEntry[]; journeys: Journey[]; currentParticipantId: string | null; final?: boolean; nextUpdateAt?: number | null; updating?: boolean; replayEntries?: LiveLeaderboardEntry[]; replayTimestamp?: number; onSelectTrain?: (trainId: string) => void; onOpenBets?: () => void };
export type ResultsViewProps = { status: string; final: boolean; winners: Array<{ username: string; delaySeconds: number; outcome?: "delay" | "cancellation"; position?: number; trainId?: string; trainName?: string; raceColor?: string | null; bettors?: string[] }>; myUsername: string; myTrainName: string | null; myTrainDelayMinutes: number | null; myBetPlace: number | null; myBetWon: boolean };
export type AdminAccessViewProps = { value: string; loading: boolean; error: string | null; onChange: (value: string) => void; onSubmit: () => void };
export type AdminGameListViewProps = { games: Game[]; loading: boolean; error: string | null; message: string | null; onDelete: (game: Game) => void; onContinue: (game: Game) => void; onDashboard: (game: Game) => void; onPopulateBets: (game: Game) => void };
export type AdminSetupViewProps = {
  stationQuery: string; stationResults: Station[]; selectedStations: Station[]; manualStationIds: string; stationLoading: boolean; stationError: string | null;
  gameName: string; eventDate: string; bettingStart: string; bettingEnd: string; journeyDepartureStart: string; journeyDepartureEnd: string;
  loading: boolean; error: string | null;
  onStationQueryChange: (value: string) => void; onSearchStations: () => void; onToggleStation: (station: Station, selected: boolean) => void;
  onManualStationIdsChange: (value: string) => void; onGameNameChange: (value: string) => void; onEventDateChange: (value: string) => void;
  onBettingStartChange: (value: string) => void; onBettingEndChange: (value: string) => void; onJourneyStartChange: (value: string) => void; onJourneyEndChange: (value: string) => void; onCreateGame: () => void;
};
export type AdminReviewViewProps = { game: Game; journeys: Journey[]; minimumDuration: string; minimumStars: string; maximumStars: string; minimumDelayMinutes: string; maximumDelayMinutes: string; onlyJourneysWithGameName: boolean; selectedJourneyIds: string[]; disruptionsJson: string; constructionJson: string; footballJson: string; skippedDisruptions: SkippedDisruption[]; disruptionMessage: string | null; loading: boolean; whitelistSaved: boolean; error: string | null; onDisruptionsJsonChange: (value: string) => void; onConstructionJsonChange: (value: string) => void; onFootballJsonChange: (value: string) => void; onApplyDisruptions: () => void; onFetch: () => void; onMinimumDurationChange: (value: string) => void; onMinimumStarsChange: (value: string) => void; onMaximumStarsChange: (value: string) => void; onMinimumDelayMinutesChange: (value: string) => void; onMaximumDelayMinutesChange: (value: string) => void; onOnlyJourneysWithGameNameChange: (value: boolean) => void; onToggleJourney: (tripId: string) => void; onSave: () => void; onActivate: () => void };
export type AdminActiveViewProps = { game: Game };

export function CountdownBadge({ label, target, variant = "blue" }: { label: string; target?: string | null; variant?: "blue" | "secondary" }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const targetTime = target ? Date.parse(target) : NaN;
  if (!Number.isFinite(targetTime)) return <StatusBadge variant="muted">{label} unavailable</StatusBadge>;
  const remaining = Math.max(0, targetTime - now);
  if (remaining === 0) return null;
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const value = hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
  return <Badge variant={variant} className="admin-dashboard__countdown">{label} {value}</Badge>;
}

export function AdminDashboardView({ dashboard, nextUpdateAt }: { dashboard: AdminDashboard; nextUpdateAt?: number | null }) {
  const finished = dashboard.state === "finished";
  const countdownLabel = dashboard.state === "waiting" ? "Starts in" : "Ends in";
  const countdownTarget = dashboard.state === "waiting" ? dashboard.game?.journeyDepartureStart : dashboard.game?.gameEndTime;
  const visibleEntries = dashboard.entries;
  const totalBets = visibleEntries.reduce((total, entry) => total + entry.betCount, 0);
  const stageEntries = visibleEntries.map((entry) => ({ ...entry, raceDelayMinutes: entry.raceDelayMinutes, finalDelayMinutes: entry.finalDelayMinutes }));
  return <section className="admin-dashboard" aria-label="Race dashboard">
    <header className="admin-dashboard__header">
      <div><h1>{dashboard.game?.name ?? "Race dashboard"}</h1></div>
      <div className="admin-dashboard__header-status">{finished ? <StatusBadge variant="muted">Finished</StatusBadge> : <><CountdownBadge label={countdownLabel} target={countdownTarget} variant={countdownLabel === "Ends in" ? "secondary" : "blue"} />{nextUpdateAt && <CountdownBadge label="Next update in" target={new Date(nextUpdateAt).toISOString()} variant="secondary" />}</>}</div>
    </header>
    <div className="admin-dashboard__meta"><span>{dashboard.entries.length} trains</span><span>{totalBets} 🎲</span><span>{dashboard.lastUpdatedAt ? `Updated ${new Date(dashboard.lastUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for live data"}</span>{dashboard.stale && <span className="admin-dashboard__stale">Live data may be stale</span>}</div>
    <RaceStage entries={stageEntries} final={finished} animationDurationMs={4_000} />
  </section>;
}

type RaceState = "CANCELLED · WINNER" | "OUT OF THE RACE";

function getRaceState(entry: LiveLeaderboardEntry): RaceState | null {
  if (entry.cancelled) return "CANCELLED · WINNER";
  if (entry.stale || entry.raceDelayMinutes === null || entry.raceDelayMinutes === undefined) return null;
  return null;
}

function raceStateVariant(state: RaceState) {
  if (state === "OUT OF THE RACE" || state === "CANCELLED · WINNER") return "red" as const;
  return "secondary" as const;
}

export function GameHeader({ eyebrow, title, description }: GameHeaderViewProps) {
  return <section className="hero">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></section>;
}

export function PlayerOnboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <dialog className="player-onboarding" open={open} aria-labelledby="player-onboarding-title">
    <section className="player-onboarding__panel">
      <p className="eyebrow">Welcome to the delay race</p>
      <h2 id="player-onboarding-title">Pick a train. Root for delays.</h2>
      <p>Make one prediction, then watch the timetable unravel.</p>
      <div className="player-onboarding__steps">
        <article><span aria-hidden="true">🚆</span><strong>Choose a train</strong><p>Browse the map and train cards to find your contender.</p></article>
        <article><span aria-hidden="true">🎲</span><strong>Place one bet</strong><p>Enter a nickname and back one train. Others can back it too.</p></article>
        <article><span aria-hidden="true">🏁</span><strong>Follow the race</strong><p>If your train gains the most delay, you win. Cancelled trains win immediately.</p></article>
      </div>
      <Notice className="player-onboarding__disclaimer"><strong>Alpha prototype:</strong> this experience is still being tested. Features can change or break, and live train data may be delayed, incomplete, or inaccurate. This is for entertainment—do not use it for real travel decisions. Bets close at 18:00.</Notice>
      <div className="player-onboarding__footer"><a href="https://docs.google.com/forms/d/1vHIjIAnIFgTSQVf4G7Ca2ZLHOULy-ygE-YgGNs34yXo/" target="_blank" rel="noreferrer">Give feedback</a><Button type="button" onClick={onClose}>Got it</Button></div>
    </section>
  </dialog>;
}

export function BrandHeader({ logoSrc }: BrandHeaderProps) {
  return <header className="brand-header"><img src={logoSrc} alt="" className="brand-header__logo" /><span className="brand-header__name">ChooChoo Delay Race</span></header>;
}

export function HomeView({ games, loading, error }: { games: ActiveGame[]; loading: boolean; error: string | null }) {
  return <>
    <section className="home-hero"><h1>Pick a train. Watch the race.</h1><p>ChooChoo Delay Race is a live multiplayer game: bet on a journey, follow its delay, and see who picked the train with the biggest delay at its final stop.</p></section>
    <section className="home-how" aria-labelledby="how-to-play-title"><h2 id="how-to-play-title">How to play</h2><div className="home-steps"><article><span>1</span><h3>Choose a train</h3><p>Browse the journeys and place one bet with your name.</p></article><article><span>2</span><h3>Follow the race</h3><p>Watch live updates, rank changes, stations, and delay trends.</p></article><article><span>3</span><h3>See the results</h3><p>When the game ends, the biggest final delay wins.</p></article></div></section>
    <section className="home-previews" aria-labelledby="game-views-title"><h2 id="game-views-title">Inside the game</h2><div className="home-preview-grid">
      <article className="home-preview"><h3>Bet</h3><div className="home-preview__sample"><strong>Choose your train</strong><div><span>🎭 RE3</span><em>→ Mainz</em><b>Pick</b></div><div><span>🦝 RE50</span><em>→ Frankfurt</em><b>Picked</b></div></div><p>Pick a journey before the race begins.</p></article>
      <article className="home-preview"><h3>Dashboard</h3><div className="home-preview__sample home-preview__dashboard"><strong>Live delay race</strong><div><span>🥇 RE4</span><i style={{ width: "78%" }} /></div><div><span>🥈 RE3</span><i style={{ width: "52%" }} /></div><div><span>🥉 RB26</span><i style={{ width: "31%" }} /></div></div><p>Follow every train and its delay trend.</p></article>
      <article className="home-preview"><h3>Leaderboard</h3><div className="home-preview__sample home-preview__leaderboard"><strong>Final standings</strong><div className="home-preview__podium"><div className="home-preview__podium-place home-preview__podium-place--2"><span>🎭 RE3</span><em>+12 min</em><b>2</b></div><div className="home-preview__podium-place home-preview__podium-place--1"><span>🚄 RE4</span><em>+18 min</em><b>1</b></div><div className="home-preview__podium-place home-preview__podium-place--3"><span>🦝 RB26</span><em>+7 min</em><b>3</b></div></div></div><p>See the winners and everyone who bet.</p></article>
    </div></section>
    <section className="card home-games" aria-labelledby="active-games-title"><h2 id="active-games-title">Active games</h2>
      {loading && <p role="status">Loading active games…</p>}
      {error && <p role="alert">Could not load active games.</p>}
      {!loading && !error && games.length === 0 && <p>No active games right now.</p>}
      {!loading && !error && games.length > 0 && <div className="home-games__list">{games.map((game) => <a className="home-game" href={`${import.meta.env.BASE_URL}game/${encodeURIComponent(game.id)}`} key={game.id}><strong>{game.name}</strong><span>{game.eventDate}{game.gameEndTime ? ` · Ends ${new Date(game.gameEndTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span><span>Open game →</span></a>)}</div>}
    </section>
  </>;
}

export function BetView({ journeys, selectedTrainId, username, betSubmitted, loading, error, usernameCheckLoading, usernameCheckError, onSelectTrain, onUsernameChange, onCheckUsername, onSubmit, cardsOnly = false, actionsOnly = false }: BetViewProps) {
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "center", containScroll: "trimSnaps", loop: false });
  const selectedIndex = journeys.findIndex((journey) => journey.id === selectedTrainId);
  const [activeIndex, setActiveIndex] = useState(() => selectedIndex >= 0 ? selectedIndex : 0);
  const selectedTrainIdRef = useRef(selectedTrainId);
  const onSelectTrainRef = useRef(onSelectTrain);
  const syncingFromSelectionRef = useRef(false);
  selectedTrainIdRef.current = selectedTrainId;
  onSelectTrainRef.current = onSelectTrain;

  useEffect(() => {
    if (!emblaApi) return;
    const updateActiveIndex = () => {
      const index = emblaApi.selectedScrollSnap();
      setActiveIndex(index);
      const journey = journeys[index];
      if (!syncingFromSelectionRef.current && journey && journey.id !== selectedTrainIdRef.current) onSelectTrainRef.current(journey.id);
    };
    emblaApi.on("select", updateActiveIndex);
    updateActiveIndex();
    return () => { emblaApi.off("select", updateActiveIndex); };
  }, [emblaApi, journeys]);

  useEffect(() => {
    if (!emblaApi || selectedIndex < 0 || selectedIndex === emblaApi.selectedScrollSnap()) return;
    syncingFromSelectionRef.current = true;
    const clearSync = () => { syncingFromSelectionRef.current = false; };
    emblaApi.on("settle", clearSync);
    emblaApi.scrollTo(selectedIndex);
    return () => {
      emblaApi.off("settle", clearSync);
      syncingFromSelectionRef.current = false;
    };
  }, [emblaApi, selectedIndex]);

  const scrollToIndex = (index: number) => {
    if (!emblaApi) return;
    emblaApi.scrollTo(Math.max(0, Math.min(index, journeys.length - 1)));
  };

  const cardScroller = <div className="bet-selection bet-selection--cards">
    <div className="bet-selection__heading">
      <h2>Choose your train</h2>
    </div>
    <div ref={emblaRef} className="bet-selection__viewport">
      <div className="journey-list bet-selection__list">
        {journeys.map((journey, index) => <JourneyCard key={journey.id} journey={journey} mode="public" selected={false} disabled={betSubmitted} showBettingInfo={false} className={index === activeIndex ? "bet-selection__card--active" : "bet-selection__card--peek"} onSelect={(selectedJourney) => { onSelectTrain(selectedJourney.id); scrollToIndex(index); }} />)}
      </div>
    </div>
    <div className="bet-selection__pagination" aria-live="polite">
      <div className="bet-selection__dots" aria-label={`Train ${activeIndex + 1} of ${journeys.length}`}>
        {journeys.map((journey, index) => <button key={journey.id} type="button" className={index === activeIndex ? "active" : ""} aria-label={`Go to train ${index + 1}`} aria-current={index === activeIndex ? "true" : undefined} onClick={() => scrollToIndex(index)} />)}
      </div>
      <span>{journeys.length ? `${activeIndex + 1} / ${journeys.length}` : "0 / 0"}</span>
    </div>
  </div>;
  const actions = <div className="bet-selection__actions-wrap">
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
          <Notice className="bet-rules">The train with the biggest actual delay at its final stop wins. A cancelled train wins immediately. If several trains are cancelled, they share the win.</Notice>
          <div className="bet-confirmation__actions">
            <BadgeButton type="button" className="bet-confirmation__back" onClick={() => setConfirmationOpen(false)} disabled={loading}>Go back</BadgeButton>
            <BadgeButton type="button" className="bet-confirmation__submit" onClick={() => onSubmit()} disabled={loading}>{loading ? "Submitting…" : "Confirm bet"}</BadgeButton>
          </div>
        </div>
      </dialog>}
  </div>;
  if (cardsOnly) return cardScroller;
  if (actionsOnly) return actions;
  return <>
    {betSubmitted && <p className="notice">Your bet is confirmed. Follow the live progress below.</p>}
    {!betSubmitted && <div className="bet-selection">{cardScroller}{actions}</div>}
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

export function LiveLeaderboardView({ entries, journeys, currentParticipantId, selectedTrainId, onSelectTrain, lastUpdatedAt, stale }: LiveLeaderboardViewProps) {
  const [detailTrainId, setDetailTrainId] = useState<string | null>(null);
  const prioritizedEntries = prioritizeCurrentBet(entries, currentParticipantId);
  const myTrainId = entries.find((entry) => entry.bettors.some((bettor) => bettor.participantId === currentParticipantId))?.trainId;
  const updatedMinutesAgo = getUpdatedMinutesAgo(lastUpdatedAt);
  const detailEntry = detailTrainId ? entries.find((entry) => entry.trainId === detailTrainId) : undefined;
  const detailJourney = detailEntry ? {
    ...(journeys.find((journey) => journey.id === detailEntry.trainId) ?? {}),
    id: detailEntry.trainId,
    externalTripId: detailEntry.trainId,
    displayName: detailEntry.displayName,
    origin: detailEntry.origin,
    destination: detailEntry.destination,
    scheduledDeparture: detailEntry.scheduledDeparture,
    scheduledArrival: detailEntry.scheduledArrival,
    durationSeconds: detailEntry.durationSeconds,
    stopCount: detailEntry.stopCount,
    actualArrival: detailEntry.actualArrival,
    raceDelayMinutes: detailEntry.raceDelayMinutes,
    finalDelayMinutes: detailEntry.finalDelayMinutes,
    departureDelayMinutes: detailEntry.departureDelayMinutes,
    status: detailEntry.cancelled ? "cancelled" : undefined,
    liveStatus: detailEntry.status,
    raceColor: detailEntry.raceColor,
  } as Journey : null;
  useEffect(() => {
    if (!detailTrainId) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDetailTrainId(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detailTrainId]);
  return <section className="progress-view" aria-label="Live progress">
    <section className="progress-race" aria-label="Live race">
      <div className="progress-meta ds-text-medium"><Notice>{stale ? "Live data is temporarily stale." : "Updates every minute."}</Notice>{updatedMinutesAgo !== null && <span>Last update — {updatedMinutesAgo === 0 ? "just now" : `${updatedMinutesAgo} min ago`}</span>}</div>
      {!prioritizedEntries.length ? <p>No bets yet.</p> : <div className="journey-list" aria-label="Live leaderboard">{prioritizedEntries.map((entry) => {
        const journey: Journey = { ...(journeys.find((candidate) => candidate.id === entry.trainId) ?? {}), id: entry.trainId, externalTripId: entry.trainId, displayName: entry.displayName, origin: entry.origin, destination: entry.destination, scheduledDeparture: entry.scheduledDeparture, scheduledArrival: entry.scheduledArrival, durationSeconds: entry.durationSeconds, stopCount: entry.stopCount, actualArrival: entry.actualArrival, raceDelayMinutes: entry.raceDelayMinutes, finalDelayMinutes: entry.finalDelayMinutes, departureDelayMinutes: entry.departureDelayMinutes, status: entry.cancelled ? "cancelled" : undefined, liveStatus: entry.status, raceColor: entry.raceColor } as Journey;
        return <JourneyCard key={entry.trainId} journey={journey} mode="leaderboard" position={entry.position} raceStatus={getRaceState(entry) ?? undefined} bettors={entry.bettors} currentParticipantId={currentParticipantId} selected={entry.trainId === selectedTrainId} onSelect={() => onSelectTrain(entry.trainId)} onTrainLabelClick={() => { onSelectTrain(entry.trainId); setDetailTrainId(entry.trainId); }} />;
      })}</div>}
    </section>
    {detailJourney && <dialog className="train-detail-dialog" open aria-labelledby="train-detail-title" onClick={(event) => { if (event.target === event.currentTarget) setDetailTrainId(null); }}>
      <section className="train-detail-dialog__panel">
        <header className="train-detail-dialog__header">
          <h2 id="train-detail-title">Train details</h2>
          <button type="button" className="train-detail-dialog__close" onClick={() => setDetailTrainId(null)} aria-label="Close train details">×</button>
        </header>
        <JourneyCard journey={detailJourney} mode="public" showBettingInfo={false} />
      </section>
    </dialog>}
  </section>;
}

export function LiveEventsView({ myTrainId, events, entries, journeys, onSelectTrain }: LiveEventsViewProps) {
  const [onlyMyTrain, setOnlyMyTrain] = useState(false);
  const [detailTrainId, setDetailTrainId] = useState<string | null>(null);
  const visibleEvents = onlyMyTrain ? events.filter((event) => event.trainId === myTrainId) : events;
  const detailEntry = detailTrainId ? entries.find((entry) => entry.trainId === detailTrainId) : undefined;
  const detailJourney = detailEntry ? {
    ...(journeys.find((journey) => journey.id === detailEntry.trainId) ?? {}),
    id: detailEntry.trainId,
    externalTripId: detailEntry.trainId,
    displayName: detailEntry.displayName,
    origin: detailEntry.origin,
    destination: detailEntry.destination,
    scheduledDeparture: detailEntry.scheduledDeparture,
    scheduledArrival: detailEntry.scheduledArrival,
    durationSeconds: detailEntry.durationSeconds,
    stopCount: detailEntry.stopCount,
    actualArrival: detailEntry.actualArrival,
    raceDelayMinutes: detailEntry.raceDelayMinutes,
    finalDelayMinutes: detailEntry.finalDelayMinutes,
    departureDelayMinutes: detailEntry.departureDelayMinutes,
    status: detailEntry.cancelled ? "cancelled" : undefined,
    liveStatus: detailEntry.status,
    raceColor: detailEntry.raceColor,
  } as Journey : null;
  return <section className="live-events live-events-view" aria-label="Events">
      <div className="live-events__heading"><h2>Events</h2><label className="live-events__filter"><input type="checkbox" checked={onlyMyTrain} onChange={(event) => setOnlyMyTrain(event.target.checked)} disabled={!myTrainId} /> Only my train</label></div>
      {!visibleEvents.length ? <p className="live-events__empty">{onlyMyTrain ? "No events for your train yet." : "No drama yet. The trains are behaving."}</p> : <div className="live-events__list">{visibleEvents.map((event) => {
        const selectable = Boolean(event.trainId);
        const selectEventTrain = () => { if (event.trainId) onSelectTrain(event.trainId); };
        const numericEvent = event.currentDelayMinutes !== undefined && event.currentDelayMinutes !== null;
        const currentDelay = numericEvent ? event.currentDelayMinutes : null;
        const change = event.changeMinutes ?? null;
        const changeLabel = change === null ? "—" : `${change > 0 ? "↑ " : change < 0 ? "↓ " : "— "}${Math.abs(change)}`;
        const trainEntry = event.trainId ? entries.find((entry) => entry.trainId === event.trainId) : undefined;
        return <article className={`live-event ${selectable ? "selectable" : ""}`.trim()} key={event.id} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} onClick={selectable ? selectEventTrain : undefined} onKeyDown={selectable ? (keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") { keyboardEvent.preventDefault(); selectEventTrain(); } } : undefined}>
        <div className="live-event__body">
          <div className="live-event__top">{event.trainId ? <TrainLabelButton label={event.displayName ?? event.title} gameName={journeys.find((journey) => journey.id === event.trainId)?.history?.lineGameName} trainId={event.trainId} raceColor={trainEntry?.raceColor} cancelled={trainEntry?.cancelled} onClick={() => { onSelectTrain(event.trainId!); setDetailTrainId(event.trainId!); }} /> : <strong className="live-event__title">{event.displayName ?? event.title}</strong>}<time dateTime={event.createdAt}>{eventAge(event.createdAt)}</time>{event.trainId === myTrainId && <Badge variant="blue" className="live-event__my-train">My</Badge>}</div>
          <div className="live-event__numbers">{numericEvent ? <strong className={`live-event__delay live-event__delay--${currentDelay! > 0 ? "late" : currentDelay! < 0 ? "early" : "on-time"}`}>{currentDelay! >= 0 ? "+" : "−"}{Math.abs(currentDelay!)} min</strong> : <strong className="live-event__delay">{event.title}</strong>}{numericEvent && <Badge variant="green" className="live-event__change">{changeLabel}</Badge>}</div>
          <p className="live-event__message">{numericEvent && event.message.startsWith("Delay ") ? event.title : event.message}</p>
        </div>
        {event.source === "motis" && <div className="live-event__badges"><Badge variant={eventVariant(event)}>MOTIS</Badge></div>}
      </article>})}</div>}
    {detailJourney && <dialog className="train-detail-dialog" open aria-labelledby="events-train-detail-title" onClick={(event) => { if (event.target === event.currentTarget) setDetailTrainId(null); }}>
      <section className="train-detail-dialog__panel">
        <header className="train-detail-dialog__header">
          <h2 id="events-train-detail-title">Train details</h2>
          <button type="button" className="train-detail-dialog__close" onClick={() => setDetailTrainId(null)} aria-label="Close train details">×</button>
        </header>
        <JourneyCard journey={detailJourney} mode="public" showBettingInfo={false} />
      </section>
    </dialog>}
  </section>;
}

export function RaceChartView({ entries, journeys, currentParticipantId, final = false, nextUpdateAt = null, updating = false, replayEntries, replayTimestamp, onSelectTrain, onOpenBets }: RaceChartViewProps) {
  const [detailTrainId, setDetailTrainId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const detailEntry = detailTrainId ? entries.find((entry) => entry.trainId === detailTrainId) : undefined;
  const detailJourney = detailEntry ? {
    ...(journeys.find((journey) => journey.id === detailEntry.trainId) ?? {}),
    id: detailEntry.trainId,
    externalTripId: detailEntry.trainId,
    displayName: detailEntry.displayName,
    origin: detailEntry.origin,
    destination: detailEntry.destination,
    scheduledDeparture: detailEntry.scheduledDeparture,
    scheduledArrival: detailEntry.scheduledArrival,
    durationSeconds: detailEntry.durationSeconds,
    stopCount: detailEntry.stopCount,
    actualArrival: detailEntry.actualArrival,
    raceDelayMinutes: detailEntry.raceDelayMinutes,
    finalDelayMinutes: detailEntry.finalDelayMinutes,
    departureDelayMinutes: detailEntry.departureDelayMinutes,
    status: detailEntry.cancelled ? "cancelled" : undefined,
    liveStatus: detailEntry.status,
    raceColor: detailEntry.raceColor,
  } as Journey : null;
  useEffect(() => {
    if (!detailTrainId) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDetailTrainId(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detailTrainId]);
  useEffect(() => {
    if (final || !nextUpdateAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [final, nextUpdateAt]);
  const visibleEntries = replayEntries ?? entries;
  const stageEntries = visibleEntries.map((entry) => ({
    trainId: entry.trainId,
    displayName: entry.displayName,
    scheduledDeparture: entry.scheduledDeparture,
    gameName: journeys.find((journey) => journey.id === entry.trainId)?.history?.lineGameName,
    scheduledArrival: entry.scheduledArrival,
    routeJson: entry.routeJson,
    stops: entry.stops,
    raceDelayMinutes: entry.raceDelayMinutes,
    finalDelayMinutes: entry.finalDelayMinutes,
    status: entry.status,
    cancelled: entry.cancelled,
    stale: entry.stale,
    raceColor: entry.raceColor,
    betCount: entry.bettors.length,
    isMine: entry.bettors.some((bettor) => bettor.participantId === currentParticipantId),
    delayHistory: entry.delayHistory,
    replayHistory: entry.replayHistory,
  }));
  const secondsUntilUpdate = nextUpdateAt ? Math.max(0, Math.ceil((nextUpdateAt - now) / 1_000)) : null;
  return <section className="race-chart-view" aria-label="Delay race">
    <header className="race-chart__header"><div><h2>The delay race</h2><p>Biggest actual delay at the final stop wins.</p></div>{!final && <Badge variant="secondary" className="race-chart__next-update" aria-label={updating ? "Updating live race data" : secondsUntilUpdate === null ? "Waiting for the next live race update" : `Next live race update in ${secondsUntilUpdate} seconds`}>{updating ? "Updating…" : secondsUntilUpdate === null ? "Waiting for update" : `Next update in ${secondsUntilUpdate}s`}</Badge>}</header>
    <RaceStage entries={stageEntries} final={final} referenceTime={replayTimestamp} animationDurationMs={replayEntries ? 800 : 4_000} showBetCount={false} className="race-stage--public" onSelectTrain={onSelectTrain} onOpenTrain={(trainId) => { onSelectTrain?.(trainId); setDetailTrainId(trainId); }} onOpenBets={onOpenBets} />
    {detailJourney && <dialog className="train-detail-dialog" open aria-labelledby="race-train-detail-title" onClick={(event) => { if (event.target === event.currentTarget) setDetailTrainId(null); }}>
      <section className="train-detail-dialog__panel">
        <header className="train-detail-dialog__header">
          <h2 id="race-train-detail-title">Train details</h2>
          <button type="button" className="train-detail-dialog__close" onClick={() => setDetailTrainId(null)} aria-label="Close train details">×</button>
        </header>
        <JourneyCard journey={detailJourney} mode="public" showBettingInfo={false} />
      </section>
    </dialog>}
  </section>;
}

export function LeaderboardView({ entries, journeys, currentParticipantId, selectedTrainId, onSelectTrain, lastUpdatedAt, stale, final = false, finalStatus, myUsername, myBetPlace, myBetWon, resultsView = false }: LeaderboardViewProps) {
  const [detailTrainId, setDetailTrainId] = useState<string | null>(null);
  const fireworksTriggered = useRef(false);
  const [fireworksVisible, setFireworksVisible] = useState(false);
  const finalEntries = final ? [...entries].sort((left, right) => {
    if (left.cancelled !== right.cancelled) return Number(right.cancelled) - Number(left.cancelled);
    const leftValid = !left.cancelled && left.finalDelayMinutes !== null;
    const rightValid = !right.cancelled && right.finalDelayMinutes !== null;
    if (leftValid !== rightValid) return Number(rightValid) - Number(leftValid);
    return (right.finalDelayMinutes ?? -Infinity) - (left.finalDelayMinutes ?? -Infinity);
  }).map((entry, index, sorted) => ({ ...entry, position: entry.cancelled ? 1 : entry.finalDelayMinutes !== null ? (index === 0 || entry.finalDelayMinutes !== sorted[index - 1].finalDelayMinutes ? index + 1 : sorted[index - 1].position) : null })) : entries;
  const prioritizedEntries = prioritizeCurrentBet(finalEntries, currentParticipantId);
  const currentBetEntry = finalEntries.find((entry) => entry.bettors.some((bettor) => bettor.participantId === currentParticipantId));
  const currentBetPlace = currentBetEntry?.position ?? myBetPlace;
  const updatedMinutesAgo = getUpdatedMinutesAgo(lastUpdatedAt);
  const podiumPlaces = resultsView ? [2, 1, 3].map((place) => ({ place, entries: finalEntries.filter((entry, index) => (entry.position ?? index + 1) === place) })).filter((podium) => podium.entries.length > 0) : [];
  useEffect(() => {
    if (!resultsView || currentBetPlace === null || currentBetPlace === undefined || currentBetPlace > 3 || fireworksTriggered.current) return;
    fireworksTriggered.current = true;
    setFireworksVisible(true);
    const timer = window.setTimeout(() => setFireworksVisible(false), 4_500);
    return () => window.clearTimeout(timer);
  }, [currentBetPlace, resultsView]);
  const detailEntry = detailTrainId ? entries.find((entry) => entry.trainId === detailTrainId) : undefined;
  const detailJourney = detailEntry ? {
    ...(journeys.find((journey) => journey.id === detailEntry.trainId) ?? {}),
    id: detailEntry.trainId,
    externalTripId: detailEntry.trainId,
    displayName: detailEntry.displayName,
    origin: detailEntry.origin,
    destination: detailEntry.destination,
    scheduledDeparture: detailEntry.scheduledDeparture,
    scheduledArrival: detailEntry.scheduledArrival,
    durationSeconds: detailEntry.durationSeconds,
    stopCount: detailEntry.stopCount,
    actualArrival: detailEntry.actualArrival,
    raceDelayMinutes: detailEntry.raceDelayMinutes,
    finalDelayMinutes: detailEntry.finalDelayMinutes,
    departureDelayMinutes: detailEntry.departureDelayMinutes,
    status: detailEntry.cancelled ? "cancelled" : undefined,
    liveStatus: detailEntry.status,
    raceColor: detailEntry.raceColor,
  } as Journey : null;
  useEffect(() => {
    if (!detailTrainId) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDetailTrainId(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detailTrainId]);
  return <section className={`leaderboard-view ${resultsView ? "leaderboard-view--results" : ""}`.trim()} aria-label="Leaderboard">
    <h2>{resultsView ? "Results" : final ? "Final standings" : "Who’s betting on each train?"}</h2>
    {resultsView && myUsername && <div className="results-my-bet">
      <Badge variant="blue">{myUsername}</Badge>
      <strong className="results-my-bet__status">{currentBetPlace ? `You took ${formatPlace(currentBetPlace)}` : final ? "You did not get a place" : "Your bet is waiting for results"}</strong>
      {currentBetEntry && (final ? currentBetEntry.finalDelayMinutes : currentBetEntry.raceDelayMinutes) !== null && <DelayBadge minutes={final ? currentBetEntry.finalDelayMinutes : currentBetEntry.raceDelayMinutes} />}
    </div>}
    {fireworksVisible && <div className="results-fireworks" aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <span className={index % 2 === 0 ? "from-left" : "from-right"} key={index}>✦</span>)}</div>}
    {final && finalStatus === "no_winner" && <Notice>No winner — no train had a final delay.</Notice>}
    <div className="progress-meta ds-text-medium"><Notice>{stale ? "Live data is temporarily stale." : "Updates every minute."}</Notice>{updatedMinutesAgo !== null && <span>Last update — {updatedMinutesAgo === 0 ? "just now" : `${updatedMinutesAgo} min ago`}</span>}</div>
    {resultsView && podiumPlaces.length > 0 && <>
      <div className="results-podium" aria-label="Top three results">{podiumPlaces.map(({ place, entries }) => {
      const podiumColors = entries.map((entry) => trainColor(entry.trainId, entry.raceColor));
      const bettors = [...new Map(entries.flatMap((entry) => entry.bettors).map((bettor) => [bettor.participantId, bettor])).values()];
      return <article className={`results-podium__place results-podium__place--${place}`} key={place}>
        <div className="results-podium__details">{entries.map((entry) => <div className="results-podium__train" key={entry.trainId}><TrainLabel label={entry.displayName} gameName={journeys.find((journey) => journey.id === entry.trainId)?.history?.lineGameName} trainId={entry.trainId} raceColor={entry.raceColor} size="compact" />{(final ? entry.finalDelayMinutes : entry.raceDelayMinutes) !== null && (final ? entry.finalDelayMinutes : entry.raceDelayMinutes) !== undefined && <DelayBadge minutes={final ? entry.finalDelayMinutes : entry.raceDelayMinutes} />}</div>)}</div>
        <div className="results-podium__block" style={{ background: podiumColors.length === 1 ? podiumColors[0] : `linear-gradient(90deg, ${podiumColors.join(", ")})` }}><span>{place}</span></div>
        <div className="results-podium__bettors">{bettors.map((bettor) => <span className={bettor.participantId === currentParticipantId ? "is-current" : ""} key={bettor.participantId}>{bettor.username}</span>)}</div>
      </article>;
      })}</div>
    </>}
    {!prioritizedEntries.length ? <p>No bets yet.</p> : !resultsView && <div className="leaderboard-list">{prioritizedEntries.map((entry) => {
      const delayMinutes = final ? entry.finalDelayMinutes : entry.raceDelayMinutes;
      const raceState = getRaceState(entry);
      const selected = entry.trainId === selectedTrainId;
      return <article className={`leaderboard-row ${selected ? "selected" : ""}`} key={entry.trainId} role="button" tabIndex={0} onClick={() => onSelectTrain(entry.trainId)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectTrain(entry.trainId); } }}>
        <div className="leaderboard-row__top">
          <Badge variant="clear" className="journey-card__rank-badge">{entry.position === 1 ? "🥇" : entry.position === 2 ? "🥈" : entry.position === 3 ? "🥉" : entry.position ? `${entry.position}${entry.position % 100 >= 11 && entry.position % 100 <= 13 ? "th" : entry.position % 10 === 1 ? "st" : entry.position % 10 === 2 ? "nd" : entry.position % 10 === 3 ? "rd" : "th"} place` : "Waiting"}</Badge>
          {raceState && <Badge variant={raceStateVariant(raceState)}>{raceState}</Badge>}
          <span onClick={(event) => event.stopPropagation()}><Badge variant="secondary" className="leaderboard-row__bet-count">{entry.bettors.length} 🎲</Badge></span>
          <TrainLabelButton label={entry.displayName} gameName={journeys.find((journey) => journey.id === entry.trainId)?.history?.lineGameName} trainId={entry.trainId} raceColor={entry.raceColor} cancelled={entry.cancelled} onClick={() => { onSelectTrain(entry.trainId); setDetailTrainId(entry.trainId); }} />
          {delayMinutes !== null && delayMinutes !== undefined && <DelayBadge minutes={delayMinutes} />}
        </div>
        <span className="leaderboard-row__route">{entry.origin} → {entry.destination}</span>
        {entry.bettors.length > 0
          ? <div className="leaderboard-row__bettors">{entry.bettors.map((bettor) => bettor.participantId === currentParticipantId
            ? <Badge key={bettor.participantId} variant="blue" className="ds-text-medium">YOU · {bettor.username}</Badge>
            : <Badge key={bettor.participantId} variant="secondary" className="ds-text-medium">{bettor.username}</Badge>)}</div>
          : <span className="leaderboard-row__empty">No bettors yet</span>}
      </article>;
    })}</div>}
    {detailJourney && <dialog className="train-detail-dialog" open aria-labelledby="leaderboard-train-detail-title" onClick={(event) => { if (event.target === event.currentTarget) setDetailTrainId(null); }}>
      <section className="train-detail-dialog__panel">
        <header className="train-detail-dialog__header">
          <h2 id="leaderboard-train-detail-title">Train details</h2>
          <button type="button" className="train-detail-dialog__close" onClick={() => setDetailTrainId(null)} aria-label="Close train details">×</button>
        </header>
        <JourneyCard journey={detailJourney} mode="public" showBettingInfo={false} />
      </section>
    </dialog>}
  </section>;
}

export function ResultsView({ status, final, winners, myUsername, myTrainName, myTrainDelayMinutes, myBetPlace, myBetWon }: ResultsViewProps) {
  const placeBadge = (index: number) => <Badge variant="clear" className="journey-card__rank-badge">{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : formatPlace(index + 1)}</Badge>;
  return <section aria-label="Final results">
    <h2>Results</h2>
    {!final || status === "pending" ? <Notice>Waiting for all trains to reach their final station.</Notice>
      : status === "no_winner" ? <Notice>No winner — no train had a final delay.</Notice>
        : <div className="winner-result">
          <div className="results-my-bet">
            <Badge variant="blue">{myUsername}</Badge>
            <strong className="results-my-bet__status">{myBetPlace ? `${myBetWon ? "You got" : "You did not win — you got"} ${formatPlace(myBetPlace)}` : "You did not win"}</strong>
          </div>
          <div className="results-winner-list">{winners.map((winner, index) => <article className="results-winner-cell" key={`${winner.username}-${index}`}>
            <div className="results-winner-cell__top">{winner.position ? <Badge variant="clear" className="journey-card__rank-badge">{winner.position === 1 ? "🥇" : winner.position === 2 ? "🥈" : winner.position === 3 ? "🥉" : formatPlace(winner.position)}</Badge> : placeBadge(index)}</div>
            <div className="results-winner-cell__bottom"><span style={{ color: trainColor(winner.trainId ?? winner.trainName ?? winner.username, winner.raceColor) }}>{winner.outcome === "cancellation" ? "❌ Cancelled winner" : `+${Math.round(winner.delaySeconds / 60)} min`}</span><span style={{ color: trainColor(winner.trainId ?? winner.trainName ?? winner.username, winner.raceColor) }}>{winner.trainName ?? "Train"}</span></div>
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

export function AdminGameListView({ games, loading, error, message, onDelete, onContinue, onDashboard, onPopulateBets }: AdminGameListViewProps) {
  return <>
    <h2>Games</h2>
    {error && <p className="error" role="alert">{error}</p>}
    {games.length === 0 ? <p>No games created yet.</p> : <div className="journey-list">
      {games.map((game) => <article className="journey-card" key={game.id}>
        <strong>{game.name}</strong>
        <span>{game.eventDate} · {game.status}</span>
        <span>{game.bettingStart ? `${new Date(game.bettingStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${game.bettingEnd ? new Date(game.bettingEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}` : ""}</span>
        <div className="admin-game-actions"><a href={publicGamePath(game.id)} target="_blank" rel="noreferrer">Open public game</a>{game.status === "draft" && <Button type="button" variant="secondary" disabled={loading} onClick={() => onContinue(game)}>Continue</Button>}{game.status === "active" && <Button type="button" variant="secondary" disabled={loading} onClick={() => { if (window.confirm("Populate every included train with one demo bet?")) onPopulateBets(game); }}>{loading ? "Populating…" : "Populate all trains with demo bets"}</Button>}{(game.status === "active" || game.status === "finished") && <Button type="button" variant="secondary" onClick={() => onDashboard(game)}>Dashboard</Button>}</div>
        <Button type="button" variant="secondary" onClick={() => onDelete(game)}>Delete game</Button>
      </article>)}
    </div>}{message && <p className="field-help" role="status">{message}</p>}
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

export function AdminReviewView({ game, journeys, minimumDuration, minimumStars, maximumStars, minimumDelayMinutes, maximumDelayMinutes, onlyJourneysWithGameName, selectedJourneyIds, disruptionsJson, constructionJson, footballJson, skippedDisruptions, disruptionMessage, loading, whitelistSaved, error, onDisruptionsJsonChange, onConstructionJsonChange, onFootballJsonChange, onApplyDisruptions, onFetch, onMinimumDurationChange, onMinimumStarsChange, onMaximumStarsChange, onMinimumDelayMinutesChange, onMaximumDelayMinutesChange, onOnlyJourneysWithGameNameChange, onToggleJourney, onSave, onActivate }: AdminReviewViewProps) {
  const [journeySearch, setJourneySearch] = useState("");
  const minimumStarValue = Number(minimumStars);
  const maximumStarValue = Number(maximumStars);
  const minimumDelayValue = Number(minimumDelayMinutes);
  const maximumDelayValue = Number(maximumDelayMinutes);
  const validStarRange = minimumStarValue >= 0 && maximumStarValue <= 25 && minimumStarValue <= maximumStarValue;
  const validDelayRange = minimumDelayValue >= 0 && maximumDelayValue <= 60 && minimumDelayValue <= maximumDelayValue;
  const baseJourneys = journeys.filter((journey) => {
    if (journey.durationSeconds < Number(minimumDuration) * 3600) return false;
    if (onlyJourneysWithGameName && !journey.history?.lineGameName?.trim()) return false;
    const averageDelay = journey.history?.averageDelayMinutes;
    return typeof averageDelay === "number" && Number.isFinite(averageDelay)
      && averageDelay >= minimumDelayValue && averageDelay <= maximumDelayValue;
  });
  const ratedHistories = applyHistoryRatings(baseJourneys.map((journey) => journey.history ?? null), baseJourneys.map((journey) => journey.durationSeconds));
  const visibleJourneys = baseJourneys.flatMap((journey, index) => {
    const ratedHistory = ratedHistories[index];
    if (!ratedHistory) return [];
    const recalculatedRatings = [ratedHistory.delayStars, ratedHistory.durationStars, ratedHistory.chaosStars, ratedHistory.disasterStars, ratedHistory.cancellationStars];
    if (!recalculatedRatings.every((rating): rating is number => typeof rating === "number" && Number.isFinite(rating))) return [];
    const totalStars = recalculatedRatings.reduce((total, rating) => total + rating, 0);
    if (!validStarRange || !validDelayRange || totalStars < minimumStarValue || totalStars > maximumStarValue) return [];
    return [{ ...journey, history: ratedHistory }];
  });
  const normalizedJourneySearch = journeySearch.trim().toLocaleLowerCase();
  const selectedFetchedJourneys = journeys.filter((journey) => selectedJourneyIds.includes(journey.externalTripId));
  const fetchedJourneyCandidates = journeys
    .filter((journey) => !normalizedJourneySearch || [journey.displayName, journey.lineName, journey.trainNumber, journey.origin, journey.destination]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalizedJourneySearch)))
    .filter((journey) => !selectedJourneyIds.includes(journey.externalTripId))
    .sort((left, right) => {
      const displayNameComparison = left.displayName.localeCompare(right.displayName, undefined, { numeric: true, sensitivity: "base" });
      return displayNameComparison || left.externalTripId.localeCompare(right.externalTripId);
    });
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
      <div className="admin-star-filter">
        <label className="checkbox-field"><input type="checkbox" checked={onlyJourneysWithGameName} onChange={(event) => onOnlyJourneysWithGameNameChange(event.target.checked)} /> Only journeys with game name</label>
        <label className="field-label" htmlFor="minimum-stars">RPG star range <output>{minimumStars}–{maximumStars} / 25</output></label>
        <div className="admin-star-filter__range">
          <input id="minimum-stars" className="admin-star-filter__range-min" aria-label="Minimum RPG stars" type="range" min="0" max="25" step="1" value={minimumStars} onChange={(event) => onMinimumStarsChange(event.target.value)} />
          <input id="maximum-stars" className="admin-star-filter__range-max" aria-label="Maximum RPG stars" type="range" min="0" max="25" step="1" value={maximumStars} onChange={(event) => onMaximumStarsChange(event.target.value)} />
        </div>
        <label className="field-label" htmlFor="minimum-delay-minutes">Delay range <output>{minimumDelayMinutes}–{maximumDelayMinutes} min</output></label>
        <div className="admin-star-filter__range">
          <input id="minimum-delay-minutes" className="admin-star-filter__range-min" aria-label="Minimum average delay in minutes" type="range" min="0" max="60" step="1" value={minimumDelayMinutes} onChange={(event) => onMinimumDelayMinutesChange(event.target.value)} />
          <input id="maximum-delay-minutes" className="admin-star-filter__range-max" aria-label="Maximum average delay in minutes" type="range" min="0" max="60" step="1" value={maximumDelayMinutes} onChange={(event) => onMaximumDelayMinutesChange(event.target.value)} />
        </div>
      </div>
      <section className="admin-whitelist-picker" aria-label="All fetched trains">
        <h3>Include any fetched train</h3>
        <p className="field-help">Search fetched trains, including candidates outside the filters above.</p>
        <label className="field-label" htmlFor="fetched-train-search">Search candidates</label>
        <input id="fetched-train-search" type="search" value={journeySearch} onChange={(event) => setJourneySearch(event.target.value)} placeholder="Line, train number, origin, or destination" />
        {normalizedJourneySearch && <div className="admin-whitelist-picker__dropdown" role="listbox" aria-label="Fetched train candidates">
          {fetchedJourneyCandidates.length === 0 ? <p className="field-help">No candidates found.</p> : fetchedJourneyCandidates.map((journey) => {
            const label = journey.trainNumber && !journey.displayName.includes(journey.trainNumber) ? `${journey.displayName} (${journey.trainNumber})` : journey.displayName;
            return <button key={journey.externalTripId} type="button" className="admin-whitelist-picker__item" aria-label={`Include ${label}`} onClick={() => { onToggleJourney(journey.externalTripId); setJourneySearch(""); }}>
              <TrainLabel label={label} gameName={journey.history?.lineGameName} trainId={journey.id} raceColor={journey.raceColor} size="compact" cancelled={journey.status === "cancelled"} />
            </button>;
          })}
        </div>}
        <div className="admin-whitelist-picker__selected" aria-label="Selected trains">
          <span className="field-label">Selected trains</span>
          {selectedFetchedJourneys.length === 0 ? <p className="field-help">No trains selected.</p> : <div className="admin-whitelist-picker__list">
            {selectedFetchedJourneys.map((journey) => {
              const label = journey.trainNumber && !journey.displayName.includes(journey.trainNumber) ? `${journey.displayName} (${journey.trainNumber})` : journey.displayName;
              return <button key={journey.externalTripId} type="button" className="admin-whitelist-picker__item selected" aria-label={`Remove ${label}`} aria-pressed="true" onClick={() => onToggleJourney(journey.externalTripId)}>
                <TrainLabel label={label} gameName={journey.history?.lineGameName} trainId={journey.id} raceColor={journey.raceColor} size="compact" cancelled={journey.status === "cancelled"} />
              </button>;
            })}
          </div>}
        </div>
      </section>
      {(!validStarRange || !validDelayRange) && <p className="error" role="alert">Filter ranges must have valid minimum and maximum values.</p>}
      <p className="field-help">Showing {visibleJourneys.length} of {journeys.length} candidates with complete RPG ratings.</p>
      <div className="journey-list" aria-label="Candidate journeys">{visibleJourneys.map((journey) => <JourneyCard key={journey.externalTripId} journey={journey} mode="admin" selected={selectedJourneyIds.includes(journey.externalTripId)} onToggle={(selectedJourney) => onToggleJourney(selectedJourney.externalTripId)} />)}</div>
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
  return <section aria-label="Active game"><h2>{game.name}</h2><StatusBadge variant="success">Active</StatusBadge><p>Game is live and the journey whitelist is locked.</p><a href={publicGamePath(game.id)} target="_blank" rel="noreferrer">Open public game</a></section>;
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
    map.setZoom(Math.min(map.getZoom() + mapZoomBoost, 18), { animate: false });
  }, [map, boundsKey]);
  return null;
}

function MapSelectedLineHandler({ points, selectedTrainId }: { points: Array<{ lat: number; lon: number }>; selectedTrainId: string | null }) {
  const map = useMap();
  const pointsKey = points.map((point) => `${point.lat},${point.lon}`).join(";");
  useEffect(() => {
    if (!selectedTrainId || !points.length) return;
    const bounds = new LatLngBounds(points.map((point) => [point.lat, point.lon] as [number, number]));
    map.flyToBounds(bounds, { padding: [48, 48], maxZoom: 10, duration: 0.8, easeLinearity: 0.25 });
  }, [map, pointsKey, selectedTrainId]);
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

function MapSelectedTrainPanes() {
  const map = useMap();
  const selectedLinePane = map.getPane("selectedTrainPane") ?? map.createPane("selectedTrainPane");
  const selectedMarkerPane = map.getPane("selectedTrainMarkerPane") ?? map.createPane("selectedTrainMarkerPane");
  selectedLinePane.style.zIndex = "650";
  selectedMarkerPane.style.zIndex = "710";
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
    const symbol = events.length > 1 ? events.length : category === "construction" ? "🚧" : category === "football" ? "⚽" : "⚠️";
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
    let endpoints: Array<{ lat: number; lon: number }> = [];
    const endpointJson = live?.routeJson ?? journey.routeJson;
    try {
      const parsed = JSON.parse(endpointJson ?? "[]") as unknown;
      endpoints = Array.isArray(parsed)
        ? parsed.filter((point): point is { lat: number; lon: number } => Boolean(point && typeof point === "object" && typeof (point as { lat?: unknown }).lat === "number" && typeof (point as { lon?: unknown }).lon === "number"))
        : [];
    } catch { /* ignore malformed endpoints */ }
    if (endpoints.length < 2 && live?.routeJson && live.routeJson !== journey.routeJson) {
      try {
        const parsed = JSON.parse(journey.routeJson ?? "[]") as unknown;
        endpoints = Array.isArray(parsed)
          ? parsed.filter((point): point is { lat: number; lon: number } => Boolean(point && typeof point === "object" && typeof (point as { lat?: unknown }).lat === "number" && typeof (point as { lon?: unknown }).lon === "number"))
          : [];
      } catch { /* ignore malformed fallback endpoints */ }
    }
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

  return <MapContainer className="train-map" center={center} zoom={8} zoomSnap={0.1} zoomDelta={0.1} scrollWheelZoom={false}>
    <MapResizeHandler />
    <MapSelectedTrainPanes />
    <MapFitTrips points={allPoints} />
    <MapSelectedLineHandler points={selectedRoute?.points ?? []} selectedTrainId={selectedTrainId} />
    <MapEventLayer mapEvents={mapEvents} />
    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <div className="train-map__legend" aria-label="Map legend">
      <span><i className="train-map__legend-swatch train-map__legend-swatch--route" />Route</span>
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
      const identityColor = trainColor(journey.id, journey.raceColor);
      const actualArrival = live?.actualArrival ?? journey.actualArrival ?? null;
      const raceDelayMinutes = live?.raceDelayMinutes ?? journey.raceDelayMinutes ?? null;
      const cancelled = live?.cancelled ?? journey.liveStatus === "cancelled";
      const finished = live?.status === "arrived" || journey.liveStatus === "arrived";
      const lineColor = identityColor;
      const markerColor = identityColor;
      const markerPoint = trainPosition(journey, points, live);
      const markerIndex = points.indexOf(markerPoint ?? points[0]);
      const markerDirection = directionAngle(points, markerIndex);
      const lineName = journey.lineName ?? journey.displayName.match(/^([^\s(]+(?:\s*\d+[A-Z]?))/i)?.[1] ?? journey.displayName;
      const gameEmoji = gameNameEmoji(journey.history?.lineGameName);
      const safeDisplayName = `${gameEmoji ? `${gameEmoji} ` : ""}${lineName}`.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
      const trainIcon = new DivIcon({ className: "train-map__marker-icon", html: `<span class="train-map__marker-label ds-train-label ds-train-label--compact ${cancelled ? "is-cancelled" : ""}" style="--train-marker-color:${markerColor}">${gameEmoji ?? "🚆"}</span><span class="train-map__marker" aria-label="${cancelled ? "Train cancelled" : finished ? "Train finished" : "Train direction"}" style="--train-marker-color:${markerColor};--train-marker-angle:${markerDirection}deg"><span class="train-map__marker-arrow" aria-hidden="true">${cancelled ? "×" : finished ? "✓" : "➜"}</span></span>`, iconSize: [24, 42], iconAnchor: [12, 12] });
      return <Fragment key={journey.id}>
        <Polyline pane={selected ? "selectedTrainPane" : "overlayPane"} positions={positions} pathOptions={{ color: lineColor, weight: selected || isMine || isLeading ? 6 : 3, opacity: selected || isMine || isLeading ? 1 : 0.85, dashArray: cancelled ? "8 8" : undefined }} eventHandlers={{ click: (event) => { event.target.bringToFront(); onSelect(journey.id); } }}>
          <Popup>{journey.displayName}: {journey.origin} → {journey.destination}</Popup>
        </Polyline>
        {endpoints.map((point, index) => <CircleMarker key={`${journey.id}-${index === 0 ? "origin" : "arrival"}`} center={[point.lat, point.lon]} radius={index === 0 ? 4 : 5} pathOptions={{ color: lineColor, fillColor: lineColor, fillOpacity: 1, weight: 2 }}><Popup>{index === 0 ? `Departure: ${journey.origin}` : `Arrival: ${journey.destination}`}</Popup></CircleMarker>)}
        {markerPoint && <Marker pane={selected ? "selectedTrainMarkerPane" : "markerPane"} position={[markerPoint.lat, markerPoint.lon]} icon={trainIcon} zIndexOffset={selected ? 1000 : isMine || isLeading ? 500 : 0} eventHandlers={{ click: () => onSelect(journey.id) }}><Popup><strong>{journey.displayName}</strong><br />{cancelled ? "Cancelled — winner" : raceDelayMinutes === null || raceDelayMinutes === undefined ? "Delay unavailable" : `${raceDelayMinutes >= 0 ? "+" : "−"}${Math.abs(raceDelayMinutes)} min delay gained`}</Popup></Marker>}
      </Fragment>;
    })}
  </MapContainer>;
}
