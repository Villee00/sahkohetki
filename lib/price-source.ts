import "server-only";
import { XMLParser } from "fast-xml-parser";
import { unstable_cache } from "next/cache";
import { EVERYDAY_USES } from "./appliances";
import { buildExplorerData } from "./price-domain";
import { getTransferData } from "./transfer-source";
import {
  getHelsinkiDateBounds,
  getHelsinkiDateKey,
  getNextHelsinkiDateKey,
} from "./time";
import { EXPLORER_SOURCE } from "./price-types";
import type { ExplorerData, QuarterPrice } from "./price-types";

const API_URL = EXPLORER_SOURCE.apiUrl;
const FINNISH_BIDDING_ZONE = "10YFI-1--------U";
const ENTSOE_DOCUMENT_TYPE = "A44";
const DAY_AHEAD_MARKET = "A01";
const FINNISH_GENERAL_VAT_RATE = 0.255;
const QUARTER_MILLISECONDS = 15 * 60 * 1000;
const SOURCE_CACHE_REVALIDATE_SECONDS = 12 * 60 * 60;
const NOT_PUBLISHED_RETRY_MILLISECONDS = 5 * 60 * 1000;
const REQUEST_UNAVAILABLE_MESSAGE =
  "Hintatietoja ei voitu hakea tai varmistaa juuri nyt.";
const TOKEN_UNAVAILABLE_MESSAGE =
  "Hintatietoja ei voitu hakea, koska lähteen käyttöoikeus puuttuu.";
const SCHEMA_UNAVAILABLE_MESSAGE =
  "Hintatietojen muotoa ei voitu varmistaa juuri nyt.";
const NOT_PUBLISHED_MESSAGE = "Hintatietoja ei ole vielä julkaistu.";

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  removeNSPrefix: true,
  trimValues: true,
});

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type PriceSourceUnavailableReason =
  | "not-published"
  | "configuration"
  | "request"
  | "schema";

type EntsoeParseResult =
  | { status: "ready"; prices: QuarterPrice[] }
  | {
      status: "unavailable";
      message: string;
      reason: PriceSourceUnavailableReason;
    };

type CachedSourceSnapshot = {
  status: "ready";
  prices: QuarterPrice[];
  fetchedAt: string;
};

class SourceRefreshError extends Error {
  readonly reason: PriceSourceUnavailableReason;

  constructor(reason: PriceSourceUnavailableReason, message: string) {
    super(message);
    this.name = "SourceRefreshError";
    this.reason = reason;
  }
}

type ParsedPeriod = {
  startMilliseconds: number;
  endMilliseconds: number;
  pricesByPosition: Map<number, number>;
};

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

