import "server-only";
import { XMLParser } from "fast-xml-parser";
import { unstable_cache } from "next/cache";
import { EVERYDAY_USES } from "./appliances";
import { buildExplorerData } from "./price-domain";
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
const REQUEST_UNAVAILABLE_MESSAGE =
  "Hintatietoja ei voitu hakea tai varmistaa juuri nyt.";
const TOKEN_UNAVAILABLE_MESSAGE =
  "Hintatietoja ei voitu hakea, koska lähteen käyttöoikeus puuttuu.";
const SCHEMA_UNAVAILABLE_MESSAGE =
  "Hintatietojen muotoa ei voitu varmistaa juuri nyt.";

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

type EntsoeParseResult =
  | { status: "ready"; prices: QuarterPrice[] }
  | { status: "unavailable"; message: string };

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
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch {
    return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
  }

  if (!isRecord(parsed) || !isRecord(parsed.Publication_MarketDocument)) {
    return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
  }

  const document = parsed.Publication_MarketDocument;
  if (textValue(document.type) !== ENTSOE_DOCUMENT_TYPE) {
    return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
  }

  const periodsToExpand: ParsedPeriod[] = [];
  const timeSeries = asArray(document.TimeSeries);
  if (timeSeries.length === 0) {
    return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
  }

  for (const seriesValue of timeSeries) {
    if (!isRecord(seriesValue)) {
      return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
    }

    if (
      textValue(seriesValue["in_Domain.mRID"]) !== FINNISH_BIDDING_ZONE ||
      textValue(seriesValue["out_Domain.mRID"]) !== FINNISH_BIDDING_ZONE ||
      textValue(seriesValue["currency_Unit.name"]) !== "EUR" ||
      textValue(seriesValue["price_Measure_Unit.name"]) !== "MWH"
    ) {
      return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
    }

    const periods = asArray(seriesValue.Period);
    if (periods.length === 0) {
      return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
    }

    for (const periodValue of periods) {
      if (!isRecord(periodValue)) {
        return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
      }

      if (textValue(periodValue.resolution) !== "PT15M") {
        return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
      }

      const interval = periodValue.timeInterval;
      if (!isRecord(interval)) {
        return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
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
        return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
      }

      const periodSlots =
        (endMilliseconds - startMilliseconds) / QUARTER_MILLISECONDS;
      const points = asArray(periodValue.Point);
      if (points.length === 0) {
        return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
      }

      const pricesByPosition = new Map<number, number>();
      for (const pointValue of points) {
        if (!isRecord(pointValue)) {
          return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
        }

        const position = positiveInteger(pointValue.position);
        const priceInMegawattHours = finiteNumber(pointValue["price.amount"]);
        if (
          position === undefined ||
          position > periodSlots ||
          priceInMegawattHours === undefined
        ) {
          return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
        }

        if (pricesByPosition.has(position)) {
          return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
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
          return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
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
        return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
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
    return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
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
  | { status: "unavailable"; message: string };

export async function fetchLatestPrices(
  fetchImpl: FetchImplementation = fetch,
  now = new Date(),
): Promise<PriceSourceResult> {
  const token = process.env.ENTSOE_TOKEN?.trim();
  if (!token) {
    return { status: "unavailable", message: TOKEN_UNAVAILABLE_MESSAGE };
  }

  const requestUrl = buildRequestUrl(token, now);
  if (requestUrl === undefined) {
    return { status: "unavailable", message: REQUEST_UNAVAILABLE_MESSAGE };
  }

  try {
    const response = await fetchImpl(requestUrl, { cache: "no-store" });
    if (!response.ok) {
      return { status: "unavailable", message: REQUEST_UNAVAILABLE_MESSAGE };
    }

    const parsed = parseEntsoeXml(await response.text());
    return parsed.status === "ready"
      ? parsed
      : { status: "unavailable", message: parsed.message };
  } catch {
    return { status: "unavailable", message: REQUEST_UNAVAILABLE_MESSAGE };
  }
}

const getCachedSourceSnapshot = unstable_cache(
  async () => {
    const result = await fetchLatestPrices();
    return {
      ...result,
      fetchedAt: result.status === "ready" ? new Date().toISOString() : null,
    };
  },
  ["sahkohetki-entsoe-latest-prices-vat-inclusive-v1"],
  { revalidate: 43200 },
);

function unavailableExplorerData(message: string): ExplorerData {
  return {
    fetchedAt: null,
    source: { ...EXPLORER_SOURCE },
    currentQuarterId: null,
    currentHourId: null,
    today: { hourly: [], quarterHour: [] },
    tomorrow: { hourly: [], quarterHour: [] },
    uses: EVERYDAY_USES,
    status: "unavailable",
    message,
  };
}

export async function getExplorerData(now = new Date()): Promise<ExplorerData> {
  const snapshot = await getCachedSourceSnapshot();
  if (snapshot.status === "unavailable") {
    return unavailableExplorerData(snapshot.message);
  }

  return buildExplorerData({
    quarterPrices: snapshot.prices,
    now,
    fetchedAt: snapshot.fetchedAt,
  });
}
