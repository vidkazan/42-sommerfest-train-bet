import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Badge } from "./components";
import { buildTrainColorMap, trainColor } from "./trainColors";
import { TrainLabel } from "./TrainLabel";

export type RaceStageEntry = {
  trainId: string;
  displayName: string;
  raceDelayMinutes: number | null;
  finalDelayMinutes?: number | null;
  status: string;
  cancelled?: boolean;
  stale?: boolean;
  raceColor?: string | null;
  isMine?: boolean;
};

export function RaceStage({ entries, final = false, className = "", onSelectTrain }: { entries: RaceStageEntry[]; final?: boolean; className?: string; onSelectTrain?: (trainId: string) => void }) {
  const sortedEntries = [...entries].sort((left, right) => {
    const leftCancelled = left.cancelled || left.status === "cancelled";
    const rightCancelled = right.cancelled || right.status === "cancelled";
    if (leftCancelled !== rightCancelled) return Number(leftCancelled) - Number(rightCancelled);
    const leftDelay = final ? left.finalDelayMinutes : left.raceDelayMinutes;
    const rightDelay = final ? right.finalDelayMinutes : right.raceDelayMinutes;
    if (leftDelay === null && rightDelay !== null) return 1;
    if (leftDelay !== null && rightDelay === null) return -1;
    return (rightDelay ?? -Infinity) - (leftDelay ?? -Infinity);
  });
  const maxDelay = Math.max(0, ...sortedEntries.map((entry) => Math.max(0, (final ? entry.finalDelayMinutes : entry.raceDelayMinutes) ?? 0)));
  const initialAxisMax = Math.max(10, Math.ceil((maxDelay + 1) / 5) * 5);
  const [axisMax, setAxisMax] = useState(initialAxisMax);
  useEffect(() => {
    if (maxDelay >= axisMax) setAxisMax(Math.max(10, Math.ceil((maxDelay + 5) / 5) * 5));
  }, [axisMax, maxDelay]);
  const axisTicks = Array.from({ length: Math.floor(axisMax / 5) + 1 }, (_, index) => index * 5);
  const colorsByTrain = buildTrainColorMap(entries);
  if (!sortedEntries.length) return <p className="admin-dashboard__empty">Waiting for selected trains to start reporting.</p>;
  return <div className={`race-stage ${className}`.trim()}>
    <div className="admin-race-axis" aria-hidden="true"><span className="admin-race-axis__spacer" /><div className="admin-race-axis__ticks">{axisTicks.map((tick) => <span key={tick} style={{ left: `${(tick / axisMax) * 100}%` }}>{tick === axisMax ? `${tick}+` : tick}</span>)}</div></div>
    <div className="admin-race-stage" style={{ "--race-row-count": sortedEntries.length } as CSSProperties}>
      {sortedEntries.map((entry, index) => {
        const delay = final ? entry.finalDelayMinutes ?? null : entry.raceDelayMinutes;
        const positiveDelay = Math.max(0, delay ?? 0);
        const progress = Math.min(100, (positiveDelay / axisMax) * 100);
        const color = colorsByTrain.get(entry.trainId) ?? trainColor(entry.trainId, entry.raceColor);
        const cancelled = entry.cancelled || entry.status === "cancelled";
        const medal = cancelled ? "🥇" : index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`;
        const status = cancelled ? "CANCELLED · WINNER" : entry.status === "arrived" ? "Arrived" : entry.status === "in_progress" ? "In transit" : entry.stale ? "Live data stale" : "Waiting for departure";
        const arrived = entry.status === "arrived";
        const delayLabel = delay === null ? "—" : `${delay >= 0 ? "+" : "−"}${Math.abs(delay)} min${delay < 0 ? " 😂" : ""}${arrived ? " ✅" : ""}`;
        return <article className={`admin-race-row ${index === 0 ? "admin-race-row--leader" : ""} ${arrived ? "admin-race-row--arrived" : ""} ${onSelectTrain ? "admin-race-row--selectable" : ""}`.trim()} key={entry.trainId} style={{ transform: `translateY(calc(${index} * var(--race-row-height)))` }} onClick={() => onSelectTrain?.(entry.trainId)} onKeyDown={(event) => { if (onSelectTrain && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectTrain(entry.trainId); } }} role={onSelectTrain ? "button" : undefined} tabIndex={onSelectTrain ? 0 : undefined}>
          <div className="admin-race-row__identity"><span className="admin-race-row__rank">{medal}</span><TrainLabel label={entry.displayName} trainId={entry.trainId} raceColor={entry.raceColor} size="medium" cancelled={cancelled} />{entry.isMine && <Badge variant="blue" className="admin-race-row__mine">My train</Badge>}</div>
          <div className="admin-race-row__track"><span className="admin-race-row__bar" style={{ background: cancelled ? "var(--ds-border)" : color, width: `${progress}%` }} /><span className="admin-race-row__marker" style={{ background: cancelled ? "var(--ds-border)" : color, left: `${progress}%` }} /><Badge variant="primary" className="admin-race-row__value" style={{ color: "var(--ds-text-primary)", left: `${progress}%` }}>{cancelled ? "WINNER" : delayLabel}</Badge></div>
          <span className="admin-race-row__status">{status}</span>
        </article>;
      })}
    </div>
  </div>;
}
