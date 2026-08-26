import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type DelaySnapshot = { delayMinutes: number; recordedAt: string };

const SAMPLE_OFFSETS_MINUTES = [30, 25, 20, 15, 10, 5, 0];

function formatDelay(minutes: number) {
  return `${minutes >= 0 ? "+" : "−"}${Math.abs(minutes)}min`;
}

function sampleHistory(history: DelaySnapshot[], now: number) {
  return SAMPLE_OFFSETS_MINUTES.map((offset) => {
    const cutoff = now - offset * 60_000;
    const candidates = history.filter((snapshot) => Date.parse(snapshot.recordedAt) <= cutoff);
    return candidates[candidates.length - 1];
  }).filter((snapshot): snapshot is DelaySnapshot => snapshot !== undefined);
}

export function DelaySparkline({ history, trainId, trainLabel, now }: { history?: DelaySnapshot[]; trainId?: string; trainLabel: string; now: number }) {
  const [tipOpen, setTipOpen] = useState(false);
  useEffect(() => {
    if (!tipOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setTipOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [tipOpen]);
  const samples = sampleHistory(history ?? [], now);
  if (samples.length < 2) return null;

  const values = samples.map((snapshot) => snapshot.delayMinutes);
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const maximumAbsoluteDelay = Math.max(1, ...values.map((value) => Math.abs(value)));
  const baseline = values.some((value) => value < 0) ? 12 : 22;
  const barWidth = 8;
  const bars = values.map((value, index) => {
    const height = Math.max(1.5, (Math.abs(value) / maximumAbsoluteDelay) * 20);
    const x = 2 + index * 10;
    const y = value < 0 ? baseline : baseline - height;
    return { height, x, y };
  });
  const direction = last > first ? "is-increasing" : last < first ? "is-decreasing" : "is-steady";
  const description = last > first ? "increased" : last < first ? "decreased" : "stayed stable";
  const accessibleLabel = `Delay history for ${trainLabel}: ${description} from ${formatDelay(first)} to ${formatDelay(last)} over the last 30 minutes`;
  const dialogId = `delay-history-title-${String(trainId ?? trainLabel ?? "train").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const chart = (className: string) => <svg className={`admin-race-row__sparkline ${className}`.trim()} viewBox="0 0 72 24" aria-hidden="true" focusable="false">
    {bars.map((bar, index) => <rect key={index} x={bar.x} y={bar.y} width={barWidth} height={bar.height} rx="1" />)}
  </svg>;

  return <span className="admin-race-row__sparkline-wrap">
    <button type="button" className={`admin-race-row__sparkline-button ${direction}`} aria-label={`Explain delay history for ${trainLabel}`} aria-expanded={tipOpen} title="Explain delay history" onClick={(event) => { event.stopPropagation(); setTipOpen((open) => !open); }}>
      {chart("")}
    </button>
    {tipOpen && createPortal(<dialog className="train-detail-dialog" open aria-labelledby={dialogId} onClick={(event) => { if (event.target === event.currentTarget) setTipOpen(false); }}>
      <section className="train-detail-dialog__panel admin-race-row__sparkline-dialog-panel">
        <header className="train-detail-dialog__header">
          <h2 id={dialogId}>{trainLabel} delay history</h2>
          <button type="button" className="train-detail-dialog__close" onClick={() => setTipOpen(false)} aria-label="Close delay history">×</button>
        </header>
        <div className="admin-race-row__sparkline-dialog-chart">{chart("admin-race-row__sparkline--dialog")}</div>
        <p className="admin-race-row__sparkline-dialog-copy">Each column shows the train’s delay at a five-minute interval. The chart covers the last 30 minutes; taller columns mean a larger delay.</p>
        <p className="admin-race-row__sparkline-dialog-meta">From {formatDelay(first)} to {formatDelay(last)} · {samples.length} snapshots shown</p>
      </section>
    </dialog>, document.body)}
  </span>;
}
