import "server-only";
import { unstable_cache } from "next/cache";
import { EVERYDAY_USES } from "./appliances";
import { buildExplorerData, parsePricePayload } from "./price-domain";
import {
  getHelsinkiDateBounds,
  getHelsinkiDateKey,
} from "./time";
import type { ExplorerData, QuarterPrice } from "./price-types";

const API_URL = "https://api.porssisahko.net/v2/latest-prices.json";
const POINT_API_URL = "https://api.porssisahko.net/v2/price.json";
const QUARTER_MILLISECONDS = 15 * 60 * 1000;

const SOURCE = {
  name: "Pörssisähkö.net",
  pricesUrl: "https://porssisahko.net/",
  apiUrl: API_URL,
  documentationUrl: "https://porssisahko.net/api",
} as const;

const REQUEST_UNAVAILABLE_MESSAGE =
  "Hintatietoja ei voitu hakea tai varmistaa juuri nyt.";
const SCHEMA_UNAVAILABLE_MESSAGE =
  "Hintatietojen muotoa ei voitu varmistaa juuri nyt.";

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type PointPricePayload = {
  price?: unknown;
};

function isPointPricePayload(value: unknown): value is PointPricePayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getTodayMidnightQuarterStarts(now: Date): number[] {
  const dateKey = getHelsinkiDateKey(now);
  const startMilliseconds = Date.parse(getHelsinkiDateBounds(dateKey).startAt);
  return Array.from(
    { length: 4 },
    (_, index) => startMilliseconds + index * QUARTER_MILLISECONDS,
  );
}

function getSourceStartMilliseconds(quarter: QuarterPrice): number | undefined {
  const milliseconds = Date.parse(quarter.startAt);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

async function fetchPointPrice(
  startMilliseconds: number,
  fetchImpl: FetchImplementation,
): Promise<QuarterPrice | undefined> {
  const startAt = new Date(startMilliseconds).toISOString();
  const response = await fetchImpl(
    `${POINT_API_URL}?date=${encodeURIComponent(startAt)}`,
    { cache: "no-store" },
  );
  if (!response.ok) return undefined;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return undefined;
  }

  if (
    !isPointPricePayload(payload) ||
    typeof payload.price !== "number" ||
    !Number.isFinite(payload.price)
  ) {
    return undefined;
  }

  return {
    id: String(startMilliseconds),
    startAt,
    endAt: new Date(startMilliseconds + QUARTER_MILLISECONDS).toISOString(),
    priceCentsPerKwh: payload.price,
  };
}

async function fetchMissingTodayMidnightPrices(
  prices: QuarterPrice[],
  fetchImpl: FetchImplementation,
): Promise<QuarterPrice[]> {
  const existingStarts = new Set(
    prices
      .map(getSourceStartMilliseconds)
      .filter((milliseconds): milliseconds is number => milliseconds !== undefined),
  );
  const missingStarts = getTodayMidnightQuarterStarts(new Date()).filter(
    (startMilliseconds) => !existingStarts.has(startMilliseconds),
  );

  const fetched = await Promise.all(
    missingStarts.map((startMilliseconds) =>
      fetchPointPrice(startMilliseconds, fetchImpl).catch(() => undefined),
    ),
  );
  return fetched.filter(
    (price): price is QuarterPrice => price !== undefined,
  );
}

export type PriceSourceResult =
  | { status: "ready"; prices: QuarterPrice[] }
  | { status: "unavailable"; message: string };

export async function fetchLatestPrices(
  fetchImpl: FetchImplementation = fetch,
): Promise<PriceSourceResult> {
  try {
    const response = await fetchImpl(API_URL, { cache: "no-store" });
    if (!response.ok) {
      return { status: "unavailable", message: REQUEST_UNAVAILABLE_MESSAGE };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { status: "unavailable", message: REQUEST_UNAVAILABLE_MESSAGE };
    }

    const parsed = parsePricePayload(payload);
    if (!parsed.ok) {
      return { status: "unavailable", message: SCHEMA_UNAVAILABLE_MESSAGE };
    }

    const missingTodayMidnightPrices = await fetchMissingTodayMidnightPrices(
      parsed.prices,
      fetchImpl,
    );
    return {
      status: "ready",
      prices: [...parsed.prices, ...missingTodayMidnightPrices],
    };
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
  ["sahkohetki-porssisahko-latest-prices"],
  { revalidate: 43200 },
);

function unavailableExplorerData(message: string): ExplorerData {
  return {
    fetchedAt: null,
    source: { ...SOURCE },
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
