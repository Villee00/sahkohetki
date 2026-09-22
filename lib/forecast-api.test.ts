import { describe, expect, it } from "vitest";
import { buildElectricityForecastApiResponse } from "./forecast-api";
import type { ForecastInterval, ForecastSnapshot } from "./forecast-types";

const interval: ForecastInterval = {
  id: "2026-09-22T12:00:00.000Z",
  granularity: "quarter-hour",
  startAt: "2026-09-22T12:00:00.000Z",
  endAt: "2026-09-22T12:15:00.000Z",
  label: "15:00–15:15",
  available: true,
  productionMw: 9_000,
  consumptionMw: 10_000,
  domesticBalanceMw: -1_000,
  domesticBalanceKind: "domestic-deficit",
  domesticCoveragePercent: 90,
  windMw: 2_500,
  solarMw: 700,
  windCapacityMw: 8_000,
  solarCapacityMw: 1_400,
  windCapacityUtilizationPercent: 31.25,
  solarCapacityUtilizationPercent: 50,
};

const forecastSnapshotFixture: ForecastSnapshot = {
  status: "ready",
  generatedAt: "2026-09-22T12:02:00.000Z",
  freshness: {
    state: "fresh",
    fetchedAt: "2026-09-22T12:02:00.000Z",
    ageSeconds: 0,
  },
  horizon: {
    startAt: "2026-09-22T12:00:00.000Z",
    endAt: "2026-09-25T12:00:00.000Z",
    durationHours: 72,
  },
  quarterHour: [interval],
  hourly: [
    {
      ...interval,
      granularity: "hour",
      endAt: "2026-09-22T13:00:00.000Z",
      label: "15:00–16:00",
    },
  ],
  missingIntervals: [],
  current: {
    production: {
      valueMw: 8_850,
      observedAt: "2026-09-22T11:58:00.000Z",
    },
    consumption: {
      valueMw: 10_100,
      observedAt: "2026-09-22T11:58:00.000Z",
    },
    netImport: {
      valueMw: 1_250,
      observedAt: "2026-09-22T11:58:00.000Z",
    },
    shortageStatus: {
      code: 0,
      level: "normal",
      observedAt: "2026-09-22T11:57:00.000Z",
    },
  },
  source: {
    name: "Fingrid Open Data",
    homepageUrl: "https://data.fingrid.fi/en",
    apiUrl: "https://data.fingrid.fi/api/data",
    datasets: {
      consumptionForecast: 166,
      productionForecast: 241,
    },
    capacityDescription: "Forecast-model estimates.",
  },
};

describe("electricity forecast API projection", () => {
  it("maps a complete snapshot with explicit units and calculation semantics", () => {
    const response = buildElectricityForecastApiResponse(
      forecastSnapshotFixture,
    );

    expect(response).toMatchObject({
      status: "complete",
      timezone: "Europe/Helsinki",
      generatedAt: "2026-09-22T12:02:00.000Z",
      freshness: {
        state: "fresh",
        fetchedAt: "2026-09-22T12:02:00.000Z",
        ageSeconds: 0,
      },
      horizon: {
        startAt: "2026-09-22T12:00:00.000Z",
        endAt: "2026-09-25T12:00:00.000Z",
        durationHours: 72,
      },
      units: { power: "MW", capacityUtilization: "percent" },
      calculations: {
        domesticBalance: "productionMw - consumptionMw",
        domesticCoverage: "productionMw / consumptionMw * 100",
      },
      capacityModel: {
        kind: "forecast-model-estimate",
        description: "Forecast-model estimates.",
      },
      source: { name: "Fingrid Open Data" },
    });
    expect(response.intervals.quarterHour[0]).toEqual(interval);
    expect(response.current.netImport?.valueMw).toBe(1_250);
    expect(response.missing).toEqual([]);
  });

  it("marks missing core intervals partial while preserving their null-valued slots", () => {
    const missingInterval: ForecastInterval = {
      ...interval,
      available: false,
      productionMw: null,
      domesticBalanceMw: null,
      domesticBalanceKind: null,
      domesticCoveragePercent: null,
    };
    const response = buildElectricityForecastApiResponse({
      ...forecastSnapshotFixture,
      quarterHour: [missingInterval],
      missingIntervals: [
        {
          granularity: "quarter-hour",
          startAt: missingInterval.startAt,
          endAt: missingInterval.endAt,
          missingSeries: ["production"],
        },
      ],
    });

    expect(response.status).toBe("partial");
    expect(response.intervals.quarterHour).toEqual([missingInterval]);
    expect(response.missing).toEqual([
      {
        granularity: "quarter-hour",
        startAt: missingInterval.startAt,
        endAt: missingInterval.endAt,
        missingSeries: ["production"],
      },
    ]);
  });

  it("keeps staleness separate from data completeness", () => {
    const response = buildElectricityForecastApiResponse({
      ...forecastSnapshotFixture,
      freshness: {
        state: "stale",
        fetchedAt: "2026-09-22T11:58:00.000Z",
        ageSeconds: 240,
      },
    });

    expect(response.status).toBe("complete");
    expect(response.freshness).toEqual({
      state: "stale",
      fetchedAt: "2026-09-22T11:58:00.000Z",
      ageSeconds: 240,
    });
  });
});