function positiveInteger(value: unknown): number | undefined {
  const number = finiteNumber(value);
  if (number === undefined || !Number.isInteger(number) || number < 1) {
    return undefined;
  }
  return number;
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

function parseEntsoeXml(xml: string): EntsoeParseResult {
  const schemaUnavailable = (): EntsoeParseResult => ({
    status: "unavailable",
    message: SCHEMA_UNAVAILABLE_MESSAGE,
    reason: "schema",
  });

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch {
    return schemaUnavailable();
  }

  if (!isRecord(parsed)) {
    return schemaUnavailable();
  }

  const acknowledgement = parsed.Acknowledgement_MarketDocument;
  if (isRecord(acknowledgement)) {
    const hasNoMatchingDataReason = asArray(acknowledgement.Reason).some(
      (reason) => isRecord(reason) && textValue(reason.code) === "999",
    );
    if (hasNoMatchingDataReason) {
      return {
        status: "unavailable",
        message: NOT_PUBLISHED_MESSAGE,
        reason: "not-published",
      };
    }
    return schemaUnavailable();
  }

  if (!isRecord(parsed.Publication_MarketDocument)) {
    return schemaUnavailable();
  }

  const document = parsed.Publication_MarketDocument;
  if (textValue(document.type) !== ENTSOE_DOCUMENT_TYPE) {
    return schemaUnavailable();
  }

  const periodsToExpand: ParsedPeriod[] = [];
  const timeSeries = asArray(document.TimeSeries);
  if (timeSeries.length === 0) {
    return schemaUnavailable();
  }

  for (const seriesValue of timeSeries) {
    if (!isRecord(seriesValue)) {
      return schemaUnavailable();
    }

    if (
      textValue(seriesValue["in_Domain.mRID"]) !== FINNISH_BIDDING_ZONE ||
      textValue(seriesValue["out_Domain.mRID"]) !== FINNISH_BIDDING_ZONE ||
      textValue(seriesValue["currency_Unit.name"]) !== "EUR" ||
      textValue(seriesValue["price_Measure_Unit.name"]) !== "MWH"
    ) {
      return schemaUnavailable();
    }

    const periods = asArray(seriesValue.Period);
    if (periods.length === 0) {
      return schemaUnavailable();
    }

    for (const periodValue of periods) {
      if (!isRecord(periodValue)) {
        return schemaUnavailable();
      }

      if (textValue(periodValue.resolution) !== "PT15M") {
        return schemaUnavailable();
      }

      const interval = periodValue.timeInterval;
      if (!isRecord(interval)) {
        return schemaUnavailable();
      }

      const startMilliseconds = parseTimestamp(interval.start);
      const endMilliseconds = parseTimestamp(interval.end);
      if (
        startMilliseconds === undefined ||
        endMilliseconds === undefined ||
        startMilliseconds % QUARTER_MILLISECONDS !== 0 ||
        endMilliseconds <= startMilliseconds ||
        (endMilliseconds - startMilliseconds) % QUARTER_MILLISECONDS !== 0
      ) {
        return schemaUnavailable();
      }

      const periodSlots =
        (endMilliseconds - startMilliseconds) / QUARTER_MILLISECONDS;
      const points = asArray(periodValue.Point);
      if (points.length === 0) {
        return schemaUnavailable();
      }

      const pricesByPosition = new Map<number, number>();
      for (const pointValue of points) {
        if (!isRecord(pointValue)) {
          return schemaUnavailable();
        }

        const position = positiveInteger(pointValue.position);
        const priceInMegawattHours = finiteNumber(pointValue["price.amount"]);
        if (
          position === undefined ||
          position > periodSlots ||
          priceInMegawattHours === undefined
        ) {
          return schemaUnavailable();
        }

        if (pricesByPosition.has(position)) {
          return schemaUnavailable();
        }
        pricesByPosition.set(position, priceInMegawattHours);
      }

      periodsToExpand.push({
        startMilliseconds,
        endMilliseconds,
        pricesByPosition,
      });
    }
  }

  const pricesByStart = new Map<number, QuarterPrice>();
  let lastPriceInMegawattHours: number | undefined;
  let previousPeriodEndMilliseconds: number | undefined;
  const addPrice = (
    priceStartMilliseconds: number,
    priceInMegawattHours: number,
    carriedForward = false,
  ): boolean => {
    if (pricesByStart.has(priceStartMilliseconds)) return false;

    const priceStartAt = canonicalTimestamp(priceStartMilliseconds);
    pricesByStart.set(priceStartMilliseconds, {
      id: String(priceStartMilliseconds),
      startAt: priceStartAt,
      endAt: canonicalTimestamp(priceStartMilliseconds + QUARTER_MILLISECONDS),
      priceCentsPerKwh:
        (priceInMegawattHours / 10) * (1 + FINNISH_GENERAL_VAT_RATE),
      carriedForward,
    });
    return true;
  };

  for (const period of periodsToExpand.sort(
    (left, right) => left.startMilliseconds - right.startMilliseconds,
  )) {
    if (
      lastPriceInMegawattHours !== undefined &&
      previousPeriodEndMilliseconds !== undefined &&
      period.startMilliseconds > previousPeriodEndMilliseconds
    ) {
      for (
        let slotStart = previousPeriodEndMilliseconds;
        slotStart < period.startMilliseconds;
        slotStart += QUARTER_MILLISECONDS
      ) {
        if (!addPrice(slotStart, lastPriceInMegawattHours, true)) {
          return schemaUnavailable();
        }
      }
    }

    const periodSlots =
      (period.endMilliseconds - period.startMilliseconds) /
      QUARTER_MILLISECONDS;

    for (let position = 1; position <= periodSlots; position += 1) {
      if (period.pricesByPosition.has(position)) {
        lastPriceInMegawattHours = period.pricesByPosition.get(position);
      }

      if (lastPriceInMegawattHours === undefined) {
        continue;
      }

      const priceStartMilliseconds =
        period.startMilliseconds + (position - 1) * QUARTER_MILLISECONDS;
      if (
        !addPrice(
          priceStartMilliseconds,
          lastPriceInMegawattHours,
          !period.pricesByPosition.has(position),
        )
      ) {
        return schemaUnavailable();
      }
    }

    previousPeriodEndMilliseconds =
      previousPeriodEndMilliseconds === undefined
        ? period.endMilliseconds
        : Math.max(previousPeriodEndMilliseconds, period.endMilliseconds);
  }

  const prices = [...pricesByStart.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, price]) => price);
  if (prices.length === 0) {
    return schemaUnavailable();
  }

  return { status: "ready", prices };
}

function formatEntsoeTimestamp(milliseconds: number): string {
  const date = new Date(milliseconds);
  const values = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ];
  return `${String(values[0]).padStart(4, "0")}${String(values[1]).padStart(
    2,
    "0",
  )}${String(values[2]).padStart(2, "0")}${String(values[3]).padStart(
    2,
    "0",
  )}${String(values[4]).padStart(2, "0")}`;
}

function getRequestWindow(now: Date): { start: number; end: number } | undefined {
  const nowMilliseconds = now.getTime();
  if (!Number.isFinite(nowMilliseconds)) return undefined;

  const todayDateKey = getHelsinkiDateKey(now);
  const todayBounds = getHelsinkiDateBounds(todayDateKey);
  const tomorrowBounds = getHelsinkiDateBounds(
    getNextHelsinkiDateKey(todayDateKey),
  );
  const start = Date.parse(todayBounds.startAt);
  const end = Date.parse(tomorrowBounds.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return undefined;
  }

  return { start, end };
}

