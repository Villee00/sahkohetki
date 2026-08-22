import type {
  CostEstimate,
  PriceLevel,
  PricePoint,
  QuarterPrice,
} from "./price-types";

const QUARTER_MILLISECONDS = 15 * 60 * 1000;

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
  return {
    id: String(hourStartMilliseconds),
    startAt,
    endAt: canonicalTimestamp(hourStartMilliseconds + 4 * QUARTER_MILLISECONDS),
    label: startAt,
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
  const quarterByStart = new Map(
    quarters.map((quarter) => [parseIsoTimestamp(quarter.startAt), quarter]),
  );
  const matchingQuarters = expectedStarts.map((startMilliseconds) =>
    quarterByStart.get(startMilliseconds),
  );

  if (matchingQuarters.some((quarter) => quarter === undefined)) {
    return unavailableHourlyPoint(hourStartMilliseconds);
  }

  const prices = matchingQuarters.map((quarter) => quarter!.priceCentsPerKwh);
  const startAt = canonicalTimestamp(hourStartMilliseconds);
  return {
    id: String(hourStartMilliseconds),
    startAt,
    endAt: canonicalTimestamp(hourStartMilliseconds + 4 * QUARTER_MILLISECONDS),
    label: startAt,
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
