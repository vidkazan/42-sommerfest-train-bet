import { useState, type ReactNode } from "react";
import type { Journey } from "../api/client";
import { Badge } from "./components";
import { JourneyHeaderView } from "./JourneyHeaderView";
import { journeyToLeg } from "./journeyToLeg";
import { TrainLabel } from "./TrainLabel";

export type JourneyCardMode = "public" | "admin" | "leaderboard";
export type JourneyCardBettor = { participantId: string; username: string };
export type JourneyCardProps = {
  journey: Journey;
  mode?: JourneyCardMode;
  selected?: boolean;
  disabled?: boolean;
  showCheckbox?: boolean;
  actionLabel?: string;
  position?: number | null;
  bettors?: JourneyCardBettor[];
  currentParticipantId?: string | null;
  raceStatus?: string;
  onSelect?: (journey: Journey) => void;
  onToggle?: (journey: Journey) => void;
  className?: string;
  showBettingInfo?: boolean;
};

export function journeyStatus(journey: Journey) {
  if (journey.liveStatus === "cancelled" || journey.status === "cancelled") return { label: "Cancelled", variant: "danger" as const, blocked: true };
  if (journey.status === "excluded") return { label: `Excluded: ${journey.exclusionReason ?? "rule mismatch"}`, variant: "muted" as const, blocked: true };
  if (journey.raceDelayMinutes !== null && journey.raceDelayMinutes !== undefined) {
    const minutes = Math.abs(journey.raceDelayMinutes);
    if (journey.raceDelayMinutes > 0) return { label: `+${minutes} min delay`, variant: "danger" as const, blocked: false };
    if (journey.raceDelayMinutes < 0) return { label: `−${minutes} min early`, variant: "neutral" as const, blocked: false };
    return { label: "On time", variant: "success" as const, blocked: false };
  }
  if (journey.liveStatus === "waiting" || journey.liveStatus === "waiting_for_departure") return { label: "Waiting for departure", variant: "neutral" as const, blocked: false };
  if (journey.liveStatus === "stale") return { label: "Live data stale", variant: "muted" as const, blocked: false };
  if (journey.liveStatus === "arrived") return { label: journey.actualArrival ? `Arrived ${new Date(journey.actualArrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Arrived", variant: "success" as const, blocked: false };
  if (journey.liveStatus === "in_progress") return { label: "In transit", variant: "neutral" as const, blocked: false };
  return null;
}

function formatDepartureInfo(journey: Journey) {
  if (journey.liveStatus === "cancelled" || journey.status === "cancelled") return { label: "Cancelled", variant: "red" as const };
  if (journey.departureDelayMinutes !== null && journey.departureDelayMinutes !== undefined) {
    const minutes = Math.abs(journey.departureDelayMinutes);
    if (journey.departureDelayMinutes > 0) return { label: `Currently +${minutes} min late`, variant: "red" as const };
    if (journey.departureDelayMinutes < 0) return { label: `Currently ${minutes} min early`, variant: "secondary" as const };
    return null;
  }
  return null;
}

function formatPlace(position: number | null | undefined) {
  if (!position) return "Waiting";
  const suffix = position % 100 >= 11 && position % 100 <= 13 ? "th" : position % 10 === 1 ? "st" : position % 10 === 2 ? "nd" : position % 10 === 3 ? "rd" : "th";
  return `${position}${suffix} place`;
}

function InfoBadge({ children, description, variant, open, onToggle }: { children: ReactNode; description: string; variant: "red" | "green" | "orange" | "construction"; open: boolean; onToggle: (description: string) => void }) {
  return <span className="journey-card__info-badge">
    <Badge className="journey-card__event-badge" variant={variant} onClick={(event) => { event.stopPropagation(); onToggle(description); }} aria-expanded={open}>{children}</Badge>
  </span>;
}

function ratingStars(value: number | null | undefined) {
  if (value === null || value === undefined) return <span className="rpg-train-card__stars--empty">—</span>;
  return <span className="rpg-train-card__stars" aria-label={`${value} of 5 stars`}>
    <span className="rpg-train-card__stars-filled">{"★".repeat(value)}</span>
    <span className="rpg-train-card__stars-empty">{"☆".repeat(5 - value)}</span>
  </span>;
}

export function JourneyCard({ journey, mode = "public", selected = false, disabled = false, position, raceStatus, bettors = [], currentParticipantId, onSelect, onToggle, className = "", showBettingInfo = true }: JourneyCardProps) {
  const leg = journeyToLeg(journey);
  const status = journeyStatus(journey);
  const isDisabled = disabled || (mode === "admin" && status?.blocked === true);
  const isCurrentUser = bettors.some((bettor) => bettor.participantId === currentParticipantId);
  const rankLabel = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : formatPlace(position);
  const delayBadge = journey.raceDelayMinutes !== null && journey.raceDelayMinutes !== undefined && journey.raceDelayMinutes >= 0
    ? `+${journey.raceDelayMinutes} min`
    : null;
  const selectable = (mode === "public" || mode === "leaderboard" || mode === "admin") && Boolean(onSelect || onToggle) && !isDisabled;
  const selectJourney = () => mode === "admin" ? onToggle?.(journey) : onSelect?.(journey);
  const departureInfo = formatDepartureInfo(journey);
  const bettingInfo = departureInfo;
  const onTimePercentage = journey.history?.reliabilityPercentage ?? null;
  const averageDelay = journey.history ? `${journey.history.delay.averageMinutes >= 0 ? "+" : "−"}${Math.abs(journey.history.delay.averageMinutes).toFixed(1)}m` : null;
  const [activeBadgeDescription, setActiveBadgeDescription] = useState<string | null>(null);
  const toggleBadgeDescription = (description: string) => setActiveBadgeDescription((current) => current === description ? null : description);
  const gameName = journey.history?.lineGameName ?? `${leg.lineName ?? "Train"} Express`;
  const gameDescription = journey.history?.lineGameDescription;
  return <article data-journey-id={journey.id} className={`journey-card ds-journey-card ds-journey-cell ds-journey-card--${mode} ${selected ? "selected" : ""} ${isDisabled ? "disabled" : ""} ${selectable ? "selectable" : ""} ${className}`.trim()} aria-disabled={isDisabled || undefined} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} onClick={selectable ? selectJourney : undefined} onKeyDown={selectable ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectJourney(); } } : undefined}>
    {mode === "leaderboard" && <div className="ds-journey-card__leaderboard-top">
      <div className="ds-journey-card__labels">
        <strong className="ds-journey-card__position"><Badge variant="clear" className="journey-card__rank-badge">{rankLabel}</Badge></strong>
        <TrainLabel label={leg.lineName} trainId={journey.id} raceColor={journey.raceColor} size="large" cancelled={leg.cancelled} />
        {isCurrentUser && <Badge variant="blue">My train</Badge>}
        {raceStatus && <Badge variant={raceStatus.includes("CANCELLED") || raceStatus === "OUT OF THE RACE" ? "red" : "secondary"}>{raceStatus}</Badge>}
        {journey.liveStatus === "arrived" && <Badge variant="green">Arrived</Badge>}
      </div>
      {delayBadge && <Badge variant="clear" className="journey-card__delay-badge">{delayBadge}</Badge>}
    </div>}
    {mode !== "leaderboard" && <div className="ds-journey-cell__line">
      <TrainLabel label={leg.lineName} trainId={journey.id} raceColor={journey.raceColor} size="regular" cancelled={leg.cancelled} />
    </div>}
    {(mode === "public" || mode === "admin") && <section className="rpg-train-card" aria-label="Train characteristics">
      <div className="rpg-train-card__identity"><span className="rpg-train-card__emoji" aria-hidden="true">🚆</span><strong>{gameName}</strong><span>{leg.lineName ?? journey.displayName}</span>{gameDescription && <p className="rpg-train-card__description">{gameDescription}</p>}</div>
      <div className="rpg-train-card__specs">
        <div><span>⏱ DELAY <button type="button" className="rpg-train-card__info" aria-label="Explain delay rating" aria-expanded={activeBadgeDescription === "Delay rating"} onClick={(event) => { event.stopPropagation(); toggleBadgeDescription("Delay rating"); }}>ⓘ</button></span><strong>{ratingStars(journey.history?.delayStars)}</strong></div>
        <div><span>🎲 CHAOS <button type="button" className="rpg-train-card__info" aria-label="Explain chaos rating" aria-expanded={activeBadgeDescription === "Chaos rating"} onClick={(event) => { event.stopPropagation(); toggleBadgeDescription("Chaos rating"); }}>ⓘ</button></span><strong>{ratingStars(journey.history?.chaosStars)}</strong></div>
        <div><span>💥 DISASTER <button type="button" className="rpg-train-card__info" aria-label="Explain disaster rating" aria-expanded={activeBadgeDescription === "Disaster rating"} onClick={(event) => { event.stopPropagation(); toggleBadgeDescription("Disaster rating"); }}>ⓘ</button></span><strong>{ratingStars(journey.history?.disasterStars)}</strong></div>
        <div><span>❌ CANCELLATION <button type="button" className="rpg-train-card__info" aria-label="Explain cancellation rating" aria-expanded={activeBadgeDescription === "Cancellation rating"} onClick={(event) => { event.stopPropagation(); toggleBadgeDescription("Cancellation rating"); }}>ⓘ</button></span><strong>{ratingStars(journey.history?.cancellationStars)}</strong></div>
      </div>
      {activeBadgeDescription === "Delay rating" && <p className="rpg-train-card__spec-description">Relative rating of typical average delay. More delay than the other selected trains means more stars.</p>}
      {activeBadgeDescription === "Chaos rating" && <p className="rpg-train-card__spec-description">Relative rating of delay spread: the difference between the 90th and 50th percentile delays. A wider spread means less predictable delays.</p>}
      {activeBadgeDescription === "Disaster rating" && <p className="rpg-train-card__spec-description">Relative severe-delay risk based on 30+ minute and 60+ minute delays. It is a rating, not a probability.</p>}
      {activeBadgeDescription === "Cancellation rating" && <p className="rpg-train-card__spec-description">Relative cancellation risk based on the historical cancellation rate. More cancellations than the other selected trains means more stars.</p>}
      {journey.history && <div className="rpg-train-card__metrics">
        <span>⏱ Typical delay <b>{journey.history.averageDelayMinutes === null ? "—" : `${journey.history.averageDelayMinutes >= 0 ? "+" : "−"}${Math.abs(journey.history.averageDelayMinutes).toFixed(1)} min`}</b></span>
        <span>💥 30+ min chance <b>{journey.history.disaster30Percentage === null ? "—" : `${journey.history.disaster30Percentage}%`}</b></span>
        <span>☄️ 60+ min chance <b>{journey.history.disaster60Percentage === null ? "—" : `${journey.history.disaster60Percentage}%`}</b></span>
        <span>❌ Cancellation <b>{journey.history.cancellationRatePercentage === null ? "—" : `${journey.history.cancellationRatePercentage}%`}</b></span>
      </div>}
      {(journey.eventCounts?.construction || journey.eventCounts?.disruption || journey.eventCounts?.football) ? <div className="rpg-train-card__events"><span>🚧 {journey.eventCounts?.construction ?? 0}</span><span>⚠️ {journey.eventCounts?.disruption ?? 0}</span><span>⚽ {journey.eventCounts?.football ?? 0}</span></div> : null}
    </section>}
    <div className="ds-journey-cell__route">
      <span className="ds-journey-cell__route-text">{journey.origin} → {journey.destination}</span>
    </div>
    <JourneyHeaderView journey={journey} showDelay={mode === "leaderboard"} />
    {mode === "public" && showBettingInfo && <div className="journey-card__betting-info">
      {bettingInfo && <Badge variant="clear" className="journey-card__delay-badge">{bettingInfo.label}</Badge>}
      {averageDelay !== null && <InfoBadge variant="orange" description="Historical average delay for this train." open={activeBadgeDescription === "Historical average delay for this train."} onToggle={toggleBadgeDescription}>⏱️ {averageDelay}</InfoBadge>}
      {onTimePercentage !== null && <InfoBadge variant="green" description="Share of historical journeys arriving within 0–5 minutes of schedule." open={activeBadgeDescription === "Share of historical journeys arriving within 0–5 minutes of schedule."} onToggle={toggleBadgeDescription}>{onTimePercentage.toFixed(0)}%✅</InfoBadge>}
      {journey.history && <InfoBadge variant="red" description="Historical cancellation rate for this train." open={activeBadgeDescription === "Historical cancellation rate for this train."} onToggle={toggleBadgeDescription}>{journey.history.cancellation.ratePercentage.toFixed(1)}%🙅</InfoBadge>}
      {journey.eventCounts?.football ? <InfoBadge variant="green" description="Football events within 10 km of this journey route." open={activeBadgeDescription === "Football events within 10 km of this journey route."} onToggle={toggleBadgeDescription}>{journey.eventCounts.football}⚽️</InfoBadge> : null}
      {journey.eventCounts?.disruption ? <InfoBadge variant="red" description="Rail disruptions within 1 km of this journey route." open={activeBadgeDescription === "Rail disruptions within 1 km of this journey route."} onToggle={toggleBadgeDescription}>{journey.eventCounts.disruption}⚠️</InfoBadge> : null}
      {journey.eventCounts?.construction ? <InfoBadge variant="construction" description="Major construction works within 1 km of this journey route." open={activeBadgeDescription === "Major construction works within 1 km of this journey route."} onToggle={toggleBadgeDescription}>{journey.eventCounts.construction}⚒️</InfoBadge> : null}
      {activeBadgeDescription && <span className="journey-card__badge-description" role="status">{activeBadgeDescription}</span>}
    </div>}
  </article>;
}
