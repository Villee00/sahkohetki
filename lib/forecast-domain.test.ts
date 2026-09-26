import { describe, expect, it } from "vitest";
import {
  aggregateForecastHours,
  buildForecastSeries,
} from "./forecast-domain";
import type {
  ForecastObservation,
  ForecastSeries,
} from "./forecast-types";

const QUARTER_MILLISECONDS = 15 * 60 * 1000;

function observation(
  series: ForecastSeries,
  startAt: string,
  valueMw: number,
  durationMilliseconds = QUARTER_MILLISECONDS,
): ForecastObservation {
  const startMilliseconds = Date.parse(startAt);
  return {
    series,
    startAt: new Date(startMilliseconds).toISOString(),
    endAt: new Date(startMilliseconds + durationMilliseconds).toISOString(),
    valueMw,
  };
}

function coreHour(
  startAt: string,
  productionMw: readonly number[],
  consumptionMw: readonly number[],
): ForecastObservation[] {
  const hourStart = Date.parse(startAt);
  return productionMw.flatMap((production, index) => {
    const quarterStart = new Date(
      hourStart + index * QUARTER_MILLISECONDS,
    ).toISOString();
    return [
      observation("production", quarterStart, production),
      observation("consumption", quarterStart, consumptionMw[index]),
    ];
  });
}

