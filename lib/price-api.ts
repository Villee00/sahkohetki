import { buildPriceHorizon } from "./price-domain";
import {
  EXPLORER_SOURCE,
  type ExplorerSource,
  type HorizonPoints,
  type PriceLevel,
  type PricePoint,
  type QuarterPrice,
} from "./price-types";
import {
  getHelsinkiDateBounds,
  getHelsinkiDateKey,
  getNextHelsinkiDateKey,
} from "./time";

export const PRICE_API_HORIZONS = ["today", "tomorrow"] as const;
export type PriceApiHorizon = (typeof PRICE_API_HORIZONS)[number];

export type PriceApiInterval = {
  id: string;
  startAt: string;
  endAt: string;
  priceCentsPerKwh: number;
  level: PriceLevel;
  carriedForward?: boolean;
};

export type PriceApiMissing = {
  granularity: "quarter-hour" | "hour";
  startAt: string;
  endAt: string;
  reason: "source-gap" | "incomplete-hour" | "not-published";
};

export type PriceApiResponse = {
  status: "complete" | "partial";
  timezone: "Europe/Helsinki";
  horizon: {
    name: PriceApiHorizon;
    date: string;
    startAt: string;
    endAt: string;
  };
  fetchedAt: string;
  pricing: {
    unit: "cents-per-kwh";
    currency: "EUR";
    vatIncluded: true;
    vatRate: 0.255;
  };
  current: {
    quarterHour: PriceApiInterval | null;
    hour: PriceApiInterval | null;
  };
  intervals: {
    quarterHour: PriceApiInterval[];
    hourly: PriceApiInterval[];
  };
  missing: PriceApiMissing[];
  source: ExplorerSource;
};

export type BuildPriceApiResponseInput = {
  quarterPrices: QuarterPrice[];
  now: Date;
  fetchedAt: string;
  horizon: PriceApiHorizon;
};

const QUARTER_MILLISECONDS = 15 * 60 * 1000;
const HOUR_MILLISECONDS = 60 * 60 * 1000;

function toApiInterval(point: PricePoint): PriceApiInterval | null {
  if (
    !point.available ||
    point.priceCentsPerKwh === null ||
    point.level === undefined
  ) {
    return null;
  }

  return {
    id: point.id,
    startAt: point.startAt,
    endAt: point.endAt,
    priceCentsPerKwh: point.priceCentsPerKwh,
    level: point.level,
    ...(point.carriedForward ? { carriedForward: true } : {}),
  };
}

function getMissingQuarterReason(
  point: PricePoint,
  availableStarts: readonly number[],
): PriceApiMissing["reason"] {
  const startMilliseconds = Date.parse(point.startAt);
  const hasAvailableBefore = availableStarts.some(
    (availableStart) => availableStart < startMilliseconds,
  );
  const hasAvailableAfter = availableStarts.some(
    (availableStart) => availableStart > startMilliseconds,
  );
  return hasAvailableBefore && hasAvailableAfter
    ? "source-gap"
    : "not-published";
}

function mapMissingIntervals(horizon: HorizonPoints): PriceApiMissing[] {
  const availableQuarterStarts = horizon.quarterHour
    .filter((point) => point.available)
    .map((point) => Date.parse(point.startAt));

  const missingQuarters = horizon.quarterHour
    .filter((point) => !point.available)
    .map((point) => ({
      granularity: "quarter-hour" as const,
      startAt: point.startAt,
      endAt: point.endAt,
      reason: getMissingQuarterReason(point, availableQuarterStarts),
    }));

  const missingHours = horizon.hourly
    .filter((point) => !point.available)
    .map((point) => {
      const hourStart = Date.parse(point.startAt);
      const hasAvailableQuarter = availableQuarterStarts.some(
        (quarterStart) =>
          quarterStart >= hourStart &&
          quarterStart < hourStart + HOUR_MILLISECONDS,
      );

      return {
        granularity: "hour" as const,
        startAt: point.startAt,
        endAt: point.endAt,
        reason: hasAvailableQuarter
          ? ("incomplete-hour" as const)
          : ("not-published" as const),
      };
    });

  return [...missingQuarters, ...missingHours];
}

function getCurrentInterval(
  points: PricePoint[],
  startMilliseconds: number,
): PriceApiInterval | null {
  const point = points.find(
    (candidate) => candidate.id === String(startMilliseconds),
  );
  return point ? toApiInterval(point) : null;
}

export function buildPriceApiResponse({
  quarterPrices,
  now,
  fetchedAt,
  horizon,
}: BuildPriceApiResponseInput): PriceApiResponse {
  const nowMilliseconds = now.getTime();
  if (!Number.isFinite(nowMilliseconds)) throw new RangeError("Invalid now instant.");

  const todayDate = getHelsinkiDateKey(now);
  const horizonDate =
    horizon === "today" ? todayDate : getNextHelsinkiDateKey(todayDate);
  const bounds = getHelsinkiDateBounds(horizonDate);
  const startMilliseconds = Date.parse(bounds.startAt);
  const endMilliseconds = Date.parse(bounds.endAt);
  const todayBounds = getHelsinkiDateBounds(todayDate);
  const todayStartMilliseconds = Date.parse(todayBounds.startAt);
  const todayEndMilliseconds = Date.parse(todayBounds.endAt);
  const today = buildPriceHorizon(
    quarterPrices,
    todayStartMilliseconds,
    todayEndMilliseconds,
  );
  const selectedHorizon =
    horizon === "today"
      ? today
      : buildPriceHorizon(quarterPrices, startMilliseconds, endMilliseconds);
  const currentQuarterStart =
    Math.floor(nowMilliseconds / QUARTER_MILLISECONDS) * QUARTER_MILLISECONDS;
  const currentHourStart =
    Math.floor(nowMilliseconds / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  const quarterHourIntervals = selectedHorizon.quarterHour
    .map(toApiInterval)
    .filter((interval): interval is PriceApiInterval => interval !== null);
  const hourlyIntervals = selectedHorizon.hourly
    .map(toApiInterval)
    .filter((interval): interval is PriceApiInterval => interval !== null);
  const missing = mapMissingIntervals(selectedHorizon);

  return {
    status: missing.length > 0 ? "partial" : "complete",
    timezone: "Europe/Helsinki",
    horizon: {
      name: horizon,
      date: horizonDate,
      startAt: bounds.startAt,
      endAt: bounds.endAt,
    },
    fetchedAt,
    pricing: {
      unit: "cents-per-kwh",
      currency: "EUR",
      vatIncluded: true,
      vatRate: 0.255,
    },
    current: {
      quarterHour: getCurrentInterval(
        today.quarterHour,
        currentQuarterStart,
      ),
      hour: getCurrentInterval(today.hourly, currentHourStart),
    },
    intervals: {
      quarterHour: quarterHourIntervals,
      hourly: hourlyIntervals,
    },
    missing,
    source: { ...EXPLORER_SOURCE },
  };
}
