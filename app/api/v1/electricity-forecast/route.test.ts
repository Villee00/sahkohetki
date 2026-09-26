import { afterEach, describe, expect, it, vi } from "vitest";
import { getElectricityForecast } from "../../../../lib/fingrid-source";
import type { ForecastSnapshot } from "../../../../lib/forecast-types";
import { GET } from "./route";

vi.mock("../../../../lib/fingrid-source", () => ({
  getElectricityForecast: vi.fn(),
}));

const getElectricityForecastMock = vi.mocked(getElectricityForecast);

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
  quarterHour: [
    {
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
    },
  ],
  hourly: [],
  missingIntervals: [],
  current: {
    production: null,
    consumption: null,
    netImport: null,
    shortageStatus: null,
  },
  source: {
    name: "Fingrid Open Data",
    homepageUrl: "https://data.fingrid.fi/en",
    apiUrl: "https://data.fingrid.fi/api/data",
    datasets: { productionForecast: 241, consumptionForecast: 166 },
    capacityDescription: "Forecast-model estimates.",
  },
};

afterEach(() => vi.resetAllMocks());

describe("GET /api/v1/electricity-forecast", () => {
  it("returns the shared forecast projection with a short public cache", async () => {
    getElectricityForecastMock.mockResolvedValue(forecastSnapshotFixture);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "complete",
      timezone: "Europe/Helsinki",
      intervals: { quarterHour: [expect.objectContaining({ productionMw: 9_000 })] },
    });
    expect(getElectricityForecastMock).toHaveBeenCalledWith(expect.any(Date));
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=60, stale-while-revalidate=120",
    );
  });

  it("returns partial snapshots successfully", async () => {
    getElectricityForecastMock.mockResolvedValue({
      ...forecastSnapshotFixture,
      missingIntervals: [
        {
          granularity: "quarter-hour",
          startAt: "2026-09-22T12:00:00.000Z",
          endAt: "2026-09-22T12:15:00.000Z",
          missingSeries: ["production"],
        },
      ],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "partial" });
  });

  it("does not cache an already stale successful snapshot", async () => {
    getElectricityForecastMock.mockResolvedValue({
      ...forecastSnapshotFixture,
      freshness: {
        state: "stale",
        fetchedAt: "2026-09-22T11:58:00.000Z",
        ageSeconds: 240,
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      freshness: { state: "stale" },
    });
  });

  it("returns a generic non-cacheable 503 without leaking source details", async () => {
    getElectricityForecastMock.mockResolvedValue({
      status: "unavailable",
      reason: "missing-configuration",
      message: "FINGRID_API_KEY=secret-value",
    });

    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "source_unavailable",
        message: "Electricity forecast data is currently unavailable.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret-value");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a generic non-cacheable 500 for unexpected failures", async () => {
    getElectricityForecastMock.mockRejectedValue(new Error("unexpected"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "The electricity forecast service failed unexpectedly.",
      },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