describe("electricity forecast domain", () => {
  it("aligns the horizon to the containing hour and calculates balance and coverage", () => {
    const result = buildForecastSeries(
      coreHour(
        "2026-08-22T10:00:00.000Z",
        [900, 1_000, 1_100, 1_200],
        [1_000, 1_000, 1_000, 1_000],
      ),
      new Date("2026-08-22T10:07:00.000Z"),
    );

    expect(result.horizon).toEqual({
      startAt: "2026-08-22T10:00:00.000Z",
      endAt: "2026-08-25T10:00:00.000Z",
      durationHours: 72,
    });
    expect(result.quarterHour).toHaveLength(72 * 4);
    expect(result.hourly).toHaveLength(72);
    expect(result.quarterHour[0]).toMatchObject({
      available: true,
      productionMw: 900,
      consumptionMw: 1_000,
      domesticBalanceMw: -100,
      domesticBalanceKind: "domestic-deficit",
      domesticCoveragePercent: 90,
      label: "13:00–13:15",
    });
    expect(result.hourly[0]).toMatchObject({
      available: true,
      productionMw: 1_050,
      consumptionMw: 1_000,
      domesticBalanceMw: 50,
      domesticBalanceKind: "domestic-surplus",
      domesticCoveragePercent: 105,
    });
  });

  it("keeps a missing core quarter at its real timestamp and invalidates that hour", () => {
    const firstHour = coreHour(
      "2026-08-22T10:00:00.000Z",
      [900, 900, 900],
      [1_000, 1_000, 1_000, 1_000],
    );
    firstHour.push(
      observation("consumption", "2026-08-22T10:45:00.000Z", 1_000),
    );
    const secondHour = coreHour(
      "2026-08-22T11:00:00.000Z",
      [1_200, 1_200, 1_200, 1_200],
      [1_000, 1_000, 1_000, 1_000],
    );

    const result = buildForecastSeries(
      [...firstHour, ...secondHour],
      new Date("2026-08-22T10:01:00.000Z"),
    );

    expect(result.quarterHour[3]).toMatchObject({
      startAt: "2026-08-22T10:45:00.000Z",
      available: false,
      productionMw: null,
      consumptionMw: 1_000,
      domesticBalanceMw: null,
    });
    expect(result.hourly[0]).toMatchObject({
      available: false,
      productionMw: null,
      consumptionMw: 1_000,
      domesticBalanceMw: null,
    });
    expect(result.hourly[1]).toMatchObject({
      startAt: "2026-08-22T11:00:00.000Z",
      available: true,
      domesticBalanceMw: 200,
    });
    expect(result.missingIntervals).toContainEqual({
      granularity: "quarter-hour",
      startAt: "2026-08-22T10:45:00.000Z",
      endAt: "2026-08-22T11:00:00.000Z",
      missingSeries: ["production"],
    });
  });

  it("does not let absent supporting forecasts invalidate a complete core point", () => {
    const result = buildForecastSeries(
      coreHour(
        "2026-08-22T10:00:00.000Z",
        [1_000, 1_000, 1_000, 1_000],
        [1_100, 1_100, 1_100, 1_100],
      ),
      new Date("2026-08-22T10:00:00.000Z"),
    );

    expect(result.hourly[0]).toMatchObject({
      available: true,
      windMw: null,
      solarMw: null,
      windCapacityMw: null,
      solarCapacityMw: null,
      windCapacityUtilizationPercent: null,
      solarCapacityUtilizationPercent: null,
    });
  });

  it("treats zero capacity as unavailable and preserves utilization above 100 percent", () => {
    const startAt = "2026-08-22T10:00:00.000Z";
    const observations = [
      ...coreHour(startAt, [1_000, 1_000, 1_000, 1_000], [900, 900, 900, 900]),
      observation("wind", startAt, 1_200, 60 * 60 * 1000),
      observation("solar", startAt, 300, 60 * 60 * 1000),
      observation("windCapacity", startAt, 1_000, 60 * 60 * 1000),
      observation("solarCapacity", startAt, 0, 60 * 60 * 1000),
    ];

    const result = buildForecastSeries(
      observations,
      new Date("2026-08-22T10:00:00.000Z"),
    );

    expect(result.quarterHour[0]).toMatchObject({
      windCapacityUtilizationPercent: 120,
      solarCapacityUtilizationPercent: null,
    });
    expect(result.hourly[0]).toMatchObject({
      windMw: 1_200,
      windCapacityMw: 1_000,
      windCapacityUtilizationPercent: 120,
      solarMw: 300,
      solarCapacityMw: 0,
      solarCapacityUtilizationPercent: null,
    });
  });

  it("ignores misaligned core observations instead of shifting them into a slot", () => {
    const result = buildForecastSeries(
      [
        observation("production", "2026-08-22T10:01:00.000Z", 900),
        observation("consumption", "2026-08-22T10:00:00.000Z", 1_000),
      ],
      new Date("2026-08-22T10:00:00.000Z"),
    );

    expect(result.quarterHour[0]).toMatchObject({
      startAt: "2026-08-22T10:00:00.000Z",
      productionMw: null,
      consumptionMw: 1_000,
      available: false,
    });
  });

  it("aggregates only four contiguous quarters for each core series", () => {
    const result = buildForecastSeries(
      coreHour(
        "2026-08-22T10:00:00.000Z",
        [1_000, 1_000, 1_000, 1_000],
        [900, 900, 900, 900],
      ),
      new Date("2026-08-22T10:00:00.000Z"),
    );

    expect(aggregateForecastHours(result.quarterHour).slice(0, 2)).toMatchObject([
      { available: true, domesticBalanceMw: 100 },
      { available: false, domesticBalanceMw: null },
    ]);
  });

  it("keeps 72 elapsed hours and disambiguates repeated Helsinki hours at DST end", () => {
    const horizonStart = Date.parse("2026-10-24T23:00:00.000Z");
    const observations: ForecastObservation[] = [];
    for (let index = 0; index < 72 * 4; index += 1) {
      const startAt = new Date(
        horizonStart + index * QUARTER_MILLISECONDS,
      ).toISOString();
      observations.push(observation("production", startAt, 1_000));
      observations.push(observation("consumption", startAt, 1_000));
    }

    const result = buildForecastSeries(
      observations,
      new Date("2026-10-24T23:07:00.000Z"),
    );

    expect(result.hourly).toHaveLength(72);
    expect(
      Date.parse(result.horizon.endAt) - Date.parse(result.horizon.startAt),
    ).toBe(72 * 60 * 60 * 1000);
    expect(result.hourly.map((point) => point.label)).toContain(
      "03:00–03:00 (UTC+3→UTC+2)",
    );
    expect(result.hourly.map((point) => point.label)).toContain(
      "03:00–04:00 (UTC+2)",
    );
    expect(new Set(result.hourly.map((point) => point.id)).size).toBe(72);
  });
});
