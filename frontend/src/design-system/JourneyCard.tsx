import type { Journey } from "../api/client";
import { Badge, TransportIcon } from "./components";
import { JourneyHeaderView } from "./JourneyHeaderView";
import { journeyToLeg, transportIconType } from "./journeyToLeg";
import { JourneyProgressLine } from "./JourneyProgressLine";

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
  onSelect?: (journey: Journey) => void;
  onToggle?: (journey: Journey) => void;
  className?: string;
};

export function journeyStatus(journey: Journey) {
  if (journey.liveStatus === "cancelled" || journey.status === "cancelled") return { label: "Cancelled", variant: "danger" as const, blocked: true };
  if (journey.status === "excluded") return { label: `Excluded: ${journey.exclusionReason ?? "rule mismatch"}`, variant: "muted" as const, blocked: true };
  if (journey.delaySeconds !== null && journey.delaySeconds !== undefined) {
    const minutes = Math.round(Math.abs(journey.delaySeconds) / 60);
    if (journey.delaySeconds > 0) return { label: `+${minutes} min delay`, variant: "danger" as const, blocked: false };
    if (journey.delaySeconds < 0) return { label: `−${minutes} min early`, variant: "neutral" as const, blocked: false };
    return { label: "On time", variant: "success" as const, blocked: false };
  }
  if (journey.liveStatus === "waiting" || journey.liveStatus === "waiting_for_departure") return { label: "Waiting for departure", variant: "neutral" as const, blocked: false };
  if (journey.liveStatus === "stale") return { label: "Live data stale", variant: "muted" as const, blocked: false };
  if (journey.liveStatus === "arrived") return { label: journey.actualArrival ? `Arrived ${new Date(journey.actualArrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Arrived", variant: "success" as const, blocked: false };
  if (journey.liveStatus === "in_progress") return { label: "In transit", variant: "neutral" as const, blocked: false };
  return null;
}

export function JourneyCard({ journey, mode = "public", selected = false, disabled = false, position, bettors = [], currentParticipantId, onSelect, onToggle, className = "" }: JourneyCardProps) {
  const leg = journeyToLeg(journey);
  const status = journeyStatus(journey);
  const isDisabled = disabled || (mode === "admin" && status?.blocked === true);
  const isCurrentUser = bettors.some((bettor) => bettor.participantId === currentParticipantId);
  const rankBadge = position === 1 ? "red" : position === 2 ? "orange" : position === 3 ? "yellow" : null;
  const rankBadgeClass = position === 1 ? "ds-rank-badge--red" : position === 2 ? "ds-rank-badge--orange" : position === 3 ? "ds-rank-badge--yellow" : "";
  const delayBadge = journey.delaySeconds !== null && journey.delaySeconds !== undefined && journey.delaySeconds >= 0
    ? `+${Math.round(journey.delaySeconds / 60)} min`
    : null;
  const selectable = (mode === "public" || mode === "leaderboard" || mode === "admin") && Boolean(onSelect || onToggle) && !isDisabled;
  const selectJourney = () => mode === "admin" ? onToggle?.(journey) : onSelect?.(journey);
  return <article className={`journey-card ds-journey-card ${selected ? "selected" : ""} ${isDisabled ? "disabled" : ""} ${selectable ? "selectable" : ""} ${className}`.trim()} aria-disabled={isDisabled || undefined} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} onClick={selectable ? selectJourney : undefined} onKeyDown={selectable ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectJourney(); } } : undefined}>
    {mode === "leaderboard" && <div className="ds-journey-card__labels">
      {isCurrentUser && <Badge variant="blue">My bet</Badge>}
      <strong className="ds-journey-card__position">{rankBadge ? <Badge variant={rankBadge} className={rankBadgeClass}>#{position}</Badge> : <Badge variant="secondary">{position ? `#${position}` : "⏳"}</Badge>}</strong>
      {mode === "leaderboard" && delayBadge && <Badge variant="secondary">{delayBadge}</Badge>}
      {journey.liveStatus === "arrived" && <Badge variant="green">Arrived</Badge>}
    </div>}
    <span className="ds-journey-cell__route">{journey.origin} → {journey.destination}</span>
    <JourneyHeaderView journey={journey} showDelay={mode === "leaderboard"} />
    <div className={`ds-journey-leg ds-journey-leg--${leg.transport} ${leg.cancelled ? "cancelled" : ""} ${journey.liveStatus === "arrived" ? "arrived" : ""}`} aria-label={`${leg.lineName}, ${leg.from} to ${leg.to}`}>
      <TransportIcon type={transportIconType(leg.transport)} decorative />
      <strong>{leg.lineName}</strong>
      <JourneyProgressLine journey={journey} />
    </div>
  </article>;
}
