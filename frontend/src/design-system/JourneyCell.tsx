import type { Journey } from "../api/client";
import { JourneyCard } from "./JourneyCard";

export type JourneyCellMode = "public" | "admin";
export type JourneyCellProps = {
  journey: Journey;
  mode?: JourneyCellMode;
  selected?: boolean;
  disabled?: boolean;
  showCheckbox?: boolean;
  actionLabel?: string;
  onSelect?: (journey: Journey) => void;
  onToggle?: (journey: Journey) => void;
  className?: string;
};

export function JourneyCell({ journey, mode = "public", selected = false, disabled = false, showCheckbox = mode === "admin", actionLabel, onSelect, onToggle, className = "" }: JourneyCellProps) {
  return <JourneyCard journey={journey} mode={mode} selected={selected} disabled={disabled} showCheckbox={showCheckbox} actionLabel={actionLabel} onSelect={onSelect} onToggle={onToggle} className={className} />;
}
