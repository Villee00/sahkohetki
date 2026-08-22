import type { EverydayUseId } from "./appliances";

export type PriceLevel = "cheap" | "normal" | "high";

export type QuarterPrice = {
  id: string;
  startAt: string;
  endAt: string;
  priceCentsPerKwh: number;
};

export type CostEstimate = {
  cents: number;
  euros: number;
  centsLabel: string;
  eurosLabel: string;
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
