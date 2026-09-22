import { formatIntervalLabel } from "./time";
import type {
  CoreForecastSeries,
  ForecastBalanceKind,
  ForecastGranularity,
  ForecastInterval,
  ForecastObservation,
  ForecastSeries,
  ForecastSeriesResult,
  MissingForecastInterval,
} from "./forecast-types";

const QUARTER_MILLISECONDS = 15 * 60 * 1000;
const HOUR_MILLISECONDS = 60 * 60 * 1000;
const HORIZON_HOURS = 72;
const QUARTERS_PER_HOUR = 4;

const FORECAST_SERIES: readonly ForecastSeries[] = [
  "production",
  "consumption",
  "wind",
  "solar",
  "windCapacity",
  "solarCapacity",
];

type ForecastValues = Pick<
  ForecastInterval,
  | "productionMw"
  | "consumptionMw"
  | "windMw"
  | "solarMw"
  | "windCapacityMw"
  | "solarCapacityMw"
>;

function toMilliseconds(value: string): number | null {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function canonicalTimestamp(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function isQuarterBoundary(milliseconds: number): boolean {
  return milliseconds % QUARTER_MILLISECONDS === 0;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageComplete(
  values: readonly (number | null)[],
): number | null {
  return values.length === QUARTERS_PER_HOUR &&
    values.every((value): value is number => value !== null && Number.isFinite(value))
    ? average(values)
    : null;
}

function calculateUtilization(
  outputMw: number | null,
  capacityMw: number | null,
): number | null {
  if (
    outputMw === null ||
    capacityMw === null ||
    !Number.isFinite(outputMw) ||
    !Number.isFinite(capacityMw) ||
    capacityMw <= 0
  ) {
    return null;
  }
  return (outputMw / capacityMw) * 100;
}

function getBalanceKind(balanceMw: number): ForecastBalanceKind {
  if (balanceMw > 0) return "domestic-surplus";
  if (balanceMw < 0) return "domestic-deficit";
  return "balanced";
}

function buildInterval(
  granularity: ForecastGranularity,
  startMilliseconds: number,
  endMilliseconds: number,
  values: ForecastValues,
): ForecastInterval {
  const available =
    values.productionMw !== null && values.consumptionMw !== null;
  const domesticBalanceMw = available
    ? values.productionMw! - values.consumptionMw!
    : null;
  const domesticCoveragePercent =
    available && values.consumptionMw! > 0
      ? (values.productionMw! / values.consumptionMw!) * 100
      : null;
  const startAt = canonicalTimestamp(startMilliseconds);
  const endAt = canonicalTimestamp(endMilliseconds);

  return {
    id: startAt,
    granularity,
    startAt,
    endAt,
    label: formatIntervalLabel(startAt, endAt),
    available,
    ...values,
    domesticBalanceMw,
    domesticBalanceKind:
      domesticBalanceMw === null ? null : getBalanceKind(domesticBalanceMw),
    domesticCoveragePercent,
    windCapacityUtilizationPercent: calculateUtilization(
      values.windMw,
      values.windCapacityMw,
    ),
    solarCapacityUtilizationPercent: calculateUtilization(
      values.solarMw,
      values.solarCapacityMw,
    ),
  };
}

function missingCoreSeries(interval: ForecastInterval): CoreForecastSeries[] {
  const missing: CoreForecastSeries[] = [];
  if (interval.productionMw === null) missing.push("production");
  if (interval.consumptionMw === null) missing.push("consumption");
  return missing;
}

function missingRecord(
  interval: ForecastInterval,
): MissingForecastInterval | null {
  const missingSeries = missingCoreSeries(interval);
  return missingSeries.length === 0
    ? null
    : {
        granularity: interval.granularity,
        startAt: interval.startAt,
        endAt: interval.endAt,
        missingSeries,
      };
}

function getValidInterval(
  observation: ForecastObservation,
): { startMilliseconds: number; endMilliseconds: number } | null {
  if (
    !FORECAST_SERIES.includes(observation.series) ||
    !Number.isFinite(observation.valueMw)
  ) {
    return null;
  }

  const startMilliseconds = toMilliseconds(observation.startAt);
  const endMilliseconds = toMilliseconds(observation.endAt);
  if (
    startMilliseconds === null ||
    endMilliseconds === null ||
    !isQuarterBoundary(startMilliseconds) ||
    !isQuarterBoundary(endMilliseconds) ||
    endMilliseconds <= startMilliseconds ||
    (endMilliseconds - startMilliseconds) % QUARTER_MILLISECONDS !== 0
  ) {
    return null;
  }

  if (
    (observation.series === "production" ||
      observation.series === "consumption") &&
    endMilliseconds - startMilliseconds !== QUARTER_MILLISECONDS
  ) {
    return null;
  }

  return { startMilliseconds, endMilliseconds };
}

function indexObservations(
  observations: readonly ForecastObservation[],
  horizonStartMilliseconds: number,
  horizonEndMilliseconds: number,
): Record<ForecastSeries, Map<number, number>> {
  const index: Record<ForecastSeries, Map<number, number>> = {
    production: new Map(),
    consumption: new Map(),
    wind: new Map(),
    solar: new Map(),
    windCapacity: new Map(),
    solarCapacity: new Map(),
  };

  for (const observation of observations) {
    const interval = getValidInterval(observation);
    if (!interval) continue;

    const firstQuarter = Math.max(
      interval.startMilliseconds,
      horizonStartMilliseconds,
    );
    const lastQuarterEnd = Math.min(
      interval.endMilliseconds,
      horizonEndMilliseconds,
    );
    for (
      let quarterStart = firstQuarter;
      quarterStart + QUARTER_MILLISECONDS <= lastQuarterEnd;
      quarterStart += QUARTER_MILLISECONDS
    ) {
      index[observation.series].set(quarterStart, observation.valueMw);
    }
  }

  return index;
}

function intervalValue(
  interval: ForecastInterval,
  series: ForecastSeries,
): number | null {
  switch (series) {
    case "production":
      return interval.productionMw;
    case "consumption":
      return interval.consumptionMw;
    case "wind":
      return interval.windMw;
    case "solar":
      return interval.solarMw;
    case "windCapacity":
      return interval.windCapacityMw;
    case "solarCapacity":
      return interval.solarCapacityMw;
  }
}

function aggregateSeries(
  quarters: readonly ForecastInterval[],
  series: ForecastSeries,
): number | null {
  return averageComplete(quarters.map((quarter) => intervalValue(quarter, series)));
}

export function aggregateForecastHours(
  quarterHours: readonly ForecastInterval[],
): ForecastInterval[] {
  if (quarterHours.length === 0) return [];

  const byStart = new Map<number, ForecastInterval>();
  let earliestStart = Number.POSITIVE_INFINITY;
  let latestEnd = Number.NEGATIVE_INFINITY;

  for (const quarter of quarterHours) {
    const startMilliseconds = toMilliseconds(quarter.startAt);
    const endMilliseconds = toMilliseconds(quarter.endAt);
    if (
      startMilliseconds === null ||
      endMilliseconds === null ||
      !isQuarterBoundary(startMilliseconds) ||
      endMilliseconds - startMilliseconds !== QUARTER_MILLISECONDS
    ) {
      continue;
    }
    byStart.set(startMilliseconds, quarter);
    earliestStart = Math.min(earliestStart, startMilliseconds);
    latestEnd = Math.max(latestEnd, endMilliseconds);
  }

  if (!Number.isFinite(earliestStart) || !Number.isFinite(latestEnd)) return [];

  const firstHourStart = Math.floor(earliestStart / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  const hourCount = Math.ceil((latestEnd - firstHourStart) / HOUR_MILLISECONDS);
  const hours: ForecastInterval[] = [];

  for (let hourIndex = 0; hourIndex < hourCount; hourIndex += 1) {
    const hourStart = firstHourStart + hourIndex * HOUR_MILLISECONDS;
    const expectedQuarters = Array.from(
      { length: QUARTERS_PER_HOUR },
      (_, quarterIndex) =>
        byStart.get(hourStart + quarterIndex * QUARTER_MILLISECONDS),
    );
    const presentQuarters = expectedQuarters.filter(
      (quarter): quarter is ForecastInterval => quarter !== undefined,
    );
    const complete = presentQuarters.length === QUARTERS_PER_HOUR;

    const values: ForecastValues = {
      productionMw: complete
        ? aggregateSeries(presentQuarters, "production")
        : null,
      consumptionMw: complete
        ? aggregateSeries(presentQuarters, "consumption")
        : null,
      windMw: complete ? aggregateSeries(presentQuarters, "wind") : null,
      solarMw: complete ? aggregateSeries(presentQuarters, "solar") : null,
      windCapacityMw: complete
        ? aggregateSeries(presentQuarters, "windCapacity")
        : null,
      solarCapacityMw: complete
        ? aggregateSeries(presentQuarters, "solarCapacity")
        : null,
    };

    hours.push(
      buildInterval("hour", hourStart, hourStart + HOUR_MILLISECONDS, values),
    );
  }

  return hours;
}

export function buildForecastSeries(
  observations: readonly ForecastObservation[],
  now: Date,
): ForecastSeriesResult {
  const nowMilliseconds = now.getTime();
  if (!Number.isFinite(nowMilliseconds)) {
    throw new RangeError("A valid current instant is required.");
  }

  const horizonStartMilliseconds =
    Math.floor(nowMilliseconds / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  const horizonEndMilliseconds =
    horizonStartMilliseconds + HORIZON_HOURS * HOUR_MILLISECONDS;
  const index = indexObservations(
    observations,
    horizonStartMilliseconds,
    horizonEndMilliseconds,
  );
  const quarterHour: ForecastInterval[] = [];

  for (
    let startMilliseconds = horizonStartMilliseconds;
    startMilliseconds < horizonEndMilliseconds;
    startMilliseconds += QUARTER_MILLISECONDS
  ) {
    quarterHour.push(
      buildInterval(
        "quarter-hour",
        startMilliseconds,
        startMilliseconds + QUARTER_MILLISECONDS,
        {
          productionMw: index.production.get(startMilliseconds) ?? null,
          consumptionMw: index.consumption.get(startMilliseconds) ?? null,
          windMw: index.wind.get(startMilliseconds) ?? null,
          solarMw: index.solar.get(startMilliseconds) ?? null,
          windCapacityMw: index.windCapacity.get(startMilliseconds) ?? null,
          solarCapacityMw: index.solarCapacity.get(startMilliseconds) ?? null,
        },
      ),
    );
  }

  const hourly = aggregateForecastHours(quarterHour);
  const missingIntervals = [...quarterHour, ...hourly]
    .map(missingRecord)
    .filter((record): record is MissingForecastInterval => record !== null);

  return {
    horizon: {
      startAt: canonicalTimestamp(horizonStartMilliseconds),
      endAt: canonicalTimestamp(horizonEndMilliseconds),
      durationHours: HORIZON_HOURS,
    },
    quarterHour,
    hourly,
    missingIntervals,
  };
}
