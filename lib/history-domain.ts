import type { MarketPriceInterval } from "./entsoe-prices";
import { FINNISH_GENERAL_VAT_RATE } from "./entsoe-prices";
import { EXPLORER_SOURCE, PRICE_LEVEL_CUTOFFS } from "./price-types";
import { getHelsinkiDateBounds, getHelsinkiDateKey } from "./time";
import type {
  HistoryAverage,
  HistoryDayCell,
  HistoryGranularity,
  HistoryPageData,
  HistoryPercentileBand,
  HistoryPeriodSummary,
  PercentileDistribution,
} from "./history-types";

const MINUTE_MILLISECONDS = 60 * 1000;
const HOUR_MILLISECONDS = 60 * MINUTE_MILLISECONDS;

type BuildHistoryPageDataInput = {
  intervals: readonly MarketPriceInterval[];
  throughDateKey: string;
  fetchedAt: string | null;
  status?: HistoryPageData["status"];
  message?: string;
  requestedRange?: HistoryPageData["requestedRange"];
  missingRanges?: HistoryPageData["missingRanges"];
};

type RangeSummary = {
  expectedMinutes: number;
  average: HistoryAverage;
  negativePricePercent: number;
  longestExpensiveStreakHours: number;
};

function parseDateKey(dateKey: string): Date {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) {
    throw new RangeError(`Invalid date key: ${dateKey}`);
  }
  return date;
}

function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function previousMonth(monthKey: string): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function lastDateOfMonth(monthKey: string): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function firstDateOfIsoWeek(dateKey: string): string {
  const weekday = parseDateKey(dateKey).getUTCDay();
  return addDays(dateKey, -(weekday === 0 ? 6 : weekday - 1));
}

function dateRange(startDateKey: string, endDateKey: string): string[] {
  const dates: string[] = [];
  for (
    let dateKey = startDateKey;
    dateKey <= endDateKey;
    dateKey = addDays(dateKey, 1)
  ) {
    dates.push(dateKey);
  }
  return dates;
}

function householdPrice(rawEurPerMwh: number): number {
  return (rawEurPerMwh / 10) * (1 + FINNISH_GENERAL_VAT_RATE);
}

function intervalsInside(
  intervals: readonly MarketPriceInterval[],
  start: number,
  end: number,
): MarketPriceInterval[] {
  return intervals.filter((interval) => {
    const intervalStart = Date.parse(interval.startAt);
    const intervalEnd = Date.parse(interval.endAt);
    return intervalStart >= start && intervalEnd <= end;
  });
}

