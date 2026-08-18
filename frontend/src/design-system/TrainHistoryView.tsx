import type { TrainHistory } from "../api/client";

type HistogramBin = { label: string; rangeStart: number | null; rangeEnd: number | null; percentage: number };

const histogramDefinitions = [
  { label: "0–5", start: 0, end: 6 },
  { label: "6–10", start: 6, end: 11 },
  { label: "11–15", start: 11, end: 16 },
  { label: "16–30", start: 16, end: 31 },
  { label: "31–60", start: 31, end: 60 },
  { label: ">60", start: 60, end: null },
] as const;

function addBucketToHistogram(source: { rangeStart: number | null; rangeEnd: number | null; percentage: number }, target: { start: number | null; end: number | null }) {
  const sourceStart = source.rangeStart ?? Number.NEGATIVE_INFINITY;
  const sourceEnd = source.rangeEnd ?? Number.POSITIVE_INFINITY;
  const targetStart = target.start ?? Number.NEGATIVE_INFINITY;
  const targetEnd = target.end ?? Number.POSITIVE_INFINITY;
  const sourceWidth = sourceEnd - sourceStart;
  if (!Number.isFinite(sourceWidth)) {
    const representative = source.rangeStart === null ? sourceEnd - 1 : sourceStart + 1;
    return representative >= targetStart && representative < targetEnd ? source.percentage : 0;
  }
  const overlap = Math.max(0, Math.min(sourceEnd, targetEnd) - Math.max(sourceStart, targetStart));
  return source.percentage * (overlap / sourceWidth);
}

function createHistogram(history: TrainHistory): HistogramBin[] {
  return histogramDefinitions.map((definition) => ({
    label: definition.label,
    rangeStart: definition.start,
    rangeEnd: definition.end,
    percentage: history.delayDistribution.reduce((total, source) => total + addBucketToHistogram(source, definition), 0),
  }));
}

export function getOnTimePercentage(history: TrainHistory) {
  return createHistogram(history)[0]?.percentage ?? 0;
}

export function TrainHistoryView({ history }: { history?: TrainHistory | null }) {
  if (!history) return <section className="train-history train-history--empty" aria-label="Historical performance"><span>Historical data unavailable</span></section>;

  const histogram = createHistogram(history);
  const maxPercentage = Math.max(25, Math.ceil(Math.max(...histogram.map((bin) => bin.percentage), 0) / 25) * 25);

  return <section className="train-history" aria-label="Historical delay distribution">
    <div className="train-history__histogram" role="img" aria-label={`Delay histogram: ${histogram.map((bin) => `${bin.label} minutes ${bin.percentage.toFixed(2)} percent`).join(", ")}`}>
      <div className="train-history__histogram-plot">
        <div className="train-history__histogram-bars">
          {histogram.map((bin, index) => <div className={`train-history__histogram-column${index === 0 ? " train-history__histogram-column--on-time" : ""}`} key={bin.label}>
            <span className="train-history__histogram-value">{bin.percentage.toFixed(1)}%</span>
            <span className="train-history__histogram-bar" style={{ height: `${(bin.percentage / maxPercentage) * 100}%` }} title={`${bin.label} minutes: ${bin.percentage.toFixed(2)}%`} />
            <span className="train-history__histogram-label">{bin.label}</span>
          </div>)}
        </div>
      </div>
    </div>
    <div className="train-history__histogram-axis-title">Delay (minutes)</div>
  </section>;
}
