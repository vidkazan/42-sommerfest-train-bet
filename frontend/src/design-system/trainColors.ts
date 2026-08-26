import type { CSSProperties } from "react";

const fallbackTrainColors = ["#347DE0", "#F75056", "#F97316", "#FFBB00", "#0F9663", "#E664E6", "#8B5CF6", "#30D1B9"];

export function trainColor(trainId: string | number | null | undefined, persistedColor?: string | null) {
  const color = persistedColor?.trim();
  if (color) return `color-mix(in srgb, ${color} 68%, #000)`;
  const normalizedTrainId = String(trainId ?? "");
  const hash = [...normalizedTrainId].reduce((value, character) => value + character.charCodeAt(0), 0);
  return `color-mix(in srgb, ${fallbackTrainColors[hash % fallbackTrainColors.length]} 68%, #000)`;
}

export function buildTrainColorMap(entries: Array<{ trainId: string; raceColor?: string | null }>) {
  const result = new Map<string, string>();
  for (const entry of [...entries].sort((left, right) => String(left.trainId).localeCompare(String(right.trainId)))) {
    const trainId = String(entry.trainId ?? "");
    result.set(trainId, trainColor(trainId, entry.raceColor));
  }
  return result;
}

export function trainColorStyle(color: string): CSSProperties {
  return { background: color };
}
