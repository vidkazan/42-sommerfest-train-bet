import type { CSSProperties } from "react";

export function trainColor(trainId: string, persistedColor?: string | null) {
  void trainId;
  const color = persistedColor?.trim();
  return color ? `color-mix(in srgb, ${color} 68%, #000)` : "var(--ds-map-train)";
}

export function buildTrainColorMap(entries: Array<{ trainId: string; raceColor?: string | null }>) {
  const result = new Map<string, string>();
  for (const entry of [...entries].sort((left, right) => left.trainId.localeCompare(right.trainId))) {
    result.set(entry.trainId, trainColor(entry.trainId, entry.raceColor));
  }
  return result;
}

export function trainColorStyle(color: string): CSSProperties {
  return { background: color };
}
