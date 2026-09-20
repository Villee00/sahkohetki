import "server-only";
import { unstable_cache } from "next/cache";
import {
  ENTSOE_DAY_AHEAD_CONTRACT,
  ENTSOE_ENERGY_PRICE_DOCUMENT,
  FINNISH_BIDDING_ZONE,
  mergeMarketPriceIntervals,
  parseEntsoePriceXml,
  type MarketPriceInterval,
} from "./entsoe-prices";
import { buildHistoryPageData } from "./history-domain";
import type {
  HistoryFailureReason,
  HistoryLoadResult,
  HistoryPageData,
} from "./history-types";
import { EXPLORER_SOURCE } from "./price-types";
import { getHelsinkiDateBounds, getHelsinkiDateKey } from "./time";

const CLOSED_MONTH_REVALIDATE_SECONDS = 30 * 24 * 60 * 60;
const CURRENT_MONTH_REVALIDATE_SECONDS = 6 * 60 * 60;
const HISTORY_MONTH_COUNT = 14;
const PAGE_SIZE = 200;
const MAX_OFFSET_PAGES = 20;

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type HistoryMonthResult =
  | {
      status: "ready";
      intervals: MarketPriceInterval[];
      fetchedAt: string;
    }
  | {
      status: "unavailable";
      reason: HistoryFailureReason;
      message: string;
    };

class HistoryMonthError extends Error {
  readonly result: Extract<HistoryMonthResult, { status: "unavailable" }>;

