import type { TrainHistory } from "./api/client";

const percentileRanks = (values: Array<number | null>) => {
  const valid = values
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((left, right) => left - right);

  return values.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || valid.length === 0) return null;
    const lower = valid.filter((candidate) => candidate < value).length;
    const equal = valid.filter((candidate) => candidate === value).length;
    return (lower + (equal + 1) / 2) / valid.length;
  });
};

const starsForRanks = (values: Array<number | null>) => percentileRanks(values)
  .map((percentile) => percentile === null ? null : Math.max(1, Math.min(5, Math.ceil(percentile * 5))));

export function applyHistoryRatings(histories: Array<TrainHistory | null>, durations: Array<number | null> = []) {
  const delayStars = starsForRanks(histories.map((history) => history?.averageDelayMinutes ?? null));
  const chaosStars = starsForRanks(histories.map((history) => history?.chaosSpreadMinutes ?? null));
  const durationStars = starsForRanks(histories.map((_history, index) => durations[index] ?? null));
  const disaster30Ranks = percentileRanks(histories.map((history) => history?.disaster30Percentage ?? null));
  const disaster60Ranks = percentileRanks(histories.map((history) => history?.disaster60Percentage ?? null));
  const disasterScores = histories.map((_history, index) => {
    const disaster30 = disaster30Ranks[index];
    const disaster60 = disaster60Ranks[index];
    return disaster30 === null || disaster60 === null ? null : 0.6 * disaster30 + 0.4 * disaster60;
  });
  const disasterStars = starsForRanks(disasterScores);
  const cancellationStars = starsForRanks(histories.map((history) => history?.cancellationRatePercentage ?? null));

  return histories.map((history, index) => history ? {
    ...history,
    delayStars: delayStars[index],
    chaosStars: chaosStars[index],
    durationStars: durationStars[index],
    disasterStars: disasterStars[index],
    cancellationStars: cancellationStars[index],
  } : null);
}