function summarizeRange(
  intervals: readonly MarketPriceInterval[],
  start: number,
  end: number,
): RangeSummary | null {
  const sorted = intervalsInside(intervals, start, end).sort(
    (left, right) => Date.parse(left.startAt) - Date.parse(right.startAt),
  );
  let cursor = start;
  let weightedRaw = 0;
  let negativeMinutes = 0;
  for (const interval of sorted) {
    const intervalStart = Date.parse(interval.startAt);
    const intervalEnd = Date.parse(interval.endAt);
    if (
      intervalStart !== cursor ||
      !Number.isFinite(intervalEnd) ||
      intervalEnd <= intervalStart
    ) {
      return null;
    }
    const minutes = (intervalEnd - intervalStart) / MINUTE_MILLISECONDS;
    weightedRaw += interval.priceEurPerMwh * minutes;
    if (interval.priceEurPerMwh < 0) negativeMinutes += minutes;
    cursor = intervalEnd;
  }
  if (cursor !== end) return null;

  const expectedMinutes = (end - start) / MINUTE_MILLISECONDS;
  const rawAverage = weightedRaw / expectedMinutes;
  let currentStreak = 0;
  let longestStreak = 0;
  for (let hourStart = start; hourStart < end; hourStart += HOUR_MILLISECONDS) {
    const hourEnd = Math.min(hourStart + HOUR_MILLISECONDS, end);
    const hourIntervals = intervalsInside(sorted, hourStart, hourEnd);
    let hourCursor = hourStart;
    let hourWeightedRaw = 0;
    for (const interval of hourIntervals) {
      const intervalStart = Date.parse(interval.startAt);
      const intervalEnd = Date.parse(interval.endAt);
      if (intervalStart !== hourCursor) {
        hourCursor = -1;
        break;
      }
      hourWeightedRaw +=
        interval.priceEurPerMwh *
        ((intervalEnd - intervalStart) / MINUTE_MILLISECONDS);
      hourCursor = intervalEnd;
    }
    const hourMinutes = (hourEnd - hourStart) / MINUTE_MILLISECONDS;
    const expensive =
      hourCursor === hourEnd &&
      householdPrice(hourWeightedRaw / hourMinutes) >
        PRICE_LEVEL_CUTOFFS.normalMaxCents;
    currentStreak = expensive ? currentStreak + 1 : 0;
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  return {
    expectedMinutes,
    average: {
      rawEurPerMwh: rawAverage,
      householdCentsPerKwh: householdPrice(rawAverage),
    },
    negativePricePercent: (negativeMinutes / expectedMinutes) * 100,
    longestExpensiveStreakHours: longestStreak,
  };
}

function percentile(sortedValues: readonly number[], percentileValue: number): number | null {
  if (sortedValues.length === 0) return null;
  const index = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function distribution(values: readonly number[]): PercentileDistribution {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
  };
}

function percentileRank(values: readonly number[], selected: number): number {
  if (values.length === 0) return 0;
  return (
    (values.filter((value) => value <= selected).length / values.length) * 100
  );
}

function percentileBand(rank: number): HistoryPercentileBand {
  if (rank <= 10) return "very-low";
  if (rank <= 25) return "low";
  if (rank < 75) return "typical";
  if (rank <= 90) return "high";
  return "very-high";
}

function emptyRanks(): Pick<
  HistoryPeriodSummary,
  "percentileRank" | "percentileBand"
> {
  return {
    percentileRank: { raw: 0, household: 0 },
    percentileBand: { raw: "typical", household: "typical" },
  };
}

function periodSummary(
  intervals: readonly MarketPriceInterval[],
  granularity: HistoryGranularity,
  idKey: string,
  startDateKey: string,
  endDateKey: string,
  previousId: string,
): HistoryPeriodSummary | null {
  const start = Date.parse(getHelsinkiDateBounds(startDateKey).startAt);
  const end = Date.parse(getHelsinkiDateBounds(endDateKey).endAt);
  const summary = summarizeRange(intervals, start, end);
  if (!summary) return null;
  return {
    id: `${granularity}:${idKey}`,
    granularity,
    startDateKey,
    endDateKey,
    ...summary,
    previousId,
    ...emptyRanks(),
  };
}

function attachPercentiles(
  periods: HistoryPeriodSummary[],
): {
  periods: HistoryPeriodSummary[];
  rawEurPerMwh: PercentileDistribution;
  householdCentsPerKwh: PercentileDistribution;
} {
  const raw = periods.map((period) => period.average.rawEurPerMwh);
  const household = periods.map(
    (period) => period.average.householdCentsPerKwh,
  );
  return {
    periods: periods.map((period) => {
      const rawRank = percentileRank(raw, period.average.rawEurPerMwh);
      const householdRank = percentileRank(
        household,
        period.average.householdCentsPerKwh,
      );
      return {
        ...period,
        previousId: periods.some((candidate) => candidate.id === period.previousId)
          ? period.previousId
          : null,
        percentileRank: { raw: rawRank, household: householdRank },
        percentileBand: {
          raw: percentileBand(rawRank),
          household: percentileBand(householdRank),
        },
      };
    }),
    rawEurPerMwh: distribution(raw),
    householdCentsPerKwh: distribution(household),
  };
}

export function buildHistoryPageData({
  intervals,
  throughDateKey,
  fetchedAt,
  status = "ready",
  message,
  requestedRange,
  missingRanges = [],
}: BuildHistoryPageDataInput): HistoryPageData {
  const sortedIntervals = [...intervals].sort(
    (left, right) => Date.parse(left.startAt) - Date.parse(right.startAt),
  );
  const firstDateKey = sortedIntervals[0]
    ? getHelsinkiDateKey(sortedIntervals[0].startAt)
    : null;
  const days: HistoryDayCell[] = firstDateKey
    ? dateRange(firstDateKey, throughDateKey).map((dateKey) => {
        const bounds = getHelsinkiDateBounds(dateKey);
        const start = Date.parse(bounds.startAt);
        const end = Date.parse(bounds.endAt);
        const summary = summarizeRange(sortedIntervals, start, end);
        return {
          dateKey,
          complete: summary !== null,
          expectedMinutes: (end - start) / MINUTE_MILLISECONDS,
          average: summary?.average ?? null,
        };
      })
    : [];

  const dayPeriods = days.flatMap((day) => {
    if (!day.complete) return [];
    const previousDate = addDays(day.dateKey, -1);
    const summary = periodSummary(
      sortedIntervals,
      "day",
      day.dateKey,
      day.dateKey,
      day.dateKey,
      `day:${previousDate}`,
    );
    return summary ? [summary] : [];
  });

  const weekStarts = [...new Set(days.map((day) => firstDateOfIsoWeek(day.dateKey)))];
  const weekPeriods = weekStarts.flatMap((startDateKey) => {
    const endDateKey = addDays(startDateKey, 6);
    if (endDateKey > throughDateKey) return [];
    const previousStart = addDays(startDateKey, -7);
    const summary = periodSummary(
      sortedIntervals,
      "week",
      startDateKey,
      startDateKey,
      endDateKey,
      `week:${previousStart}`,
    );
    return summary ? [summary] : [];
  });

  const monthKeys = [...new Set(days.map((day) => day.dateKey.slice(0, 7)))];
  const monthPeriods = monthKeys.flatMap((monthKey) => {
    const startDateKey = `${monthKey}-01`;
    const endDateKey = lastDateOfMonth(monthKey);
    if (endDateKey > throughDateKey) return [];
    const summary = periodSummary(
      sortedIntervals,
      "month",
      monthKey,
      startDateKey,
      endDateKey,
      `month:${previousMonth(monthKey)}`,
    );
    return summary ? [summary] : [];
  });

  const dayResult = attachPercentiles(dayPeriods);
  const weekResult = attachPercentiles(weekPeriods);
  const monthResult = attachPercentiles(monthPeriods);
  const availableDays = days.filter((day) => day.complete);

  return {
    status,
    ...(message ? { message } : {}),
    fetchedAt,
    requestedRange:
      requestedRange ??
      (firstDateKey
        ? { startDateKey: firstDateKey, endDateKey: throughDateKey }
        : null),
    availableRange:
      availableDays.length > 0
        ? {
            startDateKey: availableDays[0].dateKey,
            endDateKey: availableDays.at(-1)!.dateKey,
          }
        : null,
    missingRanges,
    source: { ...EXPLORER_SOURCE },
    days,
    periods: {
      day: dayResult.periods,
      week: weekResult.periods,
      month: monthResult.periods,
    },
    distributions: {
      day: {
        rawEurPerMwh: dayResult.rawEurPerMwh,
        householdCentsPerKwh: dayResult.householdCentsPerKwh,
      },
      week: {
        rawEurPerMwh: weekResult.rawEurPerMwh,
        householdCentsPerKwh: weekResult.householdCentsPerKwh,
      },
      month: {
        rawEurPerMwh: monthResult.rawEurPerMwh,
        householdCentsPerKwh: monthResult.householdCentsPerKwh,
      },
    },
  };
}
