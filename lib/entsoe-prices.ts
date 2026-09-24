import { XMLParser } from "fast-xml-parser";
import type { QuarterPrice } from "./price-types";

export const FINNISH_BIDDING_ZONE = "10YFI-1--------U";
export const ENTSOE_ENERGY_PRICE_DOCUMENT = "A44";
export const ENTSOE_DAY_AHEAD_CONTRACT = "A01";
export const FINNISH_GENERAL_VAT_RATE = 0.255;

const QUARTER_MILLISECONDS = 15 * 60 * 1000;

export function toHouseholdCentsPerKwh(rawEurPerMwh: number): number {
  return (rawEurPerMwh / 10) * (1 + FINNISH_GENERAL_VAT_RATE);
}

export type MarketPriceInterval = {
  id: string;
  startAt: string;
  endAt: string;
  resolutionMinutes: 15 | 60;
  priceEurPerMwh: number;
  documentId: string;
  documentRevision: number;
  documentCreatedAt: string;
  seriesId: string;
  // ENTSO-E A44 responses may omit process.processType.
  processType?: string;
  contractType: string;
  carriedForward: boolean;
};

export type EntsoePriceUnavailableReason =
  | "no-data"
  | "too-many-documents"
  | "acknowledgement"
  | "schema";

export type EntsoePriceParseResult =
  | {
      status: "ready";
      intervals: MarketPriceInterval[];
      documentCount: number;
    }
  | { status: "unavailable"; reason: EntsoePriceUnavailableReason };

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  removeNSPrefix: true,
  trimValues: true,
});

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const text = textValue(value);
  if (text === undefined) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && Number.isInteger(number) && number >= 0
    ? number
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && Number.isInteger(number) && number > 0
    ? number
    : undefined;
}

