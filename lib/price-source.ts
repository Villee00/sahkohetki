import "server-only";
import { unstable_cache } from "next/cache";
import { EVERYDAY_USES } from "./appliances";
import {
  ENTSOE_DAY_AHEAD_CONTRACT,
  ENTSOE_ENERGY_PRICE_DOCUMENT,
  FINNISH_BIDDING_ZONE,
  parseEntsoePriceXml,
  toVatInclusiveQuarterPrices,
} from "./entsoe-prices";
import {
  buildPriceApiResponse,
  type PriceApiHorizon,
  type PriceApiResponse,
} from "./price-api";
import { buildExplorerData } from "./price-domain";
import { getTransferCostApiData } from "./transfer-source";
import {
  getHelsinkiDateBounds,
  getHelsinkiDateKey,
  getNextHelsinkiDateKey,
} from "./time";
import { EXPLORER_SOURCE } from "./price-types";
import type { ExplorerData, QuarterPrice } from "./price-types";

const API_URL = EXPLORER_SOURCE.apiUrl;
const SOURCE_CACHE_REVALIDATE_SECONDS = 12 * 60 * 60;
const NOT_PUBLISHED_RETRY_MILLISECONDS = 5 * 60 * 1000;
const REQUEST_UNAVAILABLE_MESSAGE =
  "Hintatietoja ei voitu hakea tai varmistaa juuri nyt.";
const TOKEN_UNAVAILABLE_MESSAGE =
  "Hintatietoja ei voitu hakea, koska lähteen käyttöoikeus puuttuu.";
const SCHEMA_UNAVAILABLE_MESSAGE =
  "Hintatietojen muotoa ei voitu varmistaa juuri nyt.";
const NOT_PUBLISHED_MESSAGE = "Hintatietoja ei ole vielä julkaistu.";

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type PriceSourceUnavailableReason =
  | "not-published"
  | "configuration"
  | "request"
  | "schema";

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
  url.searchParams.set("documentType", ENTSOE_ENERGY_PRICE_DOCUMENT);
  url.searchParams.set("in_Domain", FINNISH_BIDDING_ZONE);
  url.searchParams.set("out_Domain", FINNISH_BIDDING_ZONE);
  url.searchParams.set(
    "contract_MarketAgreement.type",
    ENTSOE_DAY_AHEAD_CONTRACT,
  );
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

export type PriceApiResult =
  | { status: "ready"; data: PriceApiResponse }
  | { status: "unavailable"; message: string };

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

    const parsed = parseEntsoePriceXml(await response.text());
    if (parsed.status === "unavailable") {
      return parsed.reason === "no-data"
        ? {
            status: "unavailable",
            message: NOT_PUBLISHED_MESSAGE,
            reason: "not-published",
          }
        : {
            status: "unavailable",
            message: SCHEMA_UNAVAILABLE_MESSAGE,
            reason: "schema",
          };
    }
    const prices = toVatInclusiveQuarterPrices(parsed.intervals);
    return prices.length > 0
      ? { status: "ready", prices }
      : {
          status: "unavailable",
          message: SCHEMA_UNAVAILABLE_MESSAGE,
          reason: "schema",
        };
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
  transferData = getTransferCostApiData(),
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
  const transferData = getTransferCostApiData();
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

export async function getPriceApiData(
  horizon: PriceApiHorizon,
  now = new Date(),
): Promise<PriceApiResult> {
  const snapshot = await getCachedSourceSnapshot();
  if (snapshot.status === "unavailable") return snapshot;
  if (snapshot.fetchedAt === null) {
    return {
      status: "unavailable",
      message: REQUEST_UNAVAILABLE_MESSAGE,
    };
  }

  return {
    status: "ready",
    data: buildPriceApiResponse({
      quarterPrices: snapshot.prices,
      now,
      fetchedAt: snapshot.fetchedAt,
      horizon,
    }),
  };
}
