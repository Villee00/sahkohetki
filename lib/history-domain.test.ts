import { describe, expect, it } from "vitest";
import type { MarketPriceInterval } from "./entsoe-prices";
import { buildHistoryPageData } from "./history-domain";
import { getHelsinkiDateBounds } from "./time";

function interval(
  start: number,
  minutes: 15 | 60,
  priceEurPerMwh: number,
): MarketPriceInterval {
  const startAt = new Date(start).toISOString();
  return {
    id: `doc:1:series:${startAt}`,
    startAt,
    endAt: new Date(start + minutes * 60 * 1000).toISOString(),
    resolutionMinutes: minutes,
    priceEurPerMwh,
    documentId: "doc",
    documentRevision: 1,
    documentCreatedAt: "2026-01-01T00:00:00.000Z",
    seriesId: "series",
    processType: "A01",
    contractType: "A01",
    carriedForward: false,
  };
}

function dayIntervals(
  dateKey: string,
  price: number | ((hour: number) => number),
  resolution: 15 | 60 = 60,
): MarketPriceInterval[] {
  const bounds = getHelsinkiDateBounds(dateKey);
  const start = Date.parse(bounds.startAt);
  const end = Date.parse(bounds.endAt);
  const step = resolution * 60 * 1000;
  const values: MarketPriceInterval[] = [];
  for (let instant = start, index = 0; instant < end; instant += step, index += 1) {
    values.push(
      interval(
        instant,
        resolution,
        typeof price === "function"
          ? price(Math.floor((index * resolution) / 60))
          : price,
      ),
    );
  }
  return values;
}

function dateKeys(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  while (current.getTime() <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

describe("historical price analytics", () => {
  it("duration-weights mixed resolutions and reports negative prices and expensive-hour streaks", () => {
    const bounds = getHelsinkiDateBounds("2026-01-15");
    const start = Date.parse(bounds.startAt);
    const intervals = [
      interval(start, 60, 120),
      interval(start + 60 * 60 * 1000, 60, 120),
      interval(start + 2 * 60 * 60 * 1000, 60, -10),
      ...Array.from({ length: 84 }, (_, index) =>
        interval(start + (3 * 60 + index * 15) * 60 * 1000, 15, 20),
      ),
    ];

    const data = buildHistoryPageData({
      intervals,
      throughDateKey: "2026-01-15",
      fetchedAt: "2026-01-16T00:00:00.000Z",
    });

    expect(data.days).toHaveLength(1);
    expect(data.days[0].complete).toBe(true);
    expect(data.periods.day).toHaveLength(1);
    expect(data.periods.day[0].average.rawEurPerMwh).toBeCloseTo(27.083333, 6);
    expect(data.periods.day[0].average.householdCentsPerKwh).toBeCloseTo(
      3.398958,
      6,
    );
    expect(data.periods.day[0].negativePricePercent).toBeCloseTo(100 / 24, 6);
    expect(data.periods.day[0].longestExpensiveStreakHours).toBe(2);
  });

  it("treats Finnish 23-hour and 25-hour DST dates as complete", () => {
    const intervals = [
      ...dayIntervals("2026-03-29", 30),
      ...dayIntervals("2026-10-25", 40),
    ];

    const data = buildHistoryPageData({
      intervals,
      throughDateKey: "2026-10-25",
      fetchedAt: null,
    });

    const spring = data.days.find((day) => day.dateKey === "2026-03-29");
    const autumn = data.days.find((day) => day.dateKey === "2026-10-25");
    expect(spring).toMatchObject({ complete: true, expectedMinutes: 23 * 60 });
    expect(autumn).toMatchObject({ complete: true, expectedMinutes: 25 * 60 });
  });

  it("keeps missing dates visible but excludes incomplete periods from statistics", () => {
    const complete = dayIntervals("2026-02-01", 20);
    const incomplete = dayIntervals("2026-02-02", 30).slice(1);

    const data = buildHistoryPageData({
      intervals: [...complete, ...incomplete],
      throughDateKey: "2026-02-02",
      fetchedAt: null,
    });

    expect(data.days).toEqual([
      expect.objectContaining({ dateKey: "2026-02-01", complete: true }),
      expect.objectContaining({ dateKey: "2026-02-02", complete: false }),
    ]);
    expect(data.periods.day.map((period) => period.id)).toEqual([
      "day:2026-02-01",
    ]);
  });

  it("links preceding calendar periods across year boundaries", () => {
    const intervals = dateKeys("2025-12-01", "2026-01-31").flatMap(
      (dateKey) => dayIntervals(dateKey, dateKey.startsWith("2025") ? 20 : 40),
    );

    const data = buildHistoryPageData({
      intervals,
      throughDateKey: "2026-01-31",
      fetchedAt: null,
    });

    expect(data.periods.day.at(-1)?.previousId).toBe("day:2026-01-30");
    expect(data.periods.week.find((period) => period.id === "week:2026-01-05"))
      .toMatchObject({ previousId: "week:2025-12-29" });
    expect(data.periods.month.find((period) => period.id === "month:2026-01"))
      .toMatchObject({ previousId: "month:2025-12" });
  });

  it("calculates percentile distributions and ranks from complete aligned periods", () => {
    const intervals = [10, 20, 30, 40].flatMap((price, index) =>
      dayIntervals(`2026-04-0${index + 1}`, price),
    );

    const data = buildHistoryPageData({
      intervals,
      throughDateKey: "2026-04-04",
      fetchedAt: null,
    });

    expect(data.distributions.day.rawEurPerMwh).toEqual({
      p10: 13,
      p25: 17.5,
      p50: 25,
      p75: 32.5,
      p90: 37,
    });
    expect(data.periods.day.map((period) => period.percentileRank.raw)).toEqual([
      25, 50, 75, 100,
    ]);
    expect(data.periods.day.map((period) => period.percentileBand.raw)).toEqual([
      "low",
      "typical",
      "high",
      "very-high",
    ]);
  });
});