function parseTimestamp(value: unknown): number | undefined {
  const text = textValue(value);
  if (text === undefined || !/(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    return undefined;
  }
  const milliseconds = Date.parse(text);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

function canonicalTimestamp(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function acknowledgementReason(
  acknowledgement: Record<string, unknown>,
): EntsoePriceUnavailableReason {
  const reasons = asArray(acknowledgement.Reason);
  const text = reasons
    .flatMap((reason) =>
      isRecord(reason) ? [textValue(reason.text) ?? ""] : [],
    )
    .join(" ")
    .toLowerCase();
  if (
    /more than\s+\d+.*document|too many.*document|exceed.*document/.test(text)
  ) {
    return "too-many-documents";
  }
  const codes = reasons.flatMap((reason) =>
    isRecord(reason) ? [textValue(reason.code)] : [],
  );
  if (codes.includes("999") && /no matching data|no data/.test(text)) {
    return "no-data";
  }
  return "acknowledgement";
}

export function mergeMarketPriceIntervals(
  candidates: readonly MarketPriceInterval[],
): EntsoePriceParseResult {
  if (candidates.length === 0) {
    return { status: "unavailable", reason: "schema" };
  }

  const latestRevisionByDocument = new Map<string, number>();
  for (const interval of candidates) {
    latestRevisionByDocument.set(
      interval.documentId,
      Math.max(
        latestRevisionByDocument.get(interval.documentId) ?? -1,
        interval.documentRevision,
      ),
    );
  }

  const latest = candidates.filter(
    (interval) =>
      latestRevisionByDocument.get(interval.documentId) ===
      interval.documentRevision,
  );
  const byInterval = new Map<string, MarketPriceInterval>();
  for (const interval of latest.sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const key = `${interval.startAt}|${interval.endAt}`;
    const existing = byInterval.get(key);
    if (!existing) {
      byInterval.set(key, interval);
      continue;
    }
    if (
      existing.priceEurPerMwh !== interval.priceEurPerMwh ||
      existing.resolutionMinutes !== interval.resolutionMinutes
    ) {
      return { status: "unavailable", reason: "schema" };
    }
  }

  const intervals = [...byInterval.values()].sort((left, right) => {
    const startDifference = Date.parse(left.startAt) - Date.parse(right.startAt);
    return startDifference !== 0
      ? startDifference
      : Date.parse(left.endAt) - Date.parse(right.endAt);
  });
  if (
    intervals.some(
      (interval, index) =>
        index > 0 &&
        Date.parse(interval.startAt) < Date.parse(intervals[index - 1].endAt),
    )
  ) {
    return { status: "unavailable", reason: "schema" };
  }

  return {
    status: "ready",
    intervals,
    documentCount: new Set(latest.map((interval) => interval.documentId)).size,
  };
}

export function parseEntsoePriceXml(xml: string): EntsoePriceParseResult {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch {
    return { status: "unavailable", reason: "schema" };
  }
  if (!isRecord(parsed)) {
    return { status: "unavailable", reason: "schema" };
  }

  if (isRecord(parsed.Acknowledgement_MarketDocument)) {
    return {
      status: "unavailable",
      reason: acknowledgementReason(parsed.Acknowledgement_MarketDocument),
    };
  }

  const document = parsed.Publication_MarketDocument;
  if (
    !isRecord(document) ||
    textValue(document.type) !== ENTSOE_ENERGY_PRICE_DOCUMENT
  ) {
    return { status: "unavailable", reason: "schema" };
  }

  const documentId = textValue(document.mRID);
  const documentRevision = nonNegativeInteger(document.revisionNumber);
  const createdMilliseconds = parseTimestamp(document.createdDateTime);
  const processType = textValue(document["process.processType"]);
  if (
    documentId === undefined ||
    documentRevision === undefined ||
    createdMilliseconds === undefined ||
    (processType !== undefined &&
      processType !== ENTSOE_DAY_AHEAD_CONTRACT)
  ) {
    return { status: "unavailable", reason: "schema" };
  }
  const documentCreatedAt = canonicalTimestamp(createdMilliseconds);
  const candidates: MarketPriceInterval[] = [];

  const timeSeries = asArray(document.TimeSeries);
  if (timeSeries.length === 0) {
    return { status: "unavailable", reason: "schema" };
  }

  for (const seriesValue of timeSeries) {
    if (!isRecord(seriesValue)) {
      return { status: "unavailable", reason: "schema" };
    }
    const seriesId = textValue(seriesValue.mRID);
    const contractType = textValue(
      seriesValue["contract_MarketAgreement.type"],
    );
    if (seriesId === undefined || contractType === undefined) {
      return { status: "unavailable", reason: "schema" };
    }
    if (contractType !== ENTSOE_DAY_AHEAD_CONTRACT) continue;
    if (
      textValue(seriesValue["in_Domain.mRID"]) !== FINNISH_BIDDING_ZONE ||
      textValue(seriesValue["out_Domain.mRID"]) !== FINNISH_BIDDING_ZONE ||
      textValue(seriesValue["currency_Unit.name"]) !== "EUR" ||
      textValue(seriesValue["price_Measure_Unit.name"]) !== "MWH"
    ) {
      return { status: "unavailable", reason: "schema" };
    }
    const periods = asArray(seriesValue.Period);
    if (periods.length === 0) {
      return { status: "unavailable", reason: "schema" };
    }

    for (const periodValue of periods) {
      if (!isRecord(periodValue) || !isRecord(periodValue.timeInterval)) {
        return { status: "unavailable", reason: "schema" };
      }
      const resolutionText = textValue(periodValue.resolution);
      const resolutionMinutes =
        resolutionText === "PT15M" ? 15 : resolutionText === "PT60M" ? 60 : null;
      if (resolutionMinutes === null) {
        return { status: "unavailable", reason: "schema" };
      }
      const intervalMilliseconds = resolutionMinutes * 60 * 1000;
      const startMilliseconds = parseTimestamp(periodValue.timeInterval.start);
      const endMilliseconds = parseTimestamp(periodValue.timeInterval.end);
      if (
        startMilliseconds === undefined ||
        endMilliseconds === undefined ||
        endMilliseconds <= startMilliseconds ||
        startMilliseconds % intervalMilliseconds !== 0 ||
        (endMilliseconds - startMilliseconds) % intervalMilliseconds !== 0
      ) {
        return { status: "unavailable", reason: "schema" };
      }

      const slotCount =
        (endMilliseconds - startMilliseconds) / intervalMilliseconds;
      const points = asArray(periodValue.Point);
      if (points.length === 0) {
        return { status: "unavailable", reason: "schema" };
      }
      const pricesByPosition = new Map<number, number>();
      for (const pointValue of points) {
        if (!isRecord(pointValue)) {
          return { status: "unavailable", reason: "schema" };
        }
        const position = positiveInteger(pointValue.position);
        const price = finiteNumber(pointValue["price.amount"]);
        if (
          position === undefined ||
          position > slotCount ||
          price === undefined ||
          pricesByPosition.has(position)
        ) {
          return { status: "unavailable", reason: "schema" };
        }
        pricesByPosition.set(position, price);
      }

      let currentPrice: number | undefined;
      for (let position = 1; position <= slotCount; position += 1) {
        const publishedPrice = pricesByPosition.get(position);
        if (publishedPrice !== undefined) currentPrice = publishedPrice;
        if (currentPrice === undefined) {
          return { status: "unavailable", reason: "schema" };
        }
        const intervalStart =
          startMilliseconds + (position - 1) * intervalMilliseconds;
        candidates.push({
          id: `${documentId}:${documentRevision}:${seriesId}:${canonicalTimestamp(intervalStart)}`,
          startAt: canonicalTimestamp(intervalStart),
          endAt: canonicalTimestamp(intervalStart + intervalMilliseconds),
          resolutionMinutes,
          priceEurPerMwh: currentPrice,
          documentId,
          documentRevision,
          documentCreatedAt,
          seriesId,
          ...(processType === undefined ? {} : { processType }),
          contractType,
          carriedForward: publishedPrice === undefined,
        });
      }
    }
  }

  return mergeMarketPriceIntervals(candidates);
}

export function toVatInclusiveQuarterPrices(
  intervals: readonly MarketPriceInterval[],
): QuarterPrice[] {
  const prices = new Map<number, QuarterPrice>();
  let previousEnd: number | undefined;
  let previousRawPrice: number | undefined;

  const addQuarter = (
    start: number,
    rawPrice: number,
    carriedForward: boolean,
  ): void => {
    if (prices.has(start)) return;
    prices.set(start, {
      id: String(start),
      startAt: canonicalTimestamp(start),
      endAt: canonicalTimestamp(start + QUARTER_MILLISECONDS),
      priceCentsPerKwh: toHouseholdCentsPerKwh(rawPrice),
      ...(carriedForward ? { carriedForward: true } : {}),
    });
  };

  for (const interval of [...intervals].sort(
    (left, right) => Date.parse(left.startAt) - Date.parse(right.startAt),
  )) {
    const start = Date.parse(interval.startAt);
    const end = Date.parse(interval.endAt);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      (end - start) % QUARTER_MILLISECONDS !== 0
    ) {
      continue;
    }
    if (
      previousEnd !== undefined &&
      previousRawPrice !== undefined &&
      start > previousEnd
    ) {
      for (let gapStart = previousEnd; gapStart < start; gapStart += QUARTER_MILLISECONDS) {
        addQuarter(gapStart, previousRawPrice, true);
      }
    }
    for (
      let quarterStart = start, index = 0;
      quarterStart < end;
      quarterStart += QUARTER_MILLISECONDS, index += 1
    ) {
      addQuarter(
        quarterStart,
        interval.priceEurPerMwh,
        interval.carriedForward || index > 0,
      );
    }
    previousEnd = Math.max(previousEnd ?? end, end);
    previousRawPrice = interval.priceEurPerMwh;
  }

  return [...prices.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, price]) => price);
}
