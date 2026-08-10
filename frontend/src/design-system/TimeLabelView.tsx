import { useEffect, useMemo, useState } from "react";
import { colors } from "./tokens";

export type TimeLabelSize = "small" | "medium" | "big" | "huge";
export type TimeLabelArrangement = "left" | "right" | "bottom";
export type TimeLabelType = "onlyOffset" | "onlyTime" | "timeAndOffset" | "timeOrOffset";
export type DelayStatus = "onTime" | "cancelled" | { type: "delay"; minutes: number };

export interface PrognosedTime {
  actual?: Date | string | null;
  planned?: Date | string | null;
}

export interface TimeLabelViewProps {
  time: PrognosedTime;
  delayStatus?: DelayStatus;
  size?: TimeLabelSize;
  arrangement?: TimeLabelArrangement;
  type?: TimeLabelType;
  referenceDate?: Date;
  className?: string;
}

const asDate = (value?: Date | string | null) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const formatTime = (value?: Date | string | null) => {
  const date = asDate(value);
  return date?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
};

const formatOffset = (target: Date, now: Date) => {
  const minutes = Math.round((target.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0 && minutes > -1) return "now";
  const duration = Math.abs(minutes) < 60 ? `${Math.abs(minutes)} min` : `${Math.floor(Math.abs(minutes) / 60)} h ${Math.abs(minutes) % 60} min`;
  return minutes > 0 ? `in ${duration}` : `${duration} ago`;
};

function isOffsetMode(type: TimeLabelType, target: Date | undefined, now: Date) {
  if (type !== "timeOrOffset" || !target) return type === "onlyOffset";
  return Math.abs(target.getTime() - now.getTime()) < 40 * 60_000;
}

export function TimeLabelView({
  time,
  delayStatus = "onTime",
  size = "big",
  arrangement = "bottom",
  type = "onlyTime",
  referenceDate,
  className = "",
}: TimeLabelViewProps) {
  const [, setTick] = useState(0);
  const [now, setNow] = useState(referenceDate ?? new Date());
  const actual = asDate(time.actual);
  const planned = asDate(time.planned);
  const target = actual ?? planned;
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(referenceDate ?? new Date()); setTick((value) => value + 1); }, 60_000);
    return () => window.clearInterval(timer);
  }, [referenceDate]);

  const offsetMode = isOffsetMode(type, target, now);
  const showTime = type === "onlyTime" || type === "timeAndOffset" || (type === "timeOrOffset" && !offsetMode);
  const showOffset = type === "onlyOffset" || type === "timeAndOffset" || (type === "timeOrOffset" && offsetMode);
  const delay = typeof delayStatus === "object" && delayStatus.type === "delay" ? delayStatus.minutes : 0;
  const cancelled = delayStatus === "cancelled";
  const mainTime = cancelled ? planned : actual ?? planned;
  const originalTime = delay > 0 ? planned : actual;
  const offset = target ? formatOffset(target, now) : undefined;
  const mainClass = `ds-time-label__main ds-text-${size}`;
  const content = useMemo(() => ({ main: formatTime(mainTime), original: formatTime(originalTime) }), [mainTime?.getTime(), originalTime?.getTime()]);

  return <span className={`ds-time-label ds-time-label--${arrangement} ${className}`.trim()}>
    {showTime && <span className={mainClass} style={{ color: cancelled ? "var(--ds-text-secondary)" : delay >= 5 ? colors.fill.red : "var(--ds-text-primary)", textDecoration: cancelled ? "line-through" : undefined }}>
      {content.main ?? "—"}
    </span>}
    {delay > 0 && size !== "small" && size !== "medium" && content.original && <span className="ds-time-label__original">{content.original}</span>}
    {delay > 0 && <span className="ds-time-label__delay">+{delay}</span>}
    {showOffset && offset && <span className="ds-time-label__offset ds-badge">{offset}</span>}
  </span>;
}
