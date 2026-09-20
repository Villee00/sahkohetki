// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import type {
  HistoryPageData,
  HistoryPeriodSummary,
} from "../../lib/history-types";
import { EXPLORER_SOURCE } from "../../lib/price-types";
import { HistoryExplorer } from "./history-explorer";

afterEach(cleanup);

function period(
  id: string,
  granularity: HistoryPeriodSummary["granularity"],
  startDateKey: string,
  endDateKey: string,
  raw: number,
  previousId: string | null,
): HistoryPeriodSummary {
  return {
    id,
    granularity,
    startDateKey,
    endDateKey,
    expectedMinutes: granularity === "day" ? 1440 : 10080,
    average: {
      rawEurPerMwh: raw,
      householdCentsPerKwh: (raw / 10) * 1.255,
    },
    negativePricePercent: raw < 0 ? 25 : 0,
    longestExpensiveStreakHours: raw > 111.55 ? 3 : 0,
    previousId,
    percentileRank: {
      raw: raw === 40 ? 80 : 20,
      household: raw === 40 ? 80 : 20,
    },
    percentileBand: {
      raw: raw === 40 ? "high" : "low",
      household: raw === 40 ? "high" : "low",
    },
  };
}

const firstDay = period(
  "day:2026-01-01",
  "day",
  "2026-01-01",
  "2026-01-01",
  20,
  null,
);
const secondDay = period(
  "day:2026-01-02",
  "day",
  "2026-01-02",
  "2026-01-02",
  40,
  firstDay.id,
);
const firstWeek = period(
  "week:2025-12-22",
  "week",
  "2025-12-22",
  "2025-12-28",
  15,
  null,
);
const secondWeek = period(
  "week:2025-12-29",
  "week",
  "2025-12-29",
  "2026-01-04",
  35,
  firstWeek.id,
);
const january = period(
  "month:2026-01",
  "month",
  "2026-01-01",
  "2026-01-31",
  30,
  null,
);

const distribution = { p10: 10, p25: 20, p50: 30, p75: 40, p90: 50 };
const data: HistoryPageData = {
  status: "ready",
  fetchedAt: "2026-01-03T08:00:00.000Z",
  requestedRange: { startDateKey: "2025-01-01", endDateKey: "2026-01-02" },
  availableRange: { startDateKey: "2026-01-01", endDateKey: "2026-01-02" },
  missingRanges: [],
  source: EXPLORER_SOURCE,
  days: [
    {
      dateKey: "2026-01-01",
      complete: true,
      expectedMinutes: 1440,
      average: firstDay.average,
    },
    {
      dateKey: "2026-01-02",
      complete: true,
      expectedMinutes: 1440,
      average: secondDay.average,
    },
    {
      dateKey: "2026-01-03",
      complete: false,
      expectedMinutes: 1440,
      average: null,
    },
  ],
  periods: {
    day: [firstDay, secondDay],
    week: [firstWeek, secondWeek],
    month: [january],
  },
  distributions: {
    day: { rawEurPerMwh: distribution, householdCentsPerKwh: distribution },
    week: { rawEurPerMwh: distribution, householdCentsPerKwh: distribution },
    month: { rawEurPerMwh: distribution, householdCentsPerKwh: distribution },
  },
};

it("defaults to the latest complete day and household-facing prices", () => {
  render(<HistoryExplorer data={data} />);

  expect(screen.getByRole("heading", { name: "Hintahistoria" })).toBeTruthy();
  expect(screen.getByText("2.1.2026")).toBeTruthy();
  expect(screen.getByText("5,02", { exact: true })).toBeTruthy();
  expect(screen.getByText("snt/kWh (sis. alv.)")).toBeTruthy();
  expect(screen.getByText("Täydellinen")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Tänään" }).getAttribute("href"),
  ).toBe("/");
});

it("switches price basis and period granularity without requesting more data", async () => {
  const user = userEvent.setup();
  render(<HistoryExplorer data={data} />);

  await user.click(
    screen.getByRole("button", { name: "ENTSO-E-markkinahinta" }),
  );
  expect(screen.getByText("40,00", { exact: true })).toBeTruthy();
  expect(screen.getAllByText("€/MWh").length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "Viikko" }));
  expect(screen.getByText("29.12.2025–4.1.2026")).toBeTruthy();
  expect(screen.getByText("35,00", { exact: true })).toBeTruthy();
});

it("navigates to the previous period and lets a heatmap cell select a date", async () => {
  const user = userEvent.setup();
  render(<HistoryExplorer data={data} />);

  await user.click(screen.getByRole("button", { name: "Edellinen jakso" }));
  expect(screen.getByText("1.1.2026")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /2\.1\.2026.*5,02 snt\/kWh/i }),
  ).toBeTruthy();

  await user.click(
    screen.getByRole("button", { name: /2\.1\.2026.*5,02 snt\/kWh/i }),
  );
  expect(screen.getByText("2.1.2026")).toBeTruthy();
});

it("keeps missing dates visible, named, and non-selectable", () => {
  render(<HistoryExplorer data={data} />);

  const missing = screen.getByRole("button", {
    name: "3.1.2026, hintatieto puuttuu",
  });
  expect((missing as HTMLButtonElement).disabled).toBe(true);
  expect(missing.getAttribute("data-band")).toBe("missing");
});

it("explains partial and unavailable source states in Finnish", () => {
  const { rerender } = render(
    <HistoryExplorer
      data={{
        ...data,
        status: "partial",
        message: "Osa historiatiedoista puuttuu.",
      }}
    />,
  );
  expect(screen.getByRole("status").textContent).toContain(
    "Osa historiatiedoista puuttuu.",
  );

  rerender(
    <HistoryExplorer
      data={{
        ...data,
        status: "unavailable",
        message:
          "Historiatietoja ei voitu hakea, koska lähteen käyttöoikeus puuttuu.",
        days: [],
        periods: { day: [], week: [], month: [] },
      }}
    />,
  );
  expect(screen.getByRole("alert").textContent).toContain(
    "käyttöoikeus puuttuu",
  );
});
