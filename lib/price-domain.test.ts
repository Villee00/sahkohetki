import { describe, expect, it } from "vitest";
import {
  buildExplorerData,
  applyPriceMargin,
  calculateUseCost,
  calculateUseCostWithTransfer,
  classifyPriceLevels,
  deriveHourlyPoint,
  findCheapestPoint,
} from "./price-domain";
import type { QuarterPrice } from "./price-types";

const completeHour: QuarterPrice[] = [
  {
    id: "q1",
    priceCentsPerKwh: 10,
    startAt: "2026-08-22T10:00:00.000Z",
    endAt: "2026-08-22T10:15:00.000Z",
  },
  {
    id: "q2",
    priceCentsPerKwh: 12,
    startAt: "2026-08-22T10:15:00.000Z",
    endAt: "2026-08-22T10:30:00.000Z",
  },
  {
    id: "q3",
    priceCentsPerKwh: 14,
    startAt: "2026-08-22T10:30:00.000Z",
    endAt: "2026-08-22T10:45:00.000Z",
  },
  {
    id: "q4",
    priceCentsPerKwh: 16,
    startAt: "2026-08-22T10:45:00.000Z",
    endAt: "2026-08-22T11:00:00.000Z",
  },
];

describe("price domain", () => {
  it("averages all four quarters and marks a missing quarter unavailable", () => {
    expect(deriveHourlyPoint(completeHour, "2026-08-22T10:00:00.000Z")).toMatchObject({
      available: true,
      priceCentsPerKwh: 13,
    });
    expect(
      deriveHourlyPoint(completeHour.slice(0, 3), "2026-08-22T10:00:00.000Z"),
    ).toMatchObject({ available: false, unavailableReason: "missing-quarter" });
  });

  it("labels hourly points with the Europe/Helsinki interval", () => {
    expect(deriveHourlyPoint(completeHour, "2026-08-22T10:00:00.000Z").label).toBe(
      "13:00–14:00",
    );
    expect(
      deriveHourlyPoint(completeHour.slice(0, 3), "2026-08-22T10:00:00.000Z").label,
    ).toBe("13:00–14:00");
  });

  it("marks an hourly point unavailable when a matched quarter has a non-finite price", () => {
    const malformed = completeHour.map((quarter, index) =>
      index === 1 ? { ...quarter, priceCentsPerKwh: Number.NaN } : quarter,
    );
    expect(deriveHourlyPoint(malformed, "2026-08-22T10:00:00.000Z")).toMatchObject({
      available: false,
      priceCentsPerKwh: null,
      unavailableReason: "missing-quarter",
    });
    const unparsable = completeHour.map((quarter, index) =>
      index === 2 ? { ...quarter, endAt: "not-an-iso-timestamp" } : quarter,
    );
    expect(deriveHourlyPoint(unparsable, "2026-08-22T10:00:00.000Z")).toMatchObject({
      available: false,
      priceCentsPerKwh: null,
      unavailableReason: "missing-quarter",
    });
  });

  it("marks an hourly point unavailable when a matched quarter has an invalid interval", () => {
    const malformed = completeHour.map((quarter, index) =>
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

  it("adds the selected transfer charge and household electricity tax to one use", () => {
    expect(calculateUseCostWithTransfer(0.15, 12, 3.73, 2.917875)).toMatchObject({
      cents: 2.79718125,
      euros: 0.0279718125,
      centsLabel: "2.80",
      eurosLabel: "0.03",
    });
  });

  it("classifies values by stable price bands and finds the first minimum", () => {
    const points = [2, 4, 6, 8, 15, 20].map((price, index) => ({
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

  it("applies the cheap and high cutoffs at five and fourteen cents", () => {
    const points = [5, 5.01, 14, 14.01].map((price, index) => ({
      id: String(index),
      startAt: new Date(Date.UTC(2026, 7, 22, index)).toISOString(),
      endAt: new Date(Date.UTC(2026, 7, 22, index + 1)).toISOString(),
      label: String(index) + ":00",
      priceCentsPerKwh: price,
      available: true,
    }));

    expect(classifyPriceLevels(points).map((point) => point.level)).toEqual([
      "cheap",
      "normal",
      "normal",
      "high",
    ]);
  });

  it("adds a fixed margin and recalculates levels, estimates, and comparisons", () => {
    const points = [
      {
        id: "cheap",
        startAt: "2026-08-22T10:00:00.000Z",
        endAt: "2026-08-22T11:00:00.000Z",
        label: "13:00–14:00",
        priceCentsPerKwh: 4,
        available: true,
        level: "cheap" as const,
      },
      {
        id: "expensive",
        startAt: "2026-08-22T11:00:00.000Z",
        endAt: "2026-08-22T12:00:00.000Z",
        label: "14:00–15:00",
        priceCentsPerKwh: 12,
        available: true,
        level: "normal" as const,
      },
    ];

    const adjusted = applyPriceMargin(points, 2);

    expect(adjusted.map((point) => point.priceCentsPerKwh)).toEqual([6, 14]);
    expect(adjusted.map((point) => point.level)).toEqual(["normal", "normal"]);
    expect(adjusted[0].estimates?.coffee).toMatchObject({
      centsLabel: "0.90",
      eurosLabel: "0.01",
    });
    expect(adjusted[1].estimates?.coffee?.comparison?.title).toBe(
      "Säästät 1,20 senttiä",
    );
    expect(adjusted[1].estimates?.coffee?.comparison?.detail).toContain(
      "13:00–14:00",
    );
    expect(points[0].priceCentsPerKwh).toBe(4);
    expect(points[0].level).toBe("cheap");
  });

  it("keeps a barely-over-one-cent price in the cheap level when the horizon is otherwise below one cent", () => {
    const points = [0.2, 0.4, 0.7, 1.1].map((price, index) => ({
      id: String(index),
      startAt: new Date(Date.UTC(2026, 7, 22, index)).toISOString(),
      endAt: new Date(Date.UTC(2026, 7, 22, index + 1)).toISOString(),
      label: String(index) + ":00",
      priceCentsPerKwh: price,
      available: true,
    }));

    expect(classifyPriceLevels(points).map((point) => point.level)).toEqual([
      "cheap",
      "cheap",
      "cheap",
      "cheap",
    ]);
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
