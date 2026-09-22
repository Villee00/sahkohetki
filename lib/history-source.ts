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
      status: "partial";
      intervals: MarketPriceInterval[];
      fetchedAt: string;
      reason: HistoryFailureReason;
      message: string;
    }
  | {
      status: "unavailable";
      reason: HistoryFailureReason;
      message: string;
    };

class HistoryMonthError extends Error {
  readonly result: Exclude<HistoryMonthResult, { status: "ready" }>;

  constructor(result: Exclude<HistoryMonthResult, { status: "ready" }>) {
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

  let parsed: ReturnType<typeof parseEntsoePriceXml>;
  try {
    parsed = parseEntsoePriceXml(await response.text());
  } catch {
    return unavailable("request", "Historiatietojen haku epäonnistui.");
  }
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
  let paginationComplete = false;
  for (let page = 0; page < MAX_OFFSET_PAGES; page += 1) {
    const result = await requestMonthPage(
      monthKey,
      token,
      fetchImpl,
      page * PAGE_SIZE,
    );
    if (result.status === "unavailable") {
      if (result.reason === "no-data" && pages.length > 0) {
        paginationComplete = true;
        break;
      }
      if (pages.length > 0) {
        const merged = mergeMarketPriceIntervals(pages);
        if (merged.status === "unavailable") {
          return unavailable(
            "schema",
            "Historiatietojen päällekkäisyyksiä ei voitu ratkaista.",
          );
        }
        return {
          status: "partial",
          intervals: merged.intervals,
          fetchedAt: new Date().toISOString(),
          reason: result.reason,
          message: result.message,
        };
      }
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
  const fetchedAt = new Date().toISOString();
  return paginationComplete
    ? { status: "ready", intervals: merged.intervals, fetchedAt }
    : {
        status: "partial",
        intervals: merged.intervals,
        fetchedAt,
        reason: "too-many-documents",
        message: "Historiatietojen sivutusraja ylittyi.",
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
      if (result.status !== "ready") throw new HistoryMonthError(result);
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

function describeCoverage(
  intervals: readonly MarketPriceInterval[],
  requestedRange: { startDateKey: string; endDateKey: string },
  forcedMissingByMonth: ReadonlyMap<string, HistoryFailureReason>,
): {
  availableRange: { startDateKey: string; endDateKey: string } | null;
  missingRanges: Array<{
    startDateKey: string;
    endDateKey: string;
    reason: HistoryFailureReason;
  }>;
} {
  const completeDates: string[] = [];
  const missingDates: Array<{
    dateKey: string;
    reason: HistoryFailureReason;
  }> = [];
  let intervalIndex = 0;

  for (
    let dateKey = requestedRange.startDateKey;
    dateKey <= requestedRange.endDateKey;
    dateKey = addDays(dateKey, 1)
  ) {
    const forcedReason = forcedMissingByMonth.get(dateKey.slice(0, 7));
    if (forcedReason) {
      missingDates.push({ dateKey, reason: forcedReason });
      continue;
    }

    const bounds = getHelsinkiDateBounds(dateKey);
    const start = Date.parse(bounds.startAt);
    const end = Date.parse(bounds.endAt);
    while (
      intervalIndex < intervals.length &&
      Date.parse(intervals[intervalIndex].endAt) <= start
    ) {
      intervalIndex += 1;
    }

    let cursor = start;
    let candidateIndex = intervalIndex;
    while (candidateIndex < intervals.length) {
      const interval = intervals[candidateIndex];
      const intervalStart = Date.parse(interval.startAt);
      const intervalEnd = Date.parse(interval.endAt);
      if (intervalStart >= end) break;
      if (intervalStart !== cursor || intervalEnd > end) break;
      cursor = intervalEnd;
      candidateIndex += 1;
    }

    if (cursor === end) completeDates.push(dateKey);
    else missingDates.push({ dateKey, reason: "no-data" });
  }

  const missingRanges = missingDates.reduce<
    Array<{
      startDateKey: string;
      endDateKey: string;
      reason: HistoryFailureReason;
    }>
  >((ranges, missing) => {
    const previous = ranges.at(-1);
    if (
      previous &&
      previous.reason === missing.reason &&
      addDays(previous.endDateKey, 1) === missing.dateKey
    ) {
      previous.endDateKey = missing.dateKey;
    } else {
      ranges.push({
        startDateKey: missing.dateKey,
        endDateKey: missing.dateKey,
        reason: missing.reason,
      });
    }
    return ranges;
  }, []);

  return {
    availableRange:
      completeDates.length > 0
        ? {
            startDateKey: completeDates[0],
            endDateKey: completeDates.at(-1)!,
          }
        : null,
    missingRanges,
  };
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
      availableRange: null,
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
  const forcedMissingByMonth = new Map<string, HistoryFailureReason>();
  results.forEach((result, index) => {
    if (result.status !== "ready") {
      forcedMissingByMonth.set(context.monthKeys[index], result.reason);
    }
  });
  const candidates = results.flatMap((result) =>
    result.status === "unavailable" ? [] : result.intervals,
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
      availableRange: null,
      missingRanges: describeCoverage(
        [],
        context.requestedRange,
        forcedMissingByMonth,
      ).missingRanges,
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
      availableRange: null,
      missingRanges: [
        { ...context.requestedRange, reason: "schema" },
      ],
      reason: "schema",
      message: "Historiatietojen päällekkäisyyksiä ei voitu ratkaista.",
    };
  }
  const fetchedAt = results
    .flatMap((result) =>
      result.status === "unavailable" ? [] : [result.fetchedAt],
    )
    .sort()
    .at(-1)!;
  const coverage = describeCoverage(
    merged.intervals,
    context.requestedRange,
    forcedMissingByMonth,
  );
  return {
    status: coverage.missingRanges.length > 0 ? "partial" : "ready",
    intervals: merged.intervals,
    fetchedAt,
    requestedRange: context.requestedRange,
    availableRange: coverage.availableRange,
    missingRanges: coverage.missingRanges,
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
  const analyticsIntervals = result.intervals.filter((interval) => {
    const dateKey = getHelsinkiDateKey(interval.startAt);
    return !result.missingRanges.some(
      (range) =>
        dateKey >= range.startDateKey && dateKey <= range.endDateKey,
    );
  });
  return buildHistoryPageData({
    intervals: analyticsIntervals,
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
