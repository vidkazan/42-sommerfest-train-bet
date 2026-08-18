import { useState, type ReactNode } from "react";
import type { Journey } from "../api/client";
import { Badge } from "./components";
import { JourneyHeaderView } from "./JourneyHeaderView";
import { journeyToLeg } from "./journeyToLeg";
import { getOnTimePercentage, TrainHistoryView } from "./TrainHistoryView";

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

export function JourneyCard({ journey, mode = "public", selected = false, disabled = false, position, raceStatus, bettors = [], currentParticipantId, onSelect, onToggle, className = "" }: JourneyCardProps) {
  const leg = journeyToLeg(journey);
  const status = journeyStatus(journey);
  const isDisabled = disabled || (mode === "admin" && status?.blocked === true);
  const isCurrentUser = bettors.some((bettor) => bettor.participantId === currentParticipantId);
  const rankBadge = position === 1 ? "red" : position === 2 ? "orange" : position === 3 ? "yellow" : null;
  const rankBadgeClass = position === 1 ? "ds-rank-badge--red" : position === 2 ? "ds-rank-badge--orange" : position === 3 ? "ds-rank-badge--yellow" : "";
  const delayBadge = journey.raceDelayMinutes !== null && journey.raceDelayMinutes !== undefined && journey.raceDelayMinutes >= 0
    ? `+${journey.raceDelayMinutes} min`
    : null;
  const selectable = (mode === "public" || mode === "leaderboard" || mode === "admin") && Boolean(onSelect || onToggle) && !isDisabled;
  const selectJourney = () => mode === "admin" ? onToggle?.(journey) : onSelect?.(journey);
  const departureInfo = formatDepartureInfo(journey);
  const bettingInfo = departureInfo;
  const onTimePercentage = journey.history ? getOnTimePercentage(journey.history) : null;
  const averageDelay = journey.history ? `${journey.history.delay.averageMinutes >= 0 ? "+" : "−"}${Math.abs(journey.history.delay.averageMinutes).toFixed(1)}m` : null;
  const [activeBadgeDescription, setActiveBadgeDescription] = useState<string | null>(null);
  const toggleBadgeDescription = (description: string) => setActiveBadgeDescription((current) => current === description ? null : description);
  return <article data-journey-id={journey.id} className={`journey-card ds-journey-card ds-journey-cell ds-journey-card--${mode} ${selected ? "selected" : ""} ${isDisabled ? "disabled" : ""} ${selectable ? "selectable" : ""} ${className}`.trim()} aria-disabled={isDisabled || undefined} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} onClick={selectable ? selectJourney : undefined} onKeyDown={selectable ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectJourney(); } } : undefined}>
    {mode === "leaderboard" && <div className="ds-journey-card__labels">
      <strong className="ds-journey-card__position">{rankBadge ? <Badge variant={rankBadge} className={rankBadgeClass}>{formatPlace(position)}</Badge> : <Badge variant="secondary">{formatPlace(position)}</Badge>}</strong>
      {isCurrentUser && <Badge variant="blue">My train</Badge>}
      {raceStatus && <Badge variant={raceStatus === "OUT OF THE RACE" ? "red" : "secondary"}>{raceStatus}</Badge>}
      {mode === "leaderboard" && delayBadge && <Badge variant="secondary">{delayBadge}</Badge>}
      {journey.liveStatus === "arrived" && <Badge variant="green">Arrived</Badge>}
    </div>}
    <div className="ds-journey-cell__line">
      <span className={`ds-journey-line-badge ds-journey-line-badge--${leg.transport} ${leg.cancelled ? "cancelled" : ""}`.trim()} aria-label={`Line ${leg.lineName}`}>{leg.lineName}</span>
    </div>
    <div className="ds-journey-cell__route">
      <span className="ds-journey-cell__route-text">{journey.origin} → {journey.destination}</span>
    </div>
    <JourneyHeaderView journey={journey} showDelay={mode === "leaderboard"} />
    {mode === "public" && <div className="journey-card__betting-info">
      {bettingInfo && <Badge variant={bettingInfo.variant}>{bettingInfo.label}</Badge>}
      {averageDelay !== null && <InfoBadge variant="orange" description="Historical average delay for this train." open={activeBadgeDescription === "Historical average delay for this train."} onToggle={toggleBadgeDescription}>⏱️ {averageDelay}</InfoBadge>}
      {onTimePercentage !== null && <InfoBadge variant="green" description="Share of historical journeys arriving within 0–5 minutes of schedule." open={activeBadgeDescription === "Share of historical journeys arriving within 0–5 minutes of schedule."} onToggle={toggleBadgeDescription}>{onTimePercentage.toFixed(0)}%✅</InfoBadge>}
      {journey.history && <InfoBadge variant="red" description="Historical cancellation rate for this train." open={activeBadgeDescription === "Historical cancellation rate for this train."} onToggle={toggleBadgeDescription}>{journey.history.cancellation.ratePercentage.toFixed(1)}%🙅</InfoBadge>}
      {journey.eventCounts?.football ? <InfoBadge variant="green" description="Football events within 10 km of this journey route." open={activeBadgeDescription === "Football events within 10 km of this journey route."} onToggle={toggleBadgeDescription}>{journey.eventCounts.football}⚽️</InfoBadge> : null}
      {journey.eventCounts?.disruption ? <InfoBadge variant="red" description="Rail disruptions within 1 km of this journey route." open={activeBadgeDescription === "Rail disruptions within 1 km of this journey route."} onToggle={toggleBadgeDescription}>{journey.eventCounts.disruption}⚠️</InfoBadge> : null}
      {journey.eventCounts?.construction ? <InfoBadge variant="construction" description="Major construction works within 1 km of this journey route." open={activeBadgeDescription === "Major construction works within 1 km of this journey route."} onToggle={toggleBadgeDescription}>{journey.eventCounts.construction}⚒️</InfoBadge> : null}
      {activeBadgeDescription && <span className="journey-card__badge-description" role="status">{activeBadgeDescription}</span>}
    </div>}
    {(mode === "public" || mode === "admin") && <TrainHistoryView history={journey.history} />}
  </article>;
}
