import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Badge, DelayBadge } from "./components";
import { DelaySparkline } from "./DelaySparkline";
import { TrainLabel, TrainLabelButton } from "./TrainLabel";

export type RaceStageEntry = {
  trainId: string;
  displayName: string;
  gameName?: string | null;
  scheduledArrival?: string | null;
  raceDelayMinutes: number | null;
  finalDelayMinutes?: number | null;
  status: string;
  cancelled?: boolean;
  stale?: boolean;
  raceColor?: string | null;
  betCount?: number;
  isMine?: boolean;
  delayHistory?: Array<{ delayMinutes: number; recordedAt: string }>;
};

function snapshotAtOrBefore(history: RaceStageEntry["delayHistory"], cutoff: number) {
  const candidates = (history ?? []).filter((snapshot) => Date.parse(snapshot.recordedAt) <= cutoff);
  return candidates[candidates.length - 1];
}

export function RaceStage({ entries, final = false, className = "", onSelectTrain, onOpenTrain }: { entries: RaceStageEntry[]; final?: boolean; className?: string; onSelectTrain?: (trainId: string) => void; onOpenTrain?: (trainId: string) => void }) {
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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (maxDelay >= axisMax) setAxisMax(Math.max(10, Math.ceil((maxDelay + 5) / 5) * 5));
  }, [axisMax, maxDelay]);
  const axisTicks = Array.from({ length: Math.floor(axisMax / 5) + 1 }, (_, index) => index * 5);
  const currentRankByTrainId = new Map(sortedEntries.map((entry, index) => [entry.trainId, index + 1]));
  const fiveMinuteCutoff = now - 5 * 60_000;
  const previousRankedEntries = !final ? [...sortedEntries]
    .map((entry) => ({ entry, snapshot: snapshotAtOrBefore(entry.delayHistory, fiveMinuteCutoff) }))
    .filter((item): item is { entry: RaceStageEntry; snapshot: NonNullable<RaceStageEntry["delayHistory"]>[number] } => !item.entry.cancelled && item.entry.status !== "cancelled" && item.entry.raceDelayMinutes !== null && item.snapshot !== undefined)
    .sort((left, right) => right.snapshot.delayMinutes - left.snapshot.delayMinutes)
    .map((item) => item.entry) : [];
  const previousRankByTrainId = new Map(previousRankedEntries.map((entry, index) => [entry.trainId, index + 1]));
  if (!sortedEntries.length) return <p className="admin-dashboard__empty">Waiting for selected trains to start reporting.</p>;
  return <div className={`race-stage ${className}`.trim()}>
    <div className="admin-race-axis" aria-hidden="true"><span className="admin-race-axis__spacer" /><div className="admin-race-axis__ticks">{axisTicks.map((tick) => <span key={tick} style={{ left: `${(tick / axisMax) * 100}%` }}>{tick === axisMax ? `${tick}+` : tick}</span>)}</div></div>
    <div className="admin-race-stage" style={{ "--race-row-count": sortedEntries.length } as CSSProperties}>
      {sortedEntries.map((entry, index) => {
        const delay = final ? entry.finalDelayMinutes ?? null : entry.raceDelayMinutes;
        const positiveDelay = Math.max(0, delay ?? 0);
        const progress = Math.min(100, (positiveDelay / axisMax) * 100);
        const fiveMinuteSnapshot = !final ? snapshotAtOrBefore(entry.delayHistory, fiveMinuteCutoff) : undefined;
        const trendStart = fiveMinuteSnapshot?.delayMinutes ?? null;
        const trendEnd = trendStart === null || delay === null ? null : delay;
        const trendFrom = trendStart === null || trendEnd === null ? null : Math.max(0, Math.min(axisMax, trendStart));
        const trendTo = trendEnd === null ? null : Math.max(0, Math.min(axisMax, trendEnd));
        const trendChange = trendFrom === null || trendTo === null ? 0 : trendTo - trendFrom;
        const changeMinutes = trendStart === null || delay === null ? null : delay - trendStart;
        const cancelled = entry.cancelled || entry.status === "cancelled";
        const medal = cancelled ? "🥇" : index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`;
        const remainingMinutes = entry.scheduledArrival ? Math.max(0, Math.ceil((Date.parse(entry.scheduledArrival) - now) / 60_000)) : null;
        const status = cancelled ? "CANCELLED · WINNER" : entry.status === "arrived" ? "Arrived" : entry.status === "in_progress" ? remainingMinutes === null ? "Finish time unavailable" : `Finish in ${remainingMinutes} min` : entry.stale ? "Live data stale" : "Waiting for departure";
        const arrived = entry.status === "arrived";
        const trendLabel = changeMinutes !== null && changeMinutes !== 0 ? `${changeMinutes > 0 ? "+" : "−"}${Math.abs(changeMinutes)} min in last 5 min` : null;
        const currentRank = currentRankByTrainId.get(entry.trainId);
        const previousRank = previousRankByTrainId.get(entry.trainId);
        const rankMovement = currentRank !== undefined && previousRank !== undefined ? previousRank - currentRank : 0;
        const rankMovementLabel = currentRank !== undefined && previousRank !== undefined ? rankMovement > 0 ? `↑${rankMovement}` : rankMovement < 0 ? `↓${Math.abs(rankMovement)}` : "→" : null;
        const rankMovementDescription = rankMovement > 0 ? `Moved up ${rankMovement} ${rankMovement === 1 ? "place" : "places"}` : rankMovement < 0 ? `Moved down ${Math.abs(rankMovement)} ${Math.abs(rankMovement) === 1 ? "place" : "places"}` : "No recent rank movement";
        const betLabel = entry.betCount === 1 ? "1 bet" : `${entry.betCount ?? 0} bets`;
        return <article className={`admin-race-row ${index === 0 ? "admin-race-row--leader" : ""} ${arrived ? "admin-race-row--arrived" : ""} ${trendLabel ? "admin-race-row--has-trend" : ""} ${onSelectTrain ? "admin-race-row--selectable" : ""}`.trim()} key={entry.trainId} style={{ transform: `translateY(calc(${index} * var(--race-row-height)))` }} onClick={() => onSelectTrain?.(entry.trainId)} onKeyDown={(event) => { if (onSelectTrain && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectTrain(entry.trainId); } }} role={onSelectTrain ? "button" : undefined} tabIndex={onSelectTrain ? 0 : undefined}>
          <div className="admin-race-row__identity"><span className="admin-race-row__rank">{medal}</span>{entry.betCount !== undefined && <span onClick={(event) => event.stopPropagation()}><Badge variant="secondary" className="admin-race-row__bet-count">{betLabel}</Badge></span>}{onOpenTrain ? <TrainLabelButton label={entry.displayName} gameName={entry.gameName} trainId={entry.trainId} raceColor={entry.raceColor} cancelled={cancelled} onClick={() => onOpenTrain(entry.trainId)} /> : <TrainLabel label={entry.displayName} gameName={entry.gameName} trainId={entry.trainId} raceColor={entry.raceColor} size="compact" cancelled={cancelled} />}{rankMovementLabel && <span className={`admin-race-row__rank-movement ${rankMovement > 0 ? "is-up" : rankMovement < 0 ? "is-down" : "is-steady"}`} aria-label={rankMovementDescription} title={rankMovementDescription}>{rankMovementLabel}</span>}{entry.isMine && <Badge variant="blue" className="admin-race-row__mine">My train</Badge>}</div>
          <div className="admin-race-row__track">{trendFrom !== null && trendTo !== null && trendChange !== 0 && <span className={`admin-race-row__trend ${trendChange > 0 ? "is-increasing" : "is-decreasing"}`} style={{ left: `${(Math.min(trendFrom, trendTo) / axisMax) * 100}%`, width: `${(Math.abs(trendChange) / axisMax) * 100}%` }} />}<span className="admin-race-row__bar" style={{ width: `${progress}%` }} />{cancelled ? <Badge variant="primary" className={`admin-race-row__value ${progress === 0 ? "is-at-start" : progress >= 100 ? "is-at-end" : ""}`.trim()} style={{ left: `${progress}%` }}>WINNER</Badge> : <DelayBadge minutes={delay} className={`admin-race-row__value ${progress === 0 ? "is-at-start" : progress >= 100 ? "is-at-end" : ""}`.trim()} style={{ left: `${progress}%` }} />}</div>
          {!final && <DelaySparkline history={entry.delayHistory} trainId={entry.trainId} trainLabel={entry.displayName} now={now} />}
          <span className="admin-race-row__status"><span>{status}</span>{trendLabel && <span className={`admin-race-row__trend-label ${changeMinutes! > 0 ? "is-increasing" : "is-decreasing"}`}>{trendLabel}</span>}</span>
        </article>;
      })}
    </div>
  </div>;
}
