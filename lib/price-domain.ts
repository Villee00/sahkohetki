import { EVERYDAY_USES } from "./appliances";
import {
  formatIntervalLabel,
  getHelsinkiDateBounds,
  getHelsinkiDateKey,
  getNextHelsinkiDateKey,
} from "./time";
import type {
  CostComparison,
  CostEstimate,
  ExplorerData,
  HorizonPoints,
  PriceLevel,
  PricePoint,
  QuarterPrice,
} from "./price-types";
import type { EverydayUseId } from "./appliances";

const QUARTER_MILLISECONDS = 15 * 60 * 1000;
const HOUR_MILLISECONDS = 60 * 60 * 1000;

type ParsePricePayloadSuccess = {
  ok: true;
  prices: QuarterPrice[];
};

type ParsePricePayloadFailure = {
  ok: false;
  message: string;
};

export type ParsePricePayloadResult =
  | ParsePricePayloadSuccess
  | ParsePricePayloadFailure;

type IsoTimestampParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

function parseIsoTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;

  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) return undefined;

  const parts: IsoTimestampParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
  };

  const daysInMonth = [
    31,
    parts.year % 4 === 0 &&
    (parts.year % 100 !== 0 || parts.year % 400 === 0)
      ? 29
      : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > daysInMonth[parts.month - 1] ||
    parts.hour > 23 ||
    parts.minute > 59 ||
    parts.second > 59
  ) {
    return undefined;
  }

  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

