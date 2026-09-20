import { describe, expect, it } from "vitest";
import { buildPriceApiResponse } from "./price-api";
import type { QuarterPrice } from "./price-types";

const QUARTER_MILLISECONDS = 15 * 60 * 1000;

function sourceFrom(startAt: string, count: number): QuarterPrice[] {
  const startMilliseconds = Date.parse(startAt);
  return Array.from({ length: count }, (_, index) => {
    const slotStart = startMilliseconds + index * QUARTER_MILLISECONDS;
    return {
      id: String(slotStart),
      startAt: new Date(slotStart).toISOString(),
      endAt: new Date(slotStart + QUARTER_MILLISECONDS).toISOString(),
      priceCentsPerKwh: 5 + (index % 5),
    };
  });
}

describe("price API projection", () => {
  it("returns a complete today payload with current values and both resolutions", () => {
    const response = buildPriceApiResponse({
      quarterPrices: sourceFrom("2026-08-21T21:00:00.000Z", 192),
      now: new Date("2026-08-22T12:07:00.000Z"),
      fetchedAt: "2026-08-22T12:10:00.000Z",
      horizon: "today",
    });

    expect(response).toMatchObject({
      status: "complete",
      timezone: "Europe/Helsinki",
      horizon: {
        name: "today",
        date: "2026-08-22",
        startAt: "2026-08-21T21:00:00.000Z",
        endAt: "2026-08-22T21:00:00.000Z",
      },
      fetchedAt: "2026-08-22T12:10:00.000Z",
      pricing: {
        unit: "cents-per-kwh",
        currency: "EUR",
        vatIncluded: true,
        vatRate: 0.255,
      },
      source: { name: "ENTSO-E" },
    });
    expect(response.intervals.quarterHour).toHaveLength(96);
    expect(response.intervals.hourly).toHaveLength(24);
    expect(response.intervals.quarterHour[0]).toMatchObject({
      id: String(Date.parse("2026-08-21T21:00:00.000Z")),
      startAt: "2026-08-21T21:00:00.000Z",
      endAt: "2026-08-21T21:15:00.000Z",
      priceCentsPerKwh: 5,
      level: "cheap",
    });
    expect(response.current.quarterHour?.startAt).toBe(
      "2026-08-22T12:00:00.000Z",
    );
    expect(response.current.hour?.startAt).toBe("2026-08-22T12:00:00.000Z");
    expect(response.missing).toEqual([]);
  });

  it("omits unavailable intervals and reports source gaps and incomplete hours", () => {
    const missingStart = "2026-08-22T13:15:00.000Z";
    const response = buildPriceApiResponse({
      quarterPrices: sourceFrom("2026-08-21T21:00:00.000Z", 192).filter(
        (price) => price.startAt !== missingStart,
      ),
      now: new Date("2026-08-22T12:07:00.000Z"),
      fetchedAt: "2026-08-22T12:10:00.000Z",
      horizon: "today",
    });

    expect(response.status).toBe("partial");
    expect(response.intervals.quarterHour).toHaveLength(95);
    expect(response.intervals.hourly).toHaveLength(23);
    expect(response.intervals.quarterHour).not.toContainEqual(
      expect.objectContaining({ startAt: missingStart }),
    );
    expect(response.missing).toEqual(
      expect.arrayContaining([
        {
          granularity: "quarter-hour",
          startAt: missingStart,
          endAt: "2026-08-22T13:30:00.000Z",
          reason: "source-gap",
        },
        {
          granularity: "hour",
          startAt: "2026-08-22T13:00:00.000Z",
          endAt: "2026-08-22T14:00:00.000Z",
          reason: "incomplete-hour",
        },
      ]),
    );
  });

  it("marks a fully missing internal hour as an incomplete hour", () => {
    const missingHourStarts = new Set([
      "2026-08-22T13:00:00.000Z",
      "2026-08-22T13:15:00.000Z",
      "2026-08-22T13:30:00.000Z",
      "2026-08-22T13:45:00.000Z",
    ]);
    const response = buildPriceApiResponse({
      quarterPrices: sourceFrom("2026-08-21T21:00:00.000Z", 192).filter(
        (price) => !missingHourStarts.has(price.startAt),
      ),
      now: new Date("2026-08-22T12:07:00.000Z"),
      fetchedAt: "2026-08-22T12:10:00.000Z",
      horizon: "today",
    });

    expect(response.missing).toContainEqual({
      granularity: "hour",
      startAt: "2026-08-22T13:00:00.000Z",
      endAt: "2026-08-22T14:00:00.000Z",
      reason: "incomplete-hour",
    });
  });

  it("returns an explicit partial response when tomorrow has not been published", () => {
    const response = buildPriceApiResponse({
      quarterPrices: sourceFrom("2026-08-21T21:00:00.000Z", 96),
      now: new Date("2026-08-22T12:07:00.000Z"),
      fetchedAt: "2026-08-22T12:10:00.000Z",
      horizon: "tomorrow",
    });

    expect(response.status).toBe("partial");
    expect(response.intervals.quarterHour).toEqual([]);
    expect(response.intervals.hourly).toEqual([]);
    expect(response.missing).toHaveLength(120);
    expect(response.missing[0]).toMatchObject({
      granularity: "quarter-hour",
      reason: "not-published",
    });
    expect(response.missing.at(-1)).toMatchObject({
      granularity: "hour",
      reason: "not-published",
    });
    expect(response.current.quarterHour).not.toBeNull();
  });

  it("preserves Finnish calendar-day lengths around daylight-saving transitions", () => {
    const spring = buildPriceApiResponse({
      quarterPrices: sourceFrom("2026-03-28T22:00:00.000Z", 92),
      now: new Date("2026-03-28T12:00:00.000Z"),
      fetchedAt: "2026-03-28T12:00:00.000Z",
      horizon: "tomorrow",
    });
    const autumn = buildPriceApiResponse({
      quarterPrices: sourceFrom("2026-10-24T21:00:00.000Z", 100),
      now: new Date("2026-10-24T12:00:00.000Z"),
      fetchedAt: "2026-10-24T12:00:00.000Z",
      horizon: "tomorrow",
    });

    expect(spring.horizon.date).toBe("2026-03-29");
    expect(spring.intervals.quarterHour).toHaveLength(92);
    expect(spring.intervals.hourly).toHaveLength(23);
    expect(autumn.horizon.date).toBe("2026-10-25");
    expect(autumn.intervals.quarterHour).toHaveLength(100);
    expect(autumn.intervals.hourly).toHaveLength(25);
  });
});
