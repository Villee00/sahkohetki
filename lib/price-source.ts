import { unstable_cache } from "next/cache";
import { EVERYDAY_USES } from "./appliances";
import { buildExplorerData, parsePricePayload } from "./price-domain";
import type { ExplorerData, QuarterPrice } from "./price-types";

const API_URL = "https://api.porssisahko.net/v2/latest-prices.json";

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

    return { status: "ready", prices: parsed.prices };
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
    next24Hours: { hourly: [], quarterHour: [] },
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
