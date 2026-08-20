import type { ReactNode } from "react";
import { trainColor } from "./trainColors";

export type TrainLabelSize = "compact" | "regular" | "medium" | "large";

export function TrainLabel({ label, trainId, raceColor, size = "regular", cancelled = false, children }: { label?: string; trainId: string; raceColor?: string | null; size?: TrainLabelSize; cancelled?: boolean; children?: ReactNode }) {
  return <span className={`ds-train-label ds-train-label--${size} ${cancelled ? "is-cancelled" : ""}`.trim()} style={{ background: cancelled ? "var(--ds-border)" : trainColor(trainId, raceColor) }} aria-label={label}>{children ?? label}</span>;
}
