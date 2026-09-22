import type {
  CurrentElectricityState,
  ForecastFreshness,
  ForecastHorizon,
  ForecastInterval,
  ForecastSnapshot,
  ForecastSourceMetadata,
  MissingForecastInterval,
} from "./forecast-types";

export type ElectricityForecastApiResponse = {
  status: "complete" | "partial";
  timezone: "Europe/Helsinki";
  generatedAt: string;
  freshness: ForecastFreshness;
  horizon: ForecastHorizon;
  units: {
    power: "MW";
    capacityUtilization: "percent";
  };
  calculations: {
    domesticBalance: "productionMw - consumptionMw";
    domesticCoverage: "productionMw / consumptionMw * 100";
  };
  capacityModel: {
    kind: "forecast-model-estimate";
    description: string;
  };
  current: CurrentElectricityState;
  intervals: {
    quarterHour: ForecastInterval[];
    hourly: ForecastInterval[];
  };
  missing: MissingForecastInterval[];
  source: ForecastSourceMetadata;
};

function cloneInterval(interval: ForecastInterval): ForecastInterval {
  return { ...interval };
}

export function buildElectricityForecastApiResponse(
  snapshot: ForecastSnapshot,
): ElectricityForecastApiResponse {
  return {
    status: snapshot.missingIntervals.length === 0 ? "complete" : "partial",
    timezone: "Europe/Helsinki",
    generatedAt: snapshot.generatedAt,
    freshness: { ...snapshot.freshness },
    horizon: { ...snapshot.horizon },
    units: {
      power: "MW",
      capacityUtilization: "percent",
    },
    calculations: {
      domesticBalance: "productionMw - consumptionMw",
      domesticCoverage: "productionMw / consumptionMw * 100",
    },
    capacityModel: {
      kind: "forecast-model-estimate",
      description: snapshot.source.capacityDescription,
    },
    current: {
      production: snapshot.current.production
        ? { ...snapshot.current.production }
        : null,
      consumption: snapshot.current.consumption
        ? { ...snapshot.current.consumption }
        : null,
      netImport: snapshot.current.netImport
        ? { ...snapshot.current.netImport }
        : null,
      shortageStatus: snapshot.current.shortageStatus
        ? { ...snapshot.current.shortageStatus }
        : null,
    },
    intervals: {
      quarterHour: snapshot.quarterHour.map(cloneInterval),
      hourly: snapshot.hourly.map(cloneInterval),
    },
    missing: snapshot.missingIntervals.map((interval) => ({
      ...interval,
      missingSeries: [...interval.missingSeries],
    })),
    source: {
      ...snapshot.source,
      datasets: { ...snapshot.source.datasets },
    },
  };
}
