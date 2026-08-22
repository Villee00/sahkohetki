// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { PriceExplorer } from "./price-explorer";
import type { ExplorerData, PricePoint } from "@/lib/price-types";

afterEach(() => cleanup());

const expensivePoint: PricePoint = {
  id: "hour-1000",
  startAt: "2026-08-22T10:00:00.000Z",
  endAt: "2026-08-22T11:00:00.000Z",
  label: "13:00–14:00",
  priceCentsPerKwh: 12,
  available: true,
  level: "high",
};

const cheapestPoint: PricePoint = {
  id: "hour-1100",
  startAt: "2026-08-22T11:00:00.000Z",
  endAt: "2026-08-22T12:00:00.000Z",
  label: "14:00–15:00",
  priceCentsPerKwh: 2,
  available: true,
  level: "cheap",
};

const data: ExplorerData = {
  fetchedAt: "2026-08-22T10:00:00.000Z",
  source: {
    name: "Pörssisähkö.net",
    pricesUrl: "https://porssisahko.net/",
    apiUrl: "https://api.porssisahko.net/v2/latest-prices.json",
    documentationUrl: "https://porssisahko.net/api",
  },
  currentQuarterId: expensivePoint.id,
  currentHourId: expensivePoint.id,
  next24Hours: {
    hourly: [expensivePoint, cheapestPoint],
    quarterHour: [expensivePoint, cheapestPoint],
  },
  tomorrow: { hourly: [], quarterHour: [] },
  uses: [],
  status: "ready",
};

it("moves focus into the dialog, traps Tab, and restores the opener", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={data} />);

  const opener = screen.getByRole("button", { name: /Miten laskemme?/i });
  await user.click(opener);

  const dialog = screen.getByRole("dialog");
  const closeButton = screen.getByRole("button", { name: "Sulje selite" });
  expect(dialog).toBeTruthy();
  expect(document.activeElement).toBe(closeButton);

  await user.tab();
  expect(document.activeElement).toBe(closeButton);
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(closeButton);

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it("offers a button that selects the cheapest available interval", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={data} />);

  const cheapestButton = screen.getByRole("button", {
    name: /halvin saatavilla oleva jakso 14:00–15:00/i,
  });
  await user.click(cheapestButton);

  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("14:00–15:00");
});
