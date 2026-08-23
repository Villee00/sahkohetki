import { describe, expect, it } from "vitest";
import { buildExplorerData } from "./price-domain";
import type { QuarterPrice } from "./price-types";

const sourceFixture: QuarterPrice[] = Array.from({ length: 240 }, (_, index) => {
  const startMs = Date.parse("2026-08-21T21:00:00.000Z") + index * 15 * 60 * 1000;
  return {
    id: String(startMs),
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(startMs + 15 * 60 * 1000).toISOString(),
    priceCentsPerKwh: 4 + (index % 8),
  };
});

function sourceFrom(startAt: string, count: number): QuarterPrice[] {
  const startMs = Date.parse(startAt);
  return Array.from({ length: count }, (_, index) => {
    const slotStart = startMs + index * 15 * 60 * 1000;
    return {
      id: String(slotStart),
      startAt: new Date(slotStart).toISOString(),
      endAt: new Date(slotStart + 15 * 60 * 1000).toISOString(),
      priceCentsPerKwh: 5 + (index % 5),
    };
  });
}

function sourceFromPrices(startAt: string, prices: number[]): QuarterPrice[] {
  const startMs = Date.parse(startAt);
  return prices.map((price, index) => {
    const slotStart = startMs + index * 15 * 60 * 1000;
    return {
      id: String(slotStart),
      startAt: new Date(slotStart).toISOString(),
      endAt: new Date(slotStart + 15 * 60 * 1000).toISOString(),
      priceCentsPerKwh: price,
    };
  });
}

describe("ExplorerData horizons", () => {
  it("builds today and the following Finnish calendar-day views", () => {
    const data = buildExplorerData({
      quarterPrices: sourceFixture,
      now: new Date("2026-08-22T12:07:00.000Z"),
      fetchedAt: "2026-08-22T12:10:00.000Z",
    });
    expect(data.today.quarterHour).toHaveLength(96);
    expect(data.tomorrow.quarterHour.length).toBeGreaterThanOrEqual(92);
    expect(data.today.hourly.every((point) => point.estimates)).toBe(true);
  });

  it("exposes a source gap and makes its containing hour unavailable", () => {
    const missingStart = "2026-08-22T13:15:00.000Z";
    const data = buildExplorerData({
      quarterPrices: sourceFixture.filter((point) => point.startAt !== missingStart),
      now: new Date("2026-08-22T12:07:00.000Z"),
      fetchedAt: "2026-08-22T12:10:00.000Z",
    });
    expect(
      data.today.quarterHour.find((point) => point.startAt === missingStart),
    ).toMatchObject({ available: false, unavailableReason: "source-gap" });
    expect(
      data.today.hourly.find((point) => point.startAt === "2026-08-22T13:00:00.000Z"),
    ).toMatchObject({ available: false, unavailableReason: "missing-quarter" });
  });

  it("keeps a complete containing hour when now is inside a quarter-hour horizon", () => {
    const data = buildExplorerData({
      quarterPrices: sourceFixture,
      now: new Date("2026-08-22T12:22:00.000Z"),
      fetchedAt: "2026-08-22T12:25:00.000Z",
    });
    expect(data.today.quarterHour[0].startAt).toBe("2026-08-21T21:00:00.000Z");
    expect(data.today.hourly).toHaveLength(24);
    expect(data.currentQuarterId).toBe(String(Date.parse("2026-08-22T12:15:00.000Z")));
    expect(data.currentHourId).toBe(String(Date.parse("2026-08-22T12:00:00.000Z")));
  });

  it("builds 92 and 100 quarter slots for Finnish DST calendar days", () => {
    const spring = buildExplorerData({
      quarterPrices: sourceFrom("2026-03-28T00:00:00.000Z", 200),
      now: new Date("2026-03-28T12:00:00.000Z"),
      fetchedAt: "2026-03-28T12:00:00.000Z",
    });
    const autumn = buildExplorerData({
      quarterPrices: sourceFrom("2026-10-24T00:00:00.000Z", 200),
      now: new Date("2026-10-24T12:00:00.000Z"),
      fetchedAt: "2026-10-24T12:00:00.000Z",
    });
    expect(spring.tomorrow.quarterHour).toHaveLength(92);
    expect(autumn.tomorrow.quarterHour).toHaveLength(100);
  });

  it("serializes the appliance comparison beside each server-owned estimate", () => {
    const data = buildExplorerData({
      quarterPrices: sourceFrom("2026-08-21T21:00:00.000Z", 96),
      now: new Date("2026-08-22T12:00:00.000Z"),
      fetchedAt: "2026-08-22T12:00:00.000Z",
    });
    const cheapestEstimate = data.today.hourly[0].estimates?.coffee;
    const laterEstimate = data.today.hourly[1].estimates?.coffee;

    expect(cheapestEstimate?.comparison).toEqual({
      title: "Paras ajankohta",
      detail: "Tämä on aktiivisen näkymän edullisin saatavilla oleva aikaväli.",
    });
    expect(laterEstimate?.comparison).toEqual({
      title: "Säästät 0,04 senttiä",
      detail: "edullisimpana ajankohtana 00:00–01:00",
    });
  });

  it("describes a positive sub-cent saving instead of calling it the cheapest time", () => {
    const data = buildExplorerData({
      quarterPrices: sourceFromPrices("2026-08-21T21:00:00.000Z", [
        5,
        5,
        5,
        5,
        5.02,
        5.02,
        5.02,
        5.02,
      ]),
      now: new Date("2026-08-22T12:00:00.000Z"),
      fetchedAt: "2026-08-22T12:00:00.000Z",
    });
    const comparison = data.today.hourly[1].estimates?.coffee?.comparison;

    expect(comparison).toEqual({
      title: "Säästät alle 0,01 senttiä",
      detail: "edullisimpana ajankohtana 00:00–01:00",
    });
  });
});
