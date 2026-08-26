import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Badge, DelayBadge } from "./components";
import { DelaySparkline } from "./DelaySparkline";
import { TrainLabel, TrainLabelButton } from "./TrainLabel";

export type RaceStageEntry = {
  trainId: string;
  displayName: string;
  gameName?: string | null;
  scheduledDeparture?: string | null;
  scheduledArrival?: string | null;
  routeJson?: string | null;
  stops?: RouteStop[];
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

type RouteStop = { name?: unknown; scheduledArrival?: unknown; scheduledDeparture?: unknown; actualArrival?: unknown; actualDeparture?: unknown };

function nextStation(stops: RouteStop[] | undefined, routeJson: string | null | undefined, now: number): string | null {
  let routeStops = stops ?? [];
  if (!routeStops.length && routeJson) {
    try {
      const parsed = JSON.parse(routeJson) as unknown;
      routeStops = Array.isArray(parsed) ? parsed.filter((stop): stop is RouteStop => Boolean(stop && typeof stop === "object" && typeof (stop as RouteStop).name === "string" && (stop as RouteStop).name)) : [];
    } catch { routeStops = []; }
  }
  const candidates = routeStops.length > 1 ? routeStops.slice(1) : routeStops;
  const upcoming = candidates.find((stop) => {
    const actualDeparture = Date.parse(String(stop.actualDeparture ?? ""));
    if (Number.isFinite(actualDeparture)) return actualDeparture > now;
    const actualArrival = Date.parse(String(stop.actualArrival ?? ""));
    if (Number.isFinite(actualArrival)) return actualArrival > now;
    const scheduled = Date.parse(String(stop.scheduledArrival ?? stop.scheduledDeparture ?? ""));
    return Number.isFinite(scheduled) && scheduled > now;
  });
  return typeof upcoming?.name === "string" ? upcoming.name : null;
}

function snapshotAtOrBefore(history: RaceStageEntry["delayHistory"], cutoff: number) {
  const candidates = (history ?? []).filter((snapshot) => Date.parse(snapshot.recordedAt) <= cutoff);
  return candidates[candidates.length - 1];
}

type RaceVisualState = { order: string[]; delays: Record<string, number | null> };

function currentDelay(entry: RaceStageEntry, final: boolean) {
  return final ? entry.finalDelayMinutes ?? null : entry.raceDelayMinutes;
}

function isCancelled(entry: RaceStageEntry) {
  return entry.cancelled || entry.status === "cancelled";
}

function sortVisualIds(ids: string[], delays: Record<string, number | null>, entriesById: Map<string, RaceStageEntry>, stableOrder: string[]) {
  const stableIndex = new Map(stableOrder.map((id, index) => [id, index]));
  return [...ids].sort((leftId, rightId) => {
    const left = entriesById.get(leftId);
    const right = entriesById.get(rightId);
    if (!left || !right) return (stableIndex.get(leftId) ?? 0) - (stableIndex.get(rightId) ?? 0);
    const leftCancelled = isCancelled(left);
    const rightCancelled = isCancelled(right);
    if (leftCancelled !== rightCancelled) return Number(leftCancelled) - Number(rightCancelled);
    const leftDelay = delays[leftId];
    const rightDelay = delays[rightId];
    if (leftDelay === null && rightDelay !== null) return 1;
    if (leftDelay !== null && rightDelay === null) return -1;
    return (rightDelay ?? -Infinity) - (leftDelay ?? -Infinity) || (stableIndex.get(leftId) ?? 0) - (stableIndex.get(rightId) ?? 0);
  });
}

function interpolateDelay(from: number | null, to: number | null, progress: number) {
  if (progress >= 1) return to;
  return (from ?? 0) + ((to ?? 0) - (from ?? 0)) * progress;
}

export function RaceStage({ entries, final = false, className = "", onSelectTrain, onOpenTrain, onOpenBets }: { entries: RaceStageEntry[]; final?: boolean; className?: string; onSelectTrain?: (trainId: string) => void; onOpenTrain?: (trainId: string) => void; onOpenBets?: () => void }) {
  const [visualState, setVisualState] = useState<RaceVisualState>(() => {
    const delays = Object.fromEntries(entries.map((entry) => [entry.trainId, currentDelay(entry, final)]));
    const entriesById = new Map(entries.map((entry) => [entry.trainId, entry]));
    return { delays, order: sortVisualIds(entries.map((entry) => entry.trainId), delays, entriesById, entries.map((entry) => entry.trainId)) };
  });
  const animationFrame = useRef<number | null>(null);
  useEffect(() => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    const entriesById = new Map(entries.map((entry) => [entry.trainId, entry]));
    const ids = entries.map((entry) => entry.trainId);
    const order = visualState.order.filter((id) => entriesById.has(id));
    ids.forEach((id) => { if (!order.includes(id)) order.push(id); });
    const from = Object.fromEntries(ids.map((id) => [id, Object.prototype.hasOwnProperty.call(visualState.delays, id) ? visualState.delays[id] : currentDelay(entriesById.get(id)!, final)]));
    const to = Object.fromEntries(entries.map((entry) => [entry.trainId, currentDelay(entry, final)]));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const settle = () => setVisualState({ order: sortVisualIds(ids, to, entriesById, order), delays: to });
    if (final || reduceMotion) { settle(); return; }
    const startedAt = performance.now();
    const duration = 4_000;
    const animate = (timestamp: number) => {
      const linearProgress = Math.min(1, (timestamp - startedAt) / duration);
      const progress = 1 - (1 - linearProgress) ** 3;
      const delays = Object.fromEntries(ids.map((id) => [id, interpolateDelay(from[id], to[id], progress)]));
      setVisualState({ order: sortVisualIds(ids, delays, entriesById, order), delays });
      if (linearProgress < 1) animationFrame.current = requestAnimationFrame(animate);
      else animationFrame.current = null;
    };
    animationFrame.current = requestAnimationFrame(animate);
    return () => { if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current); };
  }, [entries, final]);
  const entriesById = new Map(entries.map((entry) => [entry.trainId, entry]));
  const sortedEntries = visualState.order.map((id) => entriesById.get(id)).filter((entry): entry is RaceStageEntry => entry !== undefined);
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
  const currentRankByTrainId = new Map<string, number>();
  let previousDelay: number | null | undefined;
  let previousRank = 0;
  sortedEntries.forEach((entry, index) => {
    const delay = visualState.delays[entry.trainId];
    if (delay === null || delay === undefined) return;
    const rank = previousDelay === delay ? previousRank : index + 1;
    currentRankByTrainId.set(entry.trainId, rank); previousDelay = delay; previousRank = rank;
  });
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
        const delay = visualState.delays[entry.trainId] ?? null;
        const displayDelay = delay === null ? null : Math.round(delay * 10) / 10;
        const positiveDelay = Math.max(0, delay ?? 0);
        const progress = Math.min(100, (positiveDelay / axisMax) * 100);
        const fiveMinuteSnapshot = !final ? snapshotAtOrBefore(entry.delayHistory, fiveMinuteCutoff) : undefined;
        const trendStart = fiveMinuteSnapshot?.delayMinutes ?? null;
        const trendEnd = trendStart === null || delay === null ? null : delay;
        const trendFrom = trendStart === null || trendEnd === null ? null : Math.max(0, Math.min(axisMax, trendStart));
        const trendTo = trendEnd === null ? null : Math.max(0, Math.min(axisMax, trendEnd));
        const trendChange = trendFrom === null || trendTo === null ? 0 : trendTo - trendFrom;
        const changeMinutes = trendStart === null || delay === null ? null : Math.round((delay - trendStart) * 10) / 10;
        const cancelled = entry.cancelled || entry.status === "cancelled";
        const medal = cancelled ? "🥇" : currentRankByTrainId.get(entry.trainId) === 1 ? "🥇" : currentRankByTrainId.get(entry.trainId) === 2 ? "🥈" : currentRankByTrainId.get(entry.trainId) === 3 ? "🥉" : `${currentRankByTrainId.get(entry.trainId) ?? index + 1}`;
        const remainingMinutes = entry.scheduledArrival ? Math.max(0, Math.ceil((Date.parse(entry.scheduledArrival) - now) / 60_000)) : null;
        const departureMinutes = entry.scheduledDeparture ? Math.max(0, Math.ceil((Date.parse(entry.scheduledDeparture) - now) / 60_000)) : null;
        const status = cancelled ? "CANCELLED · WINNER" : entry.status === "arrived" ? "Arrived" : entry.status === "in_progress" ? remainingMinutes === null ? "Finish time unavailable" : `Finish in ${remainingMinutes} min` : entry.stale ? "Live data stale" : departureMinutes === null ? "Waiting for departure" : `Departure in ${departureMinutes} min`;
        const arrived = entry.status === "arrived";
        const trendLabel = changeMinutes !== null && changeMinutes !== 0 ? `${changeMinutes > 0 ? "+" : "−"}${Math.abs(changeMinutes)} min in last 5 min` : null;
        const currentRank = currentRankByTrainId.get(entry.trainId);
        const previousRank = previousRankByTrainId.get(entry.trainId);
        const rankMovement = currentRank !== undefined && previousRank !== undefined ? previousRank - currentRank : 0;
        const rankMovementLabel = currentRank !== undefined ? previousRank === undefined ? "→" : rankMovement > 0 ? `↑${rankMovement}` : rankMovement < 0 ? `↓${Math.abs(rankMovement)}` : "→" : null;
        const rankMovementDescription = rankMovement > 0 ? `Moved up ${rankMovement} ${rankMovement === 1 ? "place" : "places"}` : rankMovement < 0 ? `Moved down ${Math.abs(rankMovement)} ${Math.abs(rankMovement) === 1 ? "place" : "places"}` : "No recent rank movement";
        const betLabel = `${entry.betCount ?? 0} 🎲`;
        const upcomingStation = !cancelled && entry.status !== "arrived" ? nextStation(entry.stops, entry.routeJson, now) : null;
        return <article className={`admin-race-row ${index === 0 ? "admin-race-row--leader" : ""} ${arrived ? "admin-race-row--arrived" : ""} ${trendLabel ? "admin-race-row--has-trend" : ""} ${onSelectTrain ? "admin-race-row--selectable" : ""}`.trim()} key={entry.trainId} style={{ transform: `translateY(calc(${index} * var(--race-row-height)))` }} onClick={() => onSelectTrain?.(entry.trainId)} onKeyDown={(event) => { if (onSelectTrain && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectTrain(entry.trainId); } }} role={onSelectTrain ? "button" : undefined} tabIndex={onSelectTrain ? 0 : undefined}>
          <div className="admin-race-row__identity"><span className="admin-race-row__rank">{medal}</span>{rankMovementLabel && <span className={`admin-race-row__rank-movement ${rankMovement > 0 ? "is-up" : rankMovement < 0 ? "is-down" : "is-steady"}`} aria-label={rankMovementDescription} title={rankMovementDescription}>{rankMovementLabel}</span>}{entry.betCount !== undefined && <span onClick={(event) => event.stopPropagation()}><Badge variant="secondary" className="admin-race-row__bet-count" onClick={onOpenBets ? () => onOpenBets() : undefined}>{betLabel}</Badge></span>}{entry.isMine && <Badge variant="blue" className="admin-race-row__mine">My</Badge>}{onOpenTrain ? <TrainLabelButton label={entry.displayName} gameName={entry.gameName} trainId={entry.trainId} raceColor={entry.raceColor} cancelled={cancelled} onClick={() => onOpenTrain(entry.trainId)} /> : <TrainLabel label={entry.displayName} gameName={entry.gameName} trainId={entry.trainId} raceColor={entry.raceColor} size="compact" cancelled={cancelled} />}{upcomingStation && <span className="admin-race-row__destination" title={`Next station: ${upcomingStation}`}>→ {upcomingStation}</span>}</div>
          <div className="admin-race-row__track">{trendFrom !== null && trendTo !== null && trendChange !== 0 && <span className={`admin-race-row__trend ${trendChange > 0 ? "is-increasing" : "is-decreasing"}`} style={{ left: `${(Math.min(trendFrom, trendTo) / axisMax) * 100}%`, width: `${(Math.abs(trendChange) / axisMax) * 100}%` }} />}<span className="admin-race-row__bar" style={{ width: `${progress}%` }} />{cancelled ? <Badge variant="primary" className={`admin-race-row__value ${progress <= 3 ? "is-at-start" : progress >= 100 ? "is-at-end" : ""}`.trim()} style={{ left: `${progress}%` }}>WINNER</Badge> : <DelayBadge minutes={displayDelay} className={`admin-race-row__value ${progress <= 3 ? "is-at-start" : progress >= 100 ? "is-at-end" : ""}`.trim()} style={{ left: `${progress}%` }} />}</div>
          {!final && <DelaySparkline history={entry.delayHistory} trainId={entry.trainId} trainLabel={entry.displayName} now={now} />}
          <span className="admin-race-row__status"><span>{status}</span>{trendLabel && <span className={`admin-race-row__trend-label ${changeMinutes! > 0 ? "is-increasing" : "is-decreasing"}`}>{trendLabel}</span>}</span>
        </article>;
      })}
    </div>
  </div>;
}
