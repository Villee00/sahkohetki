import type { ExplorerSource } from "./price-types";

export type HistoryGranularity = "day" | "week" | "month";
export type HistoryPriceBasis = "household" | "raw";
export type HistoryPercentileBand =
  | "very-low"
  | "low"
  | "typical"
  | "high"
  | "very-high";

export type HistoryAverage = {
  rawEurPerMwh: number;
  householdCentsPerKwh: number;
};

export type HistoryDayCell = {
  dateKey: string;
  complete: boolean;
  expectedMinutes: number;
  average: HistoryAverage | null;
};

export type HistoryPeriodSummary = {
  id: string;
  granularity: HistoryGranularity;
  startDateKey: string;
  endDateKey: string;
  expectedMinutes: number;
  average: HistoryAverage;
  negativePricePercent: number;
  longestExpensiveStreakHours: number;
  previousId: string | null;
  percentileRank: { raw: number; household: number };
  percentileBand: {
    raw: HistoryPercentileBand;
    household: HistoryPercentileBand;
  };
};

export type PercentileDistribution = {
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
};

export type HistoryPageData = {
  status: "ready" | "partial" | "unavailable";
  message?: string;
  fetchedAt: string | null;
  requestedRange: { startDateKey: string; endDateKey: string } | null;
  availableRange: { startDateKey: string; endDateKey: string } | null;
  missingRanges: readonly {
    startDateKey: string;
    endDateKey: string;
    reason: string;
  }[];
  source: ExplorerSource;
  days: HistoryDayCell[];
  periods: Record<HistoryGranularity, HistoryPeriodSummary[]>;
  distributions: Record<
    HistoryGranularity,
    {
      rawEurPerMwh: PercentileDistribution;
      householdCentsPerKwh: PercentileDistribution;
    }
  >;
};

export type HistoryFailureReason =
  | "configuration"
  | "request"
  | "rate-limit"
  | "too-many-documents"
  | "acknowledgement"
  | "schema"
  | "no-data";

export type HistoryLoadResult =
  | {
      status: "ready" | "partial";
      intervals: import("./entsoe-prices").MarketPriceInterval[];
      fetchedAt: string;
      requestedRange: { startDateKey: string; endDateKey: string };
      availableRange: {
        startDateKey: string;
        endDateKey: string;
      } | null;
      missingRanges: Array<{
        startDateKey: string;
        endDateKey: string;
        reason: HistoryFailureReason;
      }>;
    }
  | {
      status: "unavailable";
      intervals: [];
      fetchedAt: null;
      requestedRange: { startDateKey: string; endDateKey: string };
      availableRange: null;
      missingRanges: Array<{
        startDateKey: string;
        endDateKey: string;
        reason: HistoryFailureReason;
      }>;
      reason: HistoryFailureReason;
      message: string;
    };
