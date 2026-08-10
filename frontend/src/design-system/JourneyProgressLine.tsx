import { useEffect, useState } from "react";
import type { Journey } from "../api/client";

export type JourneyProgressLineProps = { journey: Journey; referenceDate?: Date; className?: string };

function progressAt(journey: Journey, now: Date) {
  const departure = Date.parse(journey.scheduledDeparture);
  const arrival = Date.parse(journey.actualArrival ?? journey.scheduledArrival ?? "");
  if (!Number.isFinite(departure) || !Number.isFinite(arrival) || arrival <= departure) return 0;
  return Math.max(0, Math.min(1, (now.getTime() - departure) / (arrival - departure)));
}

export function JourneyProgressLine({ journey, referenceDate, className = "" }: JourneyProgressLineProps) {
  const [now, setNow] = useState(referenceDate ?? new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(referenceDate ?? new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, [referenceDate]);
  const cancelled = journey.status === "cancelled" || journey.liveStatus === "cancelled";
  const progress = cancelled ? 0 : progressAt(journey, now);
  return <span className={`ds-journey-progress ${className}`.trim()} role="progressbar" aria-label="Journey progress" aria-valuemin={0} aria-valuemax={1} aria-valuenow={progress}>
    {progress > 0 && progress < 1 && <span className="ds-journey-progress__value" style={{ left: `${progress * 100}%` }} />}
  </span>;
}
