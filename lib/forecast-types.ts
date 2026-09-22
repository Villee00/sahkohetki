export type ForecastSeries =
  | "production"
  | "consumption"
  | "wind"
  | "solar"
  | "windCapacity"
  | "solarCapacity";

export type CoreForecastSeries = "production" | "consumption";

export type ForecastObservation = {
  series: ForecastSeries;
  startAt: string;
  endAt: string;
  valueMw: number;
};

export type ForecastGranularity = "quarter-hour" | "hour";

export type ForecastBalanceKind =
  | "domestic-surplus"
  | "domestic-deficit"
  | "balanced";

export type ForecastInterval = {
  id: string;
  granularity: ForecastGranularity;
  startAt: string;
  endAt: string;
  label: string;
  available: boolean;
  productionMw: number | null;
  consumptionMw: number | null;
  domesticBalanceMw: number | null;
  domesticBalanceKind: ForecastBalanceKind | null;
  domesticCoveragePercent: number | null;
  windMw: number | null;
  solarMw: number | null;
  windCapacityMw: number | null;
  solarCapacityMw: number | null;
  windCapacityUtilizationPercent: number | null;
  solarCapacityUtilizationPercent: number | null;
};

export type MissingForecastInterval = {
  granularity: ForecastGranularity;
  startAt: string;
  endAt: string;
  missingSeries: CoreForecastSeries[];
};

export type ForecastHorizon = {
  startAt: string;
  endAt: string;
  durationHours: number;
};

export type ForecastSeriesResult = {
  horizon: ForecastHorizon;
  quarterHour: ForecastInterval[];
  hourly: ForecastInterval[];
  missingIntervals: MissingForecastInterval[];
};

export type PowerMeasurement = {
  valueMw: number;
  observedAt: string;
};

export type ElectricityShortageLevel =
  | "normal"
  | "shortage-possible"
  | "high-risk"
  | "shortage";

export type ElectricityShortageMeasurement = {
  code: 0 | 1 | 2 | 3;
  level: ElectricityShortageLevel;
  observedAt: string;
};

export type CurrentElectricityState = {
  production: PowerMeasurement | null;
  consumption: PowerMeasurement | null;
  netImport: PowerMeasurement | null;
  shortageStatus: ElectricityShortageMeasurement | null;
};

export type ForecastFreshness = {
  state: "fresh" | "stale";
  fetchedAt: string;
  ageSeconds: number;
};

export type ForecastSourceMetadata = {
  name: string;
  homepageUrl: string;
  apiUrl: string;
  datasets: Record<string, number>;
  capacityDescription: string;
};

export type ForecastSnapshot = ForecastSeriesResult & {
  status: "ready";
  generatedAt: string;
  freshness: ForecastFreshness;
  current: CurrentElectricityState;
  source: ForecastSourceMetadata;
};

export type ForecastUnavailableReason =
  | "missing-configuration"
  | "source-unavailable"
  | "source-malformed"
  | "snapshot-expired";

export type ForecastUnavailableResult = {
  status: "unavailable";
  reason: ForecastUnavailableReason;
  message: string;
};

export type ElectricityForecastResult =
  | ForecastSnapshot
  | ForecastUnavailableResult;
