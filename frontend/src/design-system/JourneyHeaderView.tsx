import type { Journey } from "../api/client";
import { TimeLabelView, type DelayStatus } from "./TimeLabelView";

export type JourneyHeaderViewProps = { journey: Journey; showDelay?: boolean; className?: string };

function formatDuration(durationSeconds: number) {
  const totalMinutes = Math.max(0, Math.round(durationSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function JourneyHeaderView({ journey, showDelay = false, className = "" }: JourneyHeaderViewProps) {
  const delayStatus: DelayStatus = journey.liveStatus === "cancelled" || journey.status === "cancelled"
    ? "cancelled"
    : journey.delaySeconds !== null && journey.delaySeconds !== undefined && journey.delaySeconds > 0
      ? { type: "delay", minutes: Math.round(journey.delaySeconds / 60) }
      : "onTime";
  return <header className={`ds-journey-header ${className}`.trim()}>
    <TimeLabelView time={{ planned: journey.scheduledDeparture }} size="big" arrangement="right" type="onlyTime" />
    <span className="ds-journey-header__duration">{formatDuration(journey.durationSeconds)}</span>
    <TimeLabelView time={{ actual: journey.actualArrival, planned: journey.scheduledArrival }} delayStatus={showDelay ? delayStatus : "onTime"} size="big" arrangement="left" type="onlyTime" />
  </header>;
}
