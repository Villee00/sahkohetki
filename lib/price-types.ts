import type { EverydayUse, EverydayUseId } from "./appliances";

export type PriceLevel = "cheap" | "normal" | "high";

export type QuarterPrice = {
  id: string;
  startAt: string;
  endAt: string;
  priceCentsPerKwh: number;
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

export type ExplorerData = {
  fetchedAt: string | null;
  source: ExplorerSource;
  currentQuarterId: string | null;
  currentHourId: string | null;
  next24Hours: HorizonPoints;
  tomorrow: HorizonPoints;
  uses: readonly EverydayUse[];
  status: "ready" | "unavailable";
  message?: string;
};