function canonicalTimestamp(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePricePayload(payload: unknown): ParsePricePayloadResult {
  if (!isRecord(payload) || !Array.isArray(payload.prices) || payload.prices.length === 0) {
    return { ok: false, message: "Price payload must contain a non-empty prices array." };
  }

  const normalized: Array<{ price: QuarterPrice; startMilliseconds: number; index: number }> = [];

  for (const [index, source] of payload.prices.entries()) {
    if (!isRecord(source)) {
      return { ok: false, message: `Price record ${index} is not an object.` };
    }

    if (typeof source.price !== "number" || !Number.isFinite(source.price)) {
      return { ok: false, message: `Price record ${index} has a non-finite numeric price.` };
    }

    const startMilliseconds = parseIsoTimestamp(source.startDate);
    const endMilliseconds = parseIsoTimestamp(source.endDate);
    if (startMilliseconds === undefined || endMilliseconds === undefined) {
      return { ok: false, message: `Price record ${index} has invalid ISO timestamps.` };
    }

    if (
      startMilliseconds % QUARTER_MILLISECONDS !== 0 ||
      endMilliseconds - startMilliseconds !== QUARTER_MILLISECONDS
    ) {
      return { ok: false, message: `Price record ${index} is not a 15-minute interval.` };
    }

    normalized.push({
      price: {
        id: String(startMilliseconds),
        startAt: canonicalTimestamp(startMilliseconds),
        endAt: canonicalTimestamp(endMilliseconds),
        priceCentsPerKwh: source.price,
      },
      startMilliseconds,
      index,
    });
  }

  normalized.sort(
    (left, right) =>
      left.startMilliseconds - right.startMilliseconds || left.index - right.index,
  );

  return { ok: true, prices: normalized.map(({ price }) => price) };
}

export function calculateUseCost(
  consumptionKwh: number,
  priceCentsPerKwh: number,
): CostEstimate {
  const cents = consumptionKwh * priceCentsPerKwh;
  const euros = cents / 100;
  return {
    cents,
    euros,
    centsLabel: cents.toFixed(2),
    eurosLabel: euros.toFixed(2),
  };
}

function unavailableHourlyPoint(hourStartMilliseconds: number): PricePoint {
  const startAt = canonicalTimestamp(hourStartMilliseconds);
  const endMilliseconds = hourStartMilliseconds + 4 * QUARTER_MILLISECONDS;
  return {
    id: String(hourStartMilliseconds),
    startAt,
    endAt: canonicalTimestamp(endMilliseconds),
    label: formatIntervalLabel(startAt, canonicalTimestamp(endMilliseconds)),
    priceCentsPerKwh: null,
    available: false,
    unavailableReason: "missing-quarter",
  };
}

export function deriveHourlyPoint(
  quarters: QuarterPrice[],
  hourStartAt: string,
): PricePoint {
  const hourStartMilliseconds = parseIsoTimestamp(hourStartAt);
  if (hourStartMilliseconds === undefined) {
    return {
      id: hourStartAt,
      startAt: hourStartAt,
      endAt: hourStartAt,
      label: hourStartAt,
      priceCentsPerKwh: null,
      available: false,
      unavailableReason: "missing-quarter",
    };
  }

  const expectedStarts = [0, 1, 2, 3].map(
    (quarterIndex) => hourStartMilliseconds + quarterIndex * QUARTER_MILLISECONDS,
  );
  const quarterByStart = new Map<number, QuarterPrice | undefined>();
  for (const quarter of quarters) {
    const startMilliseconds = parseIsoTimestamp(quarter.startAt);
    if (startMilliseconds === undefined) continue;

    const endMilliseconds = parseIsoTimestamp(quarter.endAt);
    const valid =
      startMilliseconds % QUARTER_MILLISECONDS === 0 &&
      endMilliseconds !== undefined &&
      endMilliseconds - startMilliseconds === QUARTER_MILLISECONDS &&
      Number.isFinite(quarter.priceCentsPerKwh);
    if (!valid || quarterByStart.has(startMilliseconds)) {
      if (!valid) quarterByStart.set(startMilliseconds, undefined);
      continue;
    }
    quarterByStart.set(startMilliseconds, quarter);
  }
  const matchingQuarters = expectedStarts.map((startMilliseconds) =>
    quarterByStart.get(startMilliseconds),
  );

  if (matchingQuarters.some((quarter) => quarter === undefined)) {
    return unavailableHourlyPoint(hourStartMilliseconds);
  }

  const prices = matchingQuarters.map((quarter) => quarter!.priceCentsPerKwh);
  const startAt = canonicalTimestamp(hourStartMilliseconds);
  const endMilliseconds = hourStartMilliseconds + 4 * QUARTER_MILLISECONDS;
  return {
    id: String(hourStartMilliseconds),
    startAt,
    endAt: canonicalTimestamp(endMilliseconds),
    label: formatIntervalLabel(startAt, canonicalTimestamp(endMilliseconds)),
    priceCentsPerKwh: prices.reduce((sum, price) => sum + price, 0) / prices.length,
    available: true,
  };
}

function withoutLevel(point: PricePoint): PricePoint {
  const pointWithoutLevel = { ...point };
  delete pointWithoutLevel.level;
  return pointWithoutLevel;
}

export function classifyPriceLevels(points: PricePoint[]): PricePoint[] {
  const ranked = points
    .map((point, index) => ({ point, index }))
    .filter(
      ({ point }) =>
        point.available &&
        point.priceCentsPerKwh !== null &&
        Number.isFinite(point.priceCentsPerKwh),
    );

  if (ranked.length === 0) return points.map(withoutLevel);

  const allPricesEqual = ranked.every(
    ({ point }) => point.priceCentsPerKwh === ranked[0].point.priceCentsPerKwh,
  );
  if (allPricesEqual) {
    const normalByIndex = new Map(ranked.map(({ index }) => [index, "normal" as PriceLevel]));
    return points.map((point, index) => {
      const pointWithoutLevel = withoutLevel(point);
      const level = normalByIndex.get(index);
      return level === undefined ? pointWithoutLevel : { ...pointWithoutLevel, level };
    });
  }

  const sorted = [...ranked].sort(
    (left, right) =>
      left.point.priceCentsPerKwh! - right.point.priceCentsPerKwh! ||
      left.index - right.index,
  );
  const bandSize = Math.ceil(sorted.length / 3);
  const levelByIndex = new Map<number, PriceLevel>();

  sorted.forEach(({ index }, rank) => {
    const level =
      rank < bandSize
        ? "cheap"
        : rank >= sorted.length - bandSize
          ? "high"
          : "normal";
    levelByIndex.set(index, level);
  });

  return points.map((point, index) => {
    const pointWithoutLevel = withoutLevel(point);
    const level = levelByIndex.get(index);
    return level === undefined ? pointWithoutLevel : { ...pointWithoutLevel, level };
  });
}

export function findCheapestPoint(points: PricePoint[]): PricePoint | undefined {
  let cheapest: PricePoint | undefined;

  for (const point of points) {
    if (
      !point.available ||
      point.priceCentsPerKwh === null ||
      !Number.isFinite(point.priceCentsPerKwh)
    ) {
      continue;
    }

    if (
      cheapest === undefined ||
      point.priceCentsPerKwh < cheapest.priceCentsPerKwh!
    ) {
      cheapest = point;
    }
  }

  return cheapest;
}

const comparisonFormatter = new Intl.NumberFormat("fi-FI", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function getCostComparison(
  point: PricePoint,
  cheapestPoint: PricePoint,
  useId: EverydayUseId,
): CostComparison {
  const estimate = point.estimates?.[useId];
  const cheapestEstimate = cheapestPoint.estimates?.[useId];
  const savingCents =
    estimate && cheapestEstimate ? estimate.cents - cheapestEstimate.cents : 0;

  if (!estimate || !cheapestEstimate || savingCents <= 0.005) {
    return {
      title: "Paras ajankohta",
      detail: "Tämä on aktiivisen näkymän edullisin saatavilla oleva jakso.",
    };
  }

  return {
    title: `Säästät ${comparisonFormatter.format(savingCents)} senttiä`,
    detail: `edullisimmalla jaksolla ${cheapestPoint.label}`,
  };
}

function attachComparisons(points: PricePoint[]): PricePoint[] {
  const cheapestPoint = findCheapestPoint(points);
  if (!cheapestPoint) return points;

  return points.map((point) => {
    if (!point.available || !point.estimates) return point;

    const estimates = { ...point.estimates };
    for (const use of EVERYDAY_USES) {
      estimates[use.id] = {
        ...estimates[use.id],
        comparison: getCostComparison(point, cheapestPoint, use.id),
      };
    }
    return { ...point, estimates };
  });
}

type BuildExplorerDataInput = {
  quarterPrices: QuarterPrice[];
  now: Date;
  fetchedAt: string | null;
};

const SOURCE = {
  name: "Pörssisähkö.net",
  pricesUrl: "https://porssisahko.net/",
  apiUrl: "https://api.porssisahko.net/v2/latest-prices.json",
  documentationUrl: "https://porssisahko.net/api",
} as const;

function validQuarterStartMilliseconds(quarter: QuarterPrice): number | undefined {
  const startMilliseconds = parseIsoTimestamp(quarter.startAt);
  const endMilliseconds = parseIsoTimestamp(quarter.endAt);
  if (
    startMilliseconds === undefined ||
    endMilliseconds === undefined ||
    startMilliseconds % QUARTER_MILLISECONDS !== 0 ||
    endMilliseconds - startMilliseconds !== QUARTER_MILLISECONDS ||
    !Number.isFinite(quarter.priceCentsPerKwh)
  ) {
    return undefined;
  }
  return startMilliseconds;
}

function indexQuarterPrices(quarterPrices: QuarterPrice[]): Map<number, QuarterPrice> {
  const byStart = new Map<number, QuarterPrice>();
  for (const quarter of quarterPrices) {
    const startMilliseconds = validQuarterStartMilliseconds(quarter);
    if (startMilliseconds !== undefined && !byStart.has(startMilliseconds)) {
      byStart.set(startMilliseconds, quarter);
    }
  }
  return byStart;
}

function estimatePoint(point: PricePoint): PricePoint {
  if (!point.available || point.priceCentsPerKwh === null) return point;

  const estimates = Object.fromEntries(
    EVERYDAY_USES.map((use) => [
      use.id,
      calculateUseCost(use.consumptionKwh, point.priceCentsPerKwh!),
    ]),
  ) as Record<EverydayUseId, CostEstimate>;
  return { ...point, estimates };
}

function createQuarterPoint(
  startMilliseconds: number,
  quarterByStart: Map<number, QuarterPrice>,
): PricePoint {
  const startAt = canonicalTimestamp(startMilliseconds);
  const endAt = canonicalTimestamp(startMilliseconds + QUARTER_MILLISECONDS);
  const source = quarterByStart.get(startMilliseconds);
  if (source === undefined) {
    return {
      id: String(startMilliseconds),
      startAt,
      endAt,
      label: formatIntervalLabel(startAt, endAt),
      priceCentsPerKwh: null,
      available: false,
      unavailableReason: "source-gap",
    };
  }

  return {
    id: String(startMilliseconds),
    startAt,
    endAt,
    label: formatIntervalLabel(startAt, endAt),
    priceCentsPerKwh: source.priceCentsPerKwh,
    available: true,
  };
}

function buildHorizon(
  sourcePrices: QuarterPrice[],
  quarterByStart: Map<number, QuarterPrice>,
  startMilliseconds: number,
  endMilliseconds: number,
): HorizonPoints {
  const quarterHour = [] as PricePoint[];
  for (
    let slotStart = startMilliseconds;
    slotStart < endMilliseconds;
    slotStart += QUARTER_MILLISECONDS
  ) {
    quarterHour.push(estimatePoint(createQuarterPoint(slotStart, quarterByStart)));
  }

  const hourly = [] as PricePoint[];
  const firstHourStart = Math.floor(startMilliseconds / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  for (
    let hourStart = firstHourStart;
    hourStart < endMilliseconds;
    hourStart += HOUR_MILLISECONDS
  ) {
    hourly.push(
      estimatePoint(deriveHourlyPoint(sourcePrices, canonicalTimestamp(hourStart))),
    );
  }

  return {
    hourly: attachComparisons(classifyPriceLevels(hourly)),
    quarterHour: attachComparisons(classifyPriceLevels(quarterHour)),
  };
}

export function buildExplorerData({
  quarterPrices,
  now,
  fetchedAt,
}: BuildExplorerDataInput): ExplorerData {
  const nowMilliseconds = now.getTime();
  if (!Number.isFinite(nowMilliseconds)) throw new RangeError("Invalid now instant.");

  const currentQuarterStart =
    Math.floor(nowMilliseconds / QUARTER_MILLISECONDS) * QUARTER_MILLISECONDS;
  const next24End = currentQuarterStart + 96 * QUARTER_MILLISECONDS;
  const tomorrowDateKey = getNextHelsinkiDateKey(getHelsinkiDateKey(now));
  const tomorrowBounds = getHelsinkiDateBounds(tomorrowDateKey);
  const tomorrowStart = Date.parse(tomorrowBounds.startAt);
  const tomorrowEnd = Date.parse(tomorrowBounds.endAt);
  const sourcePrices = quarterPrices.filter(
    (quarter) => validQuarterStartMilliseconds(quarter) !== undefined,
  );
  const quarterByStart = indexQuarterPrices(sourcePrices);

  const next24Hours = buildHorizon(
    sourcePrices,
    quarterByStart,
    currentQuarterStart,
    next24End,
  );
  const tomorrow = buildHorizon(
    sourcePrices,
    quarterByStart,
    tomorrowStart,
    tomorrowEnd,
  );
  const currentQuarterPoint = next24Hours.quarterHour.find(
    (point) => point.id === String(currentQuarterStart),
  );
  const currentHourPoint = next24Hours.hourly.find(
    (point) => point.id === String(Math.floor(nowMilliseconds / HOUR_MILLISECONDS) * HOUR_MILLISECONDS),
  );

  return {
    fetchedAt,
    source: SOURCE,
    currentQuarterId: currentQuarterPoint?.available ? currentQuarterPoint.id : null,
    currentHourId: currentHourPoint?.available ? currentHourPoint.id : null,
    next24Hours,
    tomorrow,
    uses: EVERYDAY_USES,
    status: "ready",
  };
}
