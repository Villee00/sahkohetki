// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PriceExplorer } from "./price-explorer";
import type { ExplorerData, PricePoint } from "@/lib/price-types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
  today: {
    hourly: [expensivePoint, cheapestPoint],
    quarterHour: [expensivePoint, cheapestPoint],
  },
  tomorrow: { hourly: [], quarterHour: [] },
  uses: [],
  status: "ready",
};

const lowRangePoints: PricePoint[] = [0.2, 0.4, 0.7, 1.1].map((price, index) => ({
  id: `low-range-${index}`,
  startAt: new Date(Date.UTC(2026, 7, 22, index)).toISOString(),
  endAt: new Date(Date.UTC(2026, 7, 22, index + 1)).toISOString(),
  label: `${index + 10}:00–${index + 11}:00`,
  priceCentsPerKwh: price,
  available: true,
  level: "cheap",
}));

const lowRangeData: ExplorerData = {
  ...data,
  currentQuarterId: lowRangePoints[3].id,
  currentHourId: lowRangePoints[3].id,
  today: { hourly: lowRangePoints, quarterHour: lowRangePoints },
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

it("keeps explanation controls explicitly named at every breakpoint", () => {
  render(<PriceExplorer data={data} />);

  const formulaButton = screen.getByRole("button", { name: "Miten laskemme?" });
  const sourceButton = screen.getByRole("button", { name: "Tietolähde" });

  expect(formulaButton.getAttribute("aria-label")).toBe("Miten laskemme?");
  expect(sourceButton.getAttribute("aria-label")).toBe("Tietolähde");
});

it("keeps the current interval and spot value visible in the top header", () => {
  render(<PriceExplorer data={data} />);

  const header = screen.getByRole("banner");
  expect(header.textContent).toContain("Nyt");
  expect(header.textContent).toContain("13:00–14:00");
  expect(header.textContent).toContain("12,00");
  expect(header.textContent).toContain("snt/kWh");
});

it("keeps a just-over-one-cent price in the low part of the price scale", () => {
  render(<PriceExplorer data={lowRangeData} />);

  const marker = document.querySelector<HTMLElement>(".spectrum-marker");
  expect(marker).not.toBeNull();
  expect(Number.parseFloat(marker?.style.left ?? "100")).toBeLessThan(50);
  expect(screen.getByText("Edullinen hinta")).toBeTruthy();
});

it("renders the project logo in the site header", () => {
  render(<PriceExplorer data={data} />);

  const logo = screen.getByRole("banner").querySelector('img[alt=""]');

  expect(logo).not.toBeNull();
  expect(logo?.getAttribute("src")).toBe("/icon.ico");
  expect(logo?.getAttribute("width")).toBe("32");
  expect(logo?.getAttribute("height")).toBe("32");
});

it("does not render a text summary for the chart intervals", () => {
  render(<PriceExplorer data={data} />);

  expect(screen.queryByText("Tekstimuotoinen yhteenveto")).toBeNull();
});

it("keeps the selected interval as compact calculation context", () => {
  render(<PriceExplorer data={data} />);

  expect(screen.queryByText("Valittu spot-hinta")).toBeNull();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
    "13:00–14:00",
  );
});

it("marks the selected interval as current until a future interval is chosen", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={data} />);

  expect(screen.getByLabelText("Nykyinen aika").textContent).toBe("Nyt");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
    "Nykyinen aikaväli",
  );

  await user.click(
    screen.getByRole("button", {
      name: /halvin saatavilla oleva jakso 14:00–15:00/i,
    }),
  );

  expect(screen.queryByLabelText("Nykyinen aika")).toBeNull();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
    "Valittu jakso",
  );
});

it("offers a button that selects the cheapest available interval", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={data} />);

  const cheapestButton = screen.getByRole("button", {
    name: /halvin saatavilla oleva jakso 14:00–15:00/i,
  });
  await user.click(cheapestButton);

  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
    "14:00–15:00",
  );
});

it("defaults to today's calendar-day horizon", () => {
  render(<PriceExplorer data={data} />);

  const todayButton = screen.getByRole("button", { name: "Tänään" });
  expect(todayButton.getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("button", { name: "Seuraavat 24h" })).toBeNull();
  expect(screen.getByRole("button", { name: "Huomenna" })).toBeTruthy();
});

it("shows the current-time line only on today's horizon", async () => {
  vi.spyOn(Date, "now").mockReturnValue(
    Date.parse("2026-08-22T10:30:00.000Z"),
  );
  const user = userEvent.setup();
  const dataWithTomorrowPoints: ExplorerData = {
    ...data,
    tomorrow: {
      hourly: [expensivePoint, cheapestPoint],
      quarterHour: [expensivePoint, cheapestPoint],
    },
  };

  render(<PriceExplorer data={dataWithTomorrowPoints} />);

  expect(screen.getByTestId("price-chart-current-time")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Huomenna" }));

  expect(screen.queryByTestId("price-chart-current-time")).toBeNull();
});

it("shows a friendly update message instead of a lone partial tomorrow bar", async () => {
  const user = userEvent.setup();
  const partialTomorrowData: ExplorerData = {
    ...data,
    tomorrow: {
      hourly: [
        {
          id: "tomorrow-hour-0000",
          startAt: "2026-08-22T21:00:00.000Z",
          endAt: "2026-08-22T22:00:00.000Z",
          label: "00:00–01:00",
          priceCentsPerKwh: 5,
          available: true,
          level: "normal",
        },
        {
          id: "tomorrow-hour-0100",
          startAt: "2026-08-22T22:00:00.000Z",
          endAt: "2026-08-22T23:00:00.000Z",
          label: "01:00–02:00",
          priceCentsPerKwh: null,
          available: false,
          unavailableReason: "missing-quarter",
        },
      ],
      quarterHour: [],
    },
  };

  render(<PriceExplorer data={partialTomorrowData} />);
  await user.click(screen.getByRole("button", { name: "Huomenna" }));

  const chart = screen.getByRole("region", {
    name: "Pörssisähkön Tuntikaavio",
  });
  const unavailableMessage =
    "Huomisen hinnat eivät ole vielä saatavilla, mutta ne päivitetään noin klo 15.00.";

  expect(chart.textContent).toContain(unavailableMessage);
  expect(screen.queryAllByText(unavailableMessage)).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Tänään" })).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Huomenna" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen.queryByRole("button", {
      name: /Valitse aikaväli 00:00–01:00/,
    }),
  ).toBeNull();
});

it("matches the mockup chart header and control order", () => {
  render(<PriceExplorer data={data} />);

  const chart = screen.getByRole("region", {
    name: "Pörssisähkön Tuntikaavio",
  });
  const chartHeader = chart.querySelector(".price-chart__header");
  const horizonControls = screen.getByRole("group", { name: "Aikahorisontti" });
  const precisionControls = screen.getByRole("group", {
    name: "Hintatarkkuus",
  });
  const headerGroups = Array.from(
    chartHeader?.querySelectorAll('[role="group"]') ?? [],
  ).map((group) => group.getAttribute("aria-label"));

  expect(chartHeader).not.toBeNull();
  expect(chartHeader?.contains(horizonControls)).toBe(true);
  expect(chartHeader?.contains(precisionControls)).toBe(true);
  expect(
    chart.querySelector(".price-chart__frame")?.contains(chartHeader),
  ).toBe(true);
  expect(headerGroups).toEqual(["Hintatarkkuus", "Aikahorisontti"]);
  expect(screen.getByRole("button", { name: "Tunnittain (h)" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "15 min tarkkuus" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Tänään" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Huomenna" })).toBeTruthy();
});
