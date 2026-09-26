import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMockElectricityForecast,
  getMockHistoricalLoad,
  getMockMunicipalityLocation,
  getMockQuarterPrices,
  isMockDataEnabled,
} from "./mock-data";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mock data environment", () => {
  it("detects mock data flags correctly", () => {
    expect(isMockDataEnabled()).toBe(false);

    vi.stubEnv("SAHKO_MOCK_DATA", "1");
    expect(isMockDataEnabled()).toBe(true);

    vi.stubEnv("SAHKO_MOCK_DATA", "true");
    expect(isMockDataEnabled()).toBe(true);

    vi.stubEnv("SAHKO_MOCK_DATA", "0");
    vi.stubEnv("MOCK_DATA", "true");
    expect(isMockDataEnabled()).toBe(true);

    vi.stubEnv("MOCK_DATA", "0");
    vi.stubEnv("MOCK", "true");
    expect(isMockDataEnabled()).toBe(true);

    vi.stubEnv("MOCK", "0");
    vi.stubEnv("ENTSOE_TOKEN", "mock");
    expect(isMockDataEnabled()).toBe(true);

    vi.stubEnv("ENTSOE_TOKEN", "");
    expect(isMockDataEnabled()).toBe(false);
  });

  it("generates 96 quarter-hour prices per day for today and tomorrow", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const prices = getMockQuarterPrices(now);

    // 2 days * 96 quarters = 192 intervals
    expect(prices).toHaveLength(192);
    expect(prices[0]).toHaveProperty("id");
    expect(prices[0]).toHaveProperty("startAt");
    expect(prices[0]).toHaveProperty("endAt");
    expect(prices[0]).toHaveProperty("priceCentsPerKwh");
    expect(typeof prices[0].priceCentsPerKwh).toBe("number");
  });

  it("generates 14 months of historical load", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const history = getMockHistoricalLoad(now);

    expect(history.status).toBe("ready");
    expect(history.intervals.length).toBeGreaterThan(8000);
    expect(history.missingRanges).toHaveLength(0);
    expect(history.requestedRange).toBeDefined();
    expect(history.availableRange).toEqual(history.requestedRange);
  });

  it("resolves mock municipality locations for coordinates in Finland", () => {
    // Helsinki
    expect(getMockMunicipalityLocation(60.1699, 24.9384)).toEqual({
      municipalityCode: "091",
      municipalityName: "Helsinki",
    });

    // Tampere
    expect(getMockMunicipalityLocation(61.498, 23.761)).toEqual({
      municipalityCode: "837",
      municipalityName: "Tampere",
    });

    // Oulu
    expect(getMockMunicipalityLocation(65.012, 25.468)).toEqual({
      municipalityCode: "564",
      municipalityName: "Oulu",
    });

    // Turku
    expect(getMockMunicipalityLocation(60.451, 22.266)).toEqual({
      municipalityCode: "853",
      municipalityName: "Turku",
    });

    // Outside Finland
    expect(getMockMunicipalityLocation(0, 0)).toBeNull();
    expect(getMockMunicipalityLocation(48.8566, 2.3522)).toBeNull();
  });

  it("generates 72 hours of mock electricity forecast data", () => {
    const now = new Date("2026-09-22T12:00:00.000Z");
    const forecast = getMockElectricityForecast(now);

    expect(forecast.status).toBe("ready");
    if (forecast.status === "unavailable") throw new Error("Expected ready");
    expect(forecast.source.name).toBe("Synteettinen esimerkkidata");
    expect(forecast.quarterHour).toHaveLength(288);
    expect(forecast.hourly).toHaveLength(72);
    expect(forecast.current.production?.valueMw).toBe(9500);
    expect(forecast.current.consumption?.valueMw).toBe(9100);
    expect(forecast.current.netImport?.valueMw).toBe(-400);
    expect(forecast.current.shortageStatus?.level).toBe("normal");
  });
});
