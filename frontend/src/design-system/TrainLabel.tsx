import type { MouseEventHandler, ReactNode } from "react";
import { trainColor } from "./trainColors";

export type TrainLabelSize = "compact" | "regular" | "medium" | "large";

export function gameNameEmoji(gameName?: string | null) {
  return gameName?.match(/\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?/u)?.[0] ?? null;
}

export function TrainLabel({ label, gameName, trainId, raceColor, size = "regular", cancelled = false, children }: { label?: string; gameName?: string | null; trainId: string | number | null | undefined; raceColor?: string | null; size?: TrainLabelSize; cancelled?: boolean; children?: ReactNode }) {
  const emoji = gameNameEmoji(gameName);
  const displayLabel = emoji ? `${emoji} ${label ?? ""}` : label;
  return <span className={`ds-train-label ds-train-label--${size} ${cancelled ? "is-cancelled" : ""}`.trim()} style={{ background: cancelled ? "var(--ds-border)" : trainColor(trainId, raceColor) }} aria-label={displayLabel}>{children ?? displayLabel}</span>;
}

export function TrainLabelButton({ label, gameName, trainId, raceColor, cancelled = false, onClick }: { label?: string; gameName?: string | null; trainId: string | number | null | undefined; raceColor?: string | null; cancelled?: boolean; onClick: MouseEventHandler<HTMLButtonElement> }) {
  const emoji = gameNameEmoji(gameName);
  return <button type="button" className="ds-train-label-button" onClick={(event) => { event.stopPropagation(); onClick(event); }} aria-label={`Open details for ${emoji ? `${emoji} ` : ""}${label ?? "train"}`}><TrainLabel label={label} gameName={gameName} trainId={trainId} raceColor={raceColor} size="compact" cancelled={cancelled} /></button>;
}
