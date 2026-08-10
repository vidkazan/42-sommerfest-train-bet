import type { Journey } from "../api/client";
import { Badge, TransportIcon } from "./components";
import { journeyToLeg, transportIconType } from "./journeyToLeg";

export type JDVHeaderProps = { journey: Journey; className?: string };

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function JDVHeader({ journey, className = "" }: JDVHeaderProps) {
  const leg = journeyToLeg(journey);
  return <header className={`ds-jdv-header ${className}`.trim()}>
    <h2 className="ds-jdv-header__route">{journey.origin} <span aria-hidden="true">→</span> {journey.destination}</h2>
    <div className="ds-jdv-header__meta" aria-label="Journey summary">
      <Badge variant="accent">{formatDate(journey.scheduledDeparture)}</Badge>
      <Badge variant="accent">{formatTime(journey.scheduledDeparture)} – {formatTime(journey.actualArrival ?? journey.scheduledArrival)}</Badge>
      <Badge variant="accent">{formatDuration(journey.durationSeconds)}</Badge>
    </div>
    <div className={`ds-journey-leg ds-journey-leg--${leg.transport} ${leg.cancelled ? "cancelled" : ""}`} aria-label={`${leg.lineName}, ${leg.from} to ${leg.to}`}>
      <TransportIcon type={transportIconType(leg.transport)} decorative />
      <strong>{leg.lineName}</strong>
    </div>
  </header>;
}