  constructor(result: Extract<HistoryMonthResult, { status: "unavailable" }>) {
    super(result.message);
    this.name = "HistoryMonthError";
    this.result = result;
  }
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(monthKey: string, months: number): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

function lastDateOfMonth(monthKey: string): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function formatEntsoeTimestamp(instant: string): string {
  const date = new Date(instant);
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0"))
    .join("");
}

function requestUrl(monthKey: string, token: string, offset?: number): string {
  const startDateKey = `${monthKey}-01`;
  const nextMonthDateKey = `${addMonths(monthKey, 1)}-01`;
  const start = getHelsinkiDateBounds(startDateKey).startAt;
  const end = getHelsinkiDateBounds(nextMonthDateKey).startAt;
  const url = new URL(EXPLORER_SOURCE.apiUrl);
  url.searchParams.set("documentType", ENTSOE_ENERGY_PRICE_DOCUMENT);
  url.searchParams.set("in_Domain", FINNISH_BIDDING_ZONE);
  url.searchParams.set("out_Domain", FINNISH_BIDDING_ZONE);
  url.searchParams.set(
    "contract_MarketAgreement.type",
    ENTSOE_DAY_AHEAD_CONTRACT,
  );
  url.searchParams.set("periodStart", formatEntsoeTimestamp(start));
  url.searchParams.set("periodEnd", formatEntsoeTimestamp(end));
  if (offset !== undefined) url.searchParams.set("offset", String(offset));
  url.searchParams.set("securityToken", token);
  return url.toString();
}

function unavailable(
  reason: HistoryFailureReason,
  message: string,
): Extract<HistoryMonthResult, { status: "unavailable" }> {
  return { status: "unavailable", reason, message };
}

async function requestMonthPage(
  monthKey: string,
  token: string,
  fetchImpl: FetchImplementation,
  offset?: number,
): Promise<
  | { status: "ready"; intervals: MarketPriceInterval[] }
  | Extract<HistoryMonthResult, { status: "unavailable" }>
> {
  let response: Response;
  try {
    response = await fetchImpl(requestUrl(monthKey, token, offset), {
      cache: "no-store",
    });
  } catch {
    return unavailable("request", "Historiatietojen haku epäonnistui.");
  }
  if (response.status === 429) {
    return unavailable(
      "rate-limit",
      "ENTSO-E rajoitti historiatietojen hakua. Osa tiedoista voi puuttua.",
    );
  }
  if (!response.ok) {
    return unavailable("request", "Historiatietojen haku epäonnistui.");
  }

  const parsed = parseEntsoePriceXml(await response.text());
  if (parsed.status === "ready") {
    return { status: "ready", intervals: parsed.intervals };
  }
  const reason: HistoryFailureReason =
    parsed.reason === "no-data"
      ? "no-data"
      : parsed.reason === "too-many-documents"
        ? "too-many-documents"
        : parsed.reason === "schema"
          ? "schema"
          : "acknowledgement";
  return unavailable(
    reason,
    reason === "no-data"
      ? "Historiatietoja ei löytynyt valitulta ajalta."
      : reason === "schema"
        ? "Historiatietojen muotoa ei voitu varmistaa."
        : "ENTSO-E hylkäsi historiatietojen pyynnön.",
  );
}

export async function fetchHistoryMonth(
  monthKey: string,
  fetchImpl: FetchImplementation = fetch,
): Promise<HistoryMonthResult> {
  const token = process.env.ENTSOE_TOKEN?.trim();
  if (!token) {
    return unavailable(
      "configuration",
      "Historiatietoja ei voitu hakea, koska lähteen käyttöoikeus puuttuu.",
    );
  }

  const first = await requestMonthPage(monthKey, token, fetchImpl);
  if (first.status === "unavailable" && first.reason !== "too-many-documents") {
    return first;
  }
  if (first.status === "ready") {
    return {
      status: "ready",
      intervals: first.intervals,
      fetchedAt: new Date().toISOString(),
    };
  }

  const pages: MarketPriceInterval[] = [];
  for (let page = 0; page < MAX_OFFSET_PAGES; page += 1) {
    const result = await requestMonthPage(
      monthKey,
      token,
      fetchImpl,
      page * PAGE_SIZE,
    );
    if (result.status === "unavailable") {
      if (result.reason === "no-data" && pages.length > 0) break;
      return result;
    }
    pages.push(...result.intervals);
  }
  if (pages.length === 0) {
    return unavailable(
      "schema",
      "Historiatietojen sivutus ei palauttanut tietoja.",
    );
  }
  const merged = mergeMarketPriceIntervals(pages);
  if (merged.status === "unavailable") {
    return unavailable(
      "schema",
      "Historiatietojen päällekkäisyyksiä ei voitu ratkaista.",
    );
  }
  return {
    status: "ready",
    intervals: merged.intervals,
    fetchedAt: new Date().toISOString(),
  };
}

async function cachedHistoryMonth(
  monthKey: string,
  currentMonthKey: string,
): Promise<HistoryMonthResult> {
  const isCurrent = monthKey === currentMonthKey;
  const cached = unstable_cache(
    async () => {
      const result = await fetchHistoryMonth(monthKey);
      if (result.status === "unavailable") throw new HistoryMonthError(result);
      return result;
    },
    ["sahkohetki-history-v1", monthKey, isCurrent ? "current" : "closed"],
    {
      revalidate: isCurrent
        ? CURRENT_MONTH_REVALIDATE_SECONDS
        : CLOSED_MONTH_REVALIDATE_SECONDS,
    },
  );
  try {
    return await cached();
  } catch (error) {
    if (error instanceof HistoryMonthError) return error.result;
    return unavailable("request", "Historiatietojen haku epäonnistui.");
  }
}

function requestContext(now: Date): {
  monthKeys: string[];
  todayDateKey: string;
  throughDateKey: string;
  requestedRange: { startDateKey: string; endDateKey: string };
} {
  const todayDateKey = getHelsinkiDateKey(now);
  const throughDateKey = addDays(todayDateKey, -1);
  const currentMonthKey = todayDateKey.slice(0, 7);
  const monthKeys = Array.from({ length: HISTORY_MONTH_COUNT }, (_, index) =>
    addMonths(currentMonthKey, index - (HISTORY_MONTH_COUNT - 1)),
  );
  return {
    monthKeys,
    todayDateKey,
    throughDateKey,
    requestedRange: {
      startDateKey: `${monthKeys[0]}-01`,
      endDateKey: throughDateKey,
    },
  };
}

export async function getHistoricalPrices(
  now = new Date(),
  fetchImpl?: FetchImplementation,
): Promise<HistoryLoadResult> {
  const context = requestContext(now);
  if (!process.env.ENTSOE_TOKEN?.trim()) {
    return {
      status: "unavailable",
      intervals: [],
      fetchedAt: null,
      requestedRange: context.requestedRange,
      missingRanges: [{ ...context.requestedRange, reason: "configuration" }],
      reason: "configuration",
      message:
        "Historiatietoja ei voitu hakea, koska lähteen käyttöoikeus puuttuu.",
    };
  }

  const currentMonthKey = context.todayDateKey.slice(0, 7);
  const results = await Promise.all(
    context.monthKeys.map((monthKey) =>
      fetchImpl
        ? fetchHistoryMonth(monthKey, fetchImpl)
        : cachedHistoryMonth(monthKey, currentMonthKey),
    ),
  );
  const missingRanges = results.flatMap((result, index) =>
    result.status === "unavailable"
      ? [
          {
            startDateKey: `${context.monthKeys[index]}-01`,
            endDateKey:
              lastDateOfMonth(context.monthKeys[index]) <
              context.requestedRange.endDateKey
                ? lastDateOfMonth(context.monthKeys[index])
                : context.requestedRange.endDateKey,
            reason: result.reason,
          },
        ]
      : [],
  );
  const candidates = results.flatMap((result) =>
    result.status === "ready" ? result.intervals : [],
  );
  if (candidates.length === 0) {
    const firstFailure = results.find(
      (
        result,
      ): result is Extract<HistoryMonthResult, { status: "unavailable" }> =>
        result.status === "unavailable",
    );
    return {
      status: "unavailable",
      intervals: [],
      fetchedAt: null,
      requestedRange: context.requestedRange,
      missingRanges,
      reason: firstFailure?.reason ?? "request",
      message: firstFailure?.message ?? "Historiatietojen haku epäonnistui.",
    };
  }

  const merged = mergeMarketPriceIntervals(candidates);
  if (merged.status === "unavailable") {
    return {
      status: "unavailable",
      intervals: [],
      fetchedAt: null,
      requestedRange: context.requestedRange,
      missingRanges,
      reason: "schema",
      message: "Historiatietojen päällekkäisyyksiä ei voitu ratkaista.",
    };
  }
  const fetchedAt = results
    .flatMap((result) => (result.status === "ready" ? [result.fetchedAt] : []))
    .sort()
    .at(-1)!;
  return {
    status: missingRanges.length > 0 ? "partial" : "ready",
    intervals: merged.intervals,
    fetchedAt,
    requestedRange: context.requestedRange,
    missingRanges,
  };
}

export async function getHistoryPageData(
  now = new Date(),
  fetchImpl?: FetchImplementation,
): Promise<HistoryPageData> {
  const context = requestContext(now);
  const result = await getHistoricalPrices(now, fetchImpl);
  if (result.status === "unavailable") {
    return buildHistoryPageData({
      intervals: [],
      throughDateKey: context.throughDateKey,
      fetchedAt: null,
      status: "unavailable",
      message: result.message,
      requestedRange: result.requestedRange,
      missingRanges: result.missingRanges,
    });
  }
  return buildHistoryPageData({
    intervals: result.intervals,
    throughDateKey: context.throughDateKey,
    fetchedAt: result.fetchedAt,
    status: result.status,
    message:
      result.status === "partial"
        ? "Osa historiatiedoista puuttuu. Tilastot sisältävät vain täydelliset jaksot."
        : undefined,
    requestedRange: result.requestedRange,
    missingRanges: result.missingRanges,
  });
}
