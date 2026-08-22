import { describe, expect, it } from "vitest";
import {
  buildExplorerData,
  calculateUseCost,
  classifyPriceLevels,
  deriveHourlyPoint,
  findCheapestPoint,
  parsePricePayload,
} from "./price-domain";

const completeHour = [
  { price: 10, startDate: "2026-08-22T10:00:00.000Z", endDate: "2026-08-22T10:15:00.000Z" },
  { price: 12, startDate: "2026-08-22T10:15:00.000Z", endDate: "2026-08-22T10:30:00.000Z" },
  { price: 14, startDate: "2026-08-22T10:30:00.000Z", endDate: "2026-08-22T10:45:00.000Z" },
  { price: 16, startDate: "2026-08-22T10:45:00.000Z", endDate: "2026-08-22T11:00:00.000Z" },
];

describe("price domain", () => {
  it("accepts a valid API payload and preserves quarter-hour precision", () => {
    const result = parsePricePayload({ prices: completeHour });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.prices).toHaveLength(4);
    expect(result.prices[0]).toMatchObject({
      priceCentsPerKwh: 10,
      startAt: "2026-08-22T10:00:00.000Z",
      endAt: "2026-08-22T10:15:00.000Z",
    });
    expect(result.prices[3]).toMatchObject({ priceCentsPerKwh: 16 });
  });

  it("accepts the source's 899999ms quarter and normalizes its endAt", () => {
    const result = parsePricePayload({
      prices: [
        {
          ...completeHour[0],
          endDate: "2026-08-22T10:14:59.999Z",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.prices[0]).toMatchObject({
      startAt: "2026-08-22T10:00:00.000Z",
      endAt: "2026-08-22T10:15:00.000Z",
      priceCentsPerKwh: 10,
    });
  });

  it("rejects malformed or non-finite source data", () => {
    expect(parsePricePayload({ prices: [{ price: "10" }] }).ok).toBe(false);
    expect(parsePricePayload({ prices: [{ ...completeHour[0], price: Number.NaN }] }).ok).toBe(false);
    expect(parsePricePayload({ prices: [] }).ok).toBe(false);
  });

  it("rejects other durations and malformed timestamps", () => {
    expect(
      parsePricePayload({
        prices: [{ ...completeHour[0], endDate: "2026-08-22T10:14:59.998Z" }],
      }).ok,
    ).toBe(false);
    expect(
      parsePricePayload({
        prices: [{ ...completeHour[0], endDate: "2026-08-22T10:15:00.001Z" }],
      }).ok,
    ).toBe(false);
    expect(
      parsePricePayload({
        prices: [{ ...completeHour[0], endDate: "not-an-iso-timestamp" }],
      }).ok,
    ).toBe(false);
  });

  it("averages all four quarters and marks a missing quarter unavailable", () => {
    const parsed = parsePricePayload({ prices: completeHour });
    if (!parsed.ok) throw new Error(parsed.message);
    expect(deriveHourlyPoint(parsed.prices, "2026-08-22T10:00:00.000Z")).toMatchObject({
      available: true,
      priceCentsPerKwh: 13,
    });
    expect(
      deriveHourlyPoint(parsed.prices.slice(0, 3), "2026-08-22T10:00:00.000Z"),
    ).toMatchObject({ available: false, unavailableReason: "missing-quarter" });
  });

  it("labels hourly points with the Europe/Helsinki interval", () => {
    const parsed = parsePricePayload({ prices: completeHour });
    if (!parsed.ok) throw new Error(parsed.message);
    expect(deriveHourlyPoint(parsed.prices, "2026-08-22T10:00:00.000Z").label).toBe(
      "13:00–14:00",
    );
    expect(
      deriveHourlyPoint(parsed.prices.slice(0, 3), "2026-08-22T10:00:00.000Z").label,
    ).toBe("13:00–14:00");
  });

  it("marks an hourly point unavailable when a matched quarter has a non-finite price", () => {
    const parsed = parsePricePayload({ prices: completeHour });
    if (!parsed.ok) throw new Error(parsed.message);
    const malformed = parsed.prices.map((quarter, index) =>
      index === 1 ? { ...quarter, priceCentsPerKwh: Number.NaN } : quarter,
    );
    expect(deriveHourlyPoint(malformed, "2026-08-22T10:00:00.000Z")).toMatchObject({
      available: false,
      priceCentsPerKwh: null,
      unavailableReason: "missing-quarter",
    });
    const unparsable = parsed.prices.map((quarter, index) =>
      index === 2 ? { ...quarter, endAt: "not-an-iso-timestamp" } : quarter,
    );
    expect(deriveHourlyPoint(unparsable, "2026-08-22T10:00:00.000Z")).toMatchObject({
      available: false,
      priceCentsPerKwh: null,
      unavailableReason: "missing-quarter",
    });
  });

  it("marks an hourly point unavailable when a matched quarter has an invalid interval", () => {
    const parsed = parsePricePayload({ prices: completeHour });
    if (!parsed.ok) throw new Error(parsed.message);
    const malformed = parsed.prices.map((quarter, index) =>
      index === 2
        ? { ...quarter, endAt: "2026-08-22T10:50:00.000Z" }
        : quarter,
    );
    expect(deriveHourlyPoint(malformed, "2026-08-22T10:00:00.000Z")).toMatchObject({
      available: false,
      priceCentsPerKwh: null,
      unavailableReason: "missing-quarter",
    });
  });

  it("keeps negative prices and rounds only the displayed values", () => {
    expect(calculateUseCost(0.12, -1.5)).toEqual({
      cents: -0.18,
      euros: -0.0018,
      centsLabel: "-0.18",
      eurosLabel: "-0.00",
    });
    expect(calculateUseCost(0.12, 10)).toMatchObject({
      cents: 1.2,
      euros: 0.012,
      centsLabel: "1.20",
      eurosLabel: "0.01",
    });
  });

  it("classifies values by their active-horizon rank and finds the first minimum", () => {
    const points = [2, 4, 6, 8, 10, 12].map((price, index) => ({
      id: String(index),
      startAt: new Date(Date.UTC(2026, 7, 22, index)).toISOString(),
      endAt: new Date(Date.UTC(2026, 7, 22, index + 1)).toISOString(),
      label: String(index) + ":00",
      priceCentsPerKwh: price,
      available: true,
    }));
    const classified = classifyPriceLevels(points);
    expect(classified.map((point) => point.level)).toEqual([
      "cheap",
      "cheap",
      "normal",
      "normal",
      "high",
      "high",
    ]);
    expect(findCheapestPoint(classified)?.id).toBe("0");
  });

  it("builds today and tomorrow as Helsinki calendar-day horizons", () => {
    const data = buildExplorerData({
      quarterPrices: [],
      now: new Date("2026-08-22T10:30:00.000Z"),
      fetchedAt: null,
    });

    expect(data).not.toHaveProperty("next24Hours");
    expect(data.today.hourly).toHaveLength(24);
    expect(data.today.hourly[0]).toMatchObject({
      startAt: "2026-08-21T21:00:00.000Z",
      endAt: "2026-08-21T22:00:00.000Z",
    });
    expect(data.today.hourly[23]).toMatchObject({
      startAt: "2026-08-22T20:00:00.000Z",
      endAt: "2026-08-22T21:00:00.000Z",
    });
    expect(data.tomorrow.hourly[0].startAt).toBe("2026-08-22T21:00:00.000Z");
  });
});
