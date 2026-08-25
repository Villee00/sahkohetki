import type { EverydayUse, EverydayUseId } from "./appliances";

export type PriceLevel = "cheap" | "normal" | "high";

export const PRICE_LEVEL_CUTOFFS = {
  cheapMaxCents: 5,
  normalMaxCents: 14,
} as const;

export const PRICE_SCALE_BOUNDS = {
  minimumCents: 0,
  maximumCents: 20,
} as const;

export type QuarterPrice = {
  id: string;
  startAt: string;
  endAt: string;
  priceCentsPerKwh: number;
  carriedForward?: boolean;
};

export type CostComparison = {
  title: string;
  detail: string;
};

export type CostEstimate = {
  cents: number;
  euros: number;
  centsLabel: string;
  eurosLabel: string;
  comparison?: CostComparison;
};

export type PricePoint = {
  id: string;
  startAt: string;
  endAt: string;
  label: string;
  priceCentsPerKwh: number | null;
  available: boolean;
  carriedForward?: boolean;
  unavailableReason?: "missing-quarter" | "source-gap";
  level?: PriceLevel;
  estimates?: Record<EverydayUseId, CostEstimate>;
};

export type HorizonPoints = {
  hourly: PricePoint[];
  quarterHour: PricePoint[];
};

export type ExplorerSource = {
  name: string;
  pricesUrl: string;
  apiUrl: string;
  documentationUrl: string;
};

export const EXPLORER_SOURCE: ExplorerSource = {
  name: "ENTSO-E",
  pricesUrl: "https://transparency.entsoe.eu/",
  apiUrl: "https://web-api.tp.entsoe.eu/api",
  documentationUrl:
    "https://transparency.entsoe.eu/content/static_content/download?path=%2FStatic+content%2Fweb+api%2FRestfulAPI_IG.pdf",
};

export type ExplorerData = {
  fetchedAt: string | null;
  source: ExplorerSource;
  currentQuarterId: string | null;
  currentHourId: string | null;
  today: HorizonPoints;
  tomorrow: HorizonPoints;
  uses: readonly EverydayUse[];
  status: "ready" | "unavailable";
  message?: string;
};