function buildRequestUrl(token: string, now: Date): string | undefined {
  const window = getRequestWindow(now);
  if (window === undefined) return undefined;

  const url = new URL(API_URL);
  url.searchParams.set("documentType", ENTSOE_DOCUMENT_TYPE);
  url.searchParams.set("in_Domain", FINNISH_BIDDING_ZONE);
  url.searchParams.set("out_Domain", FINNISH_BIDDING_ZONE);
  url.searchParams.set("contract_MarketAgreement.type", DAY_AHEAD_MARKET);
  url.searchParams.set("periodStart", formatEntsoeTimestamp(window.start));
  url.searchParams.set("periodEnd", formatEntsoeTimestamp(window.end));
  url.searchParams.set("securityToken", token);
  return url.toString();
}

export type PriceSourceResult =
  | { status: "ready"; prices: QuarterPrice[] }
  | {
      status: "unavailable";
      message: string;
      reason: PriceSourceUnavailableReason;
    };

export async function fetchLatestPrices(
  fetchImpl: FetchImplementation = fetch,
  now = new Date(),
): Promise<PriceSourceResult> {
  const token = process.env.ENTSOE_TOKEN?.trim();
  if (!token) {
    return {
      status: "unavailable",
      message: TOKEN_UNAVAILABLE_MESSAGE,
      reason: "configuration",
    };
  }

  const requestUrl = buildRequestUrl(token, now);
  if (requestUrl === undefined) {
    return {
      status: "unavailable",
      message: REQUEST_UNAVAILABLE_MESSAGE,
      reason: "request",
    };
  }

  try {
    const response = await fetchImpl(requestUrl, { cache: "no-store" });
    if (!response.ok) {
      return {
        status: "unavailable",
        message: REQUEST_UNAVAILABLE_MESSAGE,
        reason: "request",
      };
    }

    const parsed = parseEntsoeXml(await response.text());
    return parsed;
  } catch {
    return {
      status: "unavailable",
      message: REQUEST_UNAVAILABLE_MESSAGE,
      reason: "request",
    };
  }
}

let latestSuccessfulSnapshot: CachedSourceSnapshot | undefined;
let notPublishedRetryAtMilliseconds = 0;

const getCachedPublishedSourceSnapshot = unstable_cache(
  async (): Promise<CachedSourceSnapshot> => {
    const result = await fetchLatestPrices();
    if (result.status === "unavailable") {
      if (result.reason === "not-published") {
        notPublishedRetryAtMilliseconds =
          Date.now() + NOT_PUBLISHED_RETRY_MILLISECONDS;
      }
      throw new SourceRefreshError(result.reason, result.message);
    }

    const snapshot = {
      ...result,
      fetchedAt: new Date().toISOString(),
    };
    latestSuccessfulSnapshot = snapshot;
    notPublishedRetryAtMilliseconds = 0;
    return snapshot;
  },
  ["sahkohetki-entsoe-latest-prices-vat-inclusive-v1"],
  { revalidate: SOURCE_CACHE_REVALIDATE_SECONDS },
);

async function getCachedSourceSnapshot(): Promise<
  CachedSourceSnapshot | {
    status: "unavailable";
    message: string;
    fetchedAt: null;
  }
> {
  if (Date.now() < notPublishedRetryAtMilliseconds) {
    return (
      latestSuccessfulSnapshot ?? {
        status: "unavailable",
        message: NOT_PUBLISHED_MESSAGE,
        fetchedAt: null,
      }
    );
  }

  try {
    const snapshot = await getCachedPublishedSourceSnapshot();
    latestSuccessfulSnapshot = snapshot;
    return snapshot;
  } catch (error) {
    if (error instanceof SourceRefreshError) {
      return {
        status: "unavailable",
        message: error.message,
        fetchedAt: null,
      };
    }

    return {
      status: "unavailable",
      message: REQUEST_UNAVAILABLE_MESSAGE,
      fetchedAt: null,
    };
  }
}

function unavailableExplorerData(
  message: string,
  transferData = getTransferData(),
): ExplorerData {
  return {
    fetchedAt: null,
    source: { ...EXPLORER_SOURCE },
    currentQuarterId: null,
    currentHourId: null,
    today: { hourly: [], quarterHour: [] },
    tomorrow: { hourly: [], quarterHour: [] },
    uses: EVERYDAY_USES,
    transferData,
    status: "unavailable",
    message,
  };
}

export async function getExplorerData(now = new Date()): Promise<ExplorerData> {
  const snapshot = await getCachedSourceSnapshot();
  const transferData = getTransferData();
  if (snapshot.status === "unavailable") {
    return unavailableExplorerData(snapshot.message, transferData);
  }

  return buildExplorerData({
    quarterPrices: snapshot.prices,
    now,
    fetchedAt: snapshot.fetchedAt,
    transferData,
  });
}
