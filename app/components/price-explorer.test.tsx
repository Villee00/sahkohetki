// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EVERYDAY_USES } from "../../lib/appliances";
import { PriceExplorer } from "./price-explorer";
import {
  EXPLORER_SOURCE,
  type ExplorerData,
  type PricePoint,
} from "../../lib/price-types";

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
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
  source: EXPLORER_SOURCE,
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

const dataWithUses: ExplorerData = {
  ...data,
  uses: EVERYDAY_USES,
};

function createCompleteTomorrowPoints(
  intervalMilliseconds: number,
  count: number,
  prefix: string,
): PricePoint[] {
  const horizonStartMilliseconds = Date.parse("2026-08-22T21:00:00.000Z");
  return Array.from({ length: count }, (_, index) => {
    const startAt = new Date(
      horizonStartMilliseconds + index * intervalMilliseconds,
    ).toISOString();
    const endAt = new Date(
      horizonStartMilliseconds + (index + 1) * intervalMilliseconds,
    ).toISOString();
    return {
      id: `${prefix}-${index}`,
      startAt,
      endAt,
      label: `${index}`,
      priceCentsPerKwh: index === 0 ? 20 : index === 1 ? 30 : 25,
      available: true,
      level: "normal",
    };
  });
}

const lowRangePoints: PricePoint[] = [0.2, 0.4, 0.7, 1.1].map(
  (price, index) => ({
    id: `low-range-${index}`,
    startAt: new Date(Date.UTC(2026, 7, 22, index)).toISOString(),
    endAt: new Date(Date.UTC(2026, 7, 22, index + 1)).toISOString(),
    label: `${index + 10}:00–${index + 11}:00`,
    priceCentsPerKwh: price,
    available: true,
    level: "cheap",
  }),
);

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

it("applies the supplier margin to displayed prices and appliance estimates", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={dataWithUses} />);

  await user.click(screen.getByRole("button", { name: "Lisää marginaali" }));

  const dialog = screen.getByRole("dialog", { name: "Lisää marginaali" });
  const marginInput = within(dialog).getByLabelText("Sähköyhtiön marginaali");
  await user.clear(marginInput);
  await user.type(marginInput, "3");
  await user.click(
    within(dialog).getByRole("button", { name: "Käytä marginaalia" }),
  );

  expect(screen.queryByRole("dialog", { name: "Lisää marginaali" })).toBeNull();
  expect(screen.getByRole("banner").textContent).toContain("15,00");
  expect(document.querySelector(".hero-price")?.textContent).toBe("15,00");
  expect(
    screen.getByRole("heading", { name: "Kahvinkeitin" }).closest("article")
      ?.textContent,
  ).toContain("2.25");
  expect(
    screen.getAllByText("ARVIOITU KUSTANNUS SPOT + MARGINAALI").length,
  ).toBe(10);
  expect(
    screen.getByRole("button", {
      name: /Valitse aikaväli 13:00–14:00, hinta 15,00 senttiä kilowattitunnilta/,
    }),
  ).toBeTruthy();
});

it("restores a saved margin and clears it when returning to market price", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem("sahkohetki.price-margin", "3.5");

  render(<PriceExplorer data={dataWithUses} />);

  await waitFor(() => {
    expect(document.querySelector(".hero-price")?.textContent).toBe("15,50");
  });

  await user.click(screen.getByRole("button", { name: "Lisää marginaali" }));
  const dialog = screen.getByRole("dialog", { name: "Lisää marginaali" });
  const marginInput = within(dialog).getByLabelText(
    "Sähköyhtiön marginaali",
  ) as HTMLInputElement;
  expect(marginInput.value).toBe("3.5");

  await user.click(
    within(dialog).getByRole("button", { name: "Palauta spot-hintaan" }),
  );

  expect(document.querySelector(".hero-price")?.textContent).toBe("12,00");
  expect(window.localStorage.getItem("sahkohetki.price-margin")).toBeNull();
});

it("keeps the settings form controls inside the keyboard focus trap", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={dataWithUses} />);

  await user.click(screen.getByRole("button", { name: "Lisää marginaali" }));

  const dialog = screen.getByRole("dialog", { name: "Lisää marginaali" });
  const closeButton = within(dialog).getByRole("button", {
    name: "Sulje lisää marginaali",
  });
  const marginInput = within(dialog).getByLabelText("Sähköyhtiön marginaali");
  const applyButton = within(dialog).getByRole("button", {
    name: "Käytä marginaalia",
  });
  const resetButton = within(dialog).getByRole("button", {
    name: "Palauta spot-hintaan",
  });

  expect(document.activeElement).toBe(closeButton);
  await user.tab();
  expect(document.activeElement).toBe(marginInput);
  await user.tab();
  expect(document.activeElement).toBe(applyButton);
  await user.tab();
  expect(document.activeElement).toBe(resetButton);
  await user.tab();
  expect(document.activeElement).toBe(closeButton);
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(resetButton);
});

it("associates an invalid margin with its validation message", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={dataWithUses} />);

  await user.click(screen.getByRole("button", { name: "Lisää marginaali" }));
  const dialog = screen.getByRole("dialog", { name: "Lisää marginaali" });
  const marginInput = within(dialog).getByLabelText("Sähköyhtiön marginaali");

  await user.clear(marginInput);
  await user.type(marginInput, "-1");
  await user.click(
    within(dialog).getByRole("button", { name: "Käytä marginaalia" }),
  );

  expect(marginInput.getAttribute("aria-invalid")).toBe("true");
  expect(marginInput.getAttribute("aria-describedby")).toContain(
    "price-margin-error",
  );
  expect(within(dialog).getByRole("alert").id).toBe("price-margin-error");
});

it("keeps the current interval and spot value visible in the top header", () => {
  render(<PriceExplorer data={data} />);

  const header = screen.getByRole("banner");
  expect(header.textContent).toContain("Nyt");
  expect(header.textContent).toContain("13:00–14:00");
  expect(header.textContent).toContain("12,00");
  expect(header.textContent).toContain("snt/kWh");
});

it("updates the top header when a different interval is selected", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={data} />);

  const headerValue = within(screen.getByRole("banner")).getByLabelText(
    /spot-hinta/i,
  );

  await user.click(
    screen.getByRole("button", {
      name: /Valitse aikaväli 14:00–15:00/i,
    }),
  );

  expect(headerValue.textContent).toContain("Valittu");
  expect(headerValue.textContent).toContain("14:00–15:00");
  expect(headerValue.textContent).toContain("2,00");
  expect(headerValue.textContent).not.toContain("12,00");
});

it("shows active-view minimum, average, and maximum prices in the header", async () => {
  const user = userEvent.setup();
  const dataWithTomorrow: ExplorerData = {
    ...data,
    tomorrow: {
      hourly: createCompleteTomorrowPoints(60 * 60 * 1000, 24, "tomorrow-hour"),
      quarterHour: createCompleteTomorrowPoints(
        15 * 60 * 1000,
        96,
        "tomorrow-quarter",
      ),
    },
  };

  render(<PriceExplorer data={dataWithTomorrow} />);

  const summary = screen.getByRole("group", { name: "Hintayhteenveto" });
  expect(within(summary).getByText("Halvin")).toBeTruthy();
  expect(within(summary).getByText("Keskihinta")).toBeTruthy();
  expect(within(summary).getByText("Kallein")).toBeTruthy();
  expect(within(summary).getByText("2,00")).toBeTruthy();
  expect(within(summary).getByText("7,00")).toBeTruthy();
  expect(within(summary).getByText("12,00")).toBeTruthy();
  expect(screen.queryByText("Halvin hetki:")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Huomenna" }));

  expect(within(summary).getByText("20,00")).toBeTruthy();
  expect(within(summary).getByText("25,00")).toBeTruthy();
  expect(within(summary).getByText("30,00")).toBeTruthy();
});

it("does not repeat the summary prices in the spectrum labels", () => {
  render(<PriceExplorer data={data} />);

  expect(screen.queryByText(/^Pienin:/)).toBeNull();
  expect(
    screen.queryByText("Sähkön hintahaarukka tarkastelujaksolla"),
  ).toBeNull();
  expect(screen.queryByText(/^Suurin:/)).toBeNull();
});

it("keeps a just-over-one-cent price in the low part of the price scale", () => {
  render(<PriceExplorer data={lowRangeData} />);

  const marker = document.querySelector<HTMLElement>(".spectrum-marker");
  expect(marker).not.toBeNull();
  expect(Number.parseFloat(marker?.style.left ?? "100")).toBeLessThan(50);
  expect(screen.getByText("Edullinen hinta")).toBeTruthy();
});

it("places a sub-cent price near the start of the price scale", () => {
  const nearZeroPoint: PricePoint = {
    ...cheapestPoint,
    id: "hour-near-zero",
    label: "13:00–14:00",
    priceCentsPerKwh: 0.59,
  };
  const nearZeroData: ExplorerData = {
    ...data,
    currentQuarterId: nearZeroPoint.id,
    currentHourId: nearZeroPoint.id,
    today: { hourly: [nearZeroPoint], quarterHour: [nearZeroPoint] },
  };

  render(<PriceExplorer data={nearZeroData} />);

  const marker = document.querySelector<HTMLElement>(".spectrum-marker");
  expect(marker).not.toBeNull();
  expect(Number.parseFloat(marker?.style.left ?? "100")).toBeCloseTo(2.95, 4);
});

it("aligns spectrum colors with the absolute price cutoffs", () => {
  const styles = readFileSync(`${process.cwd()}/app/globals.css`, "utf8");
  const spectrumRule =
    styles.match(/\.spectrum-track\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(spectrumRule).toMatch(/var\(--cheap\)\s+25%/);
  expect(spectrumRule).toMatch(/var\(--normal\)\s+25%/);
  expect(spectrumRule).toMatch(/var\(--normal\)\s+70%/);
  expect(spectrumRule).toMatch(/var\(--high\)\s+70%/);
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

it("shows the selected date above the selected interval", async () => {
  const user = userEvent.setup();
  const tomorrowPoint: PricePoint = {
    ...cheapestPoint,
    id: "tomorrow-midnight",
    startAt: "2026-08-22T21:00:00.000Z",
    endAt: "2026-08-22T22:00:00.000Z",
    label: "00:00–01:00",
  };
  const dataWithTomorrow: ExplorerData = {
    ...data,
    tomorrow: {
      hourly: [tomorrowPoint],
      quarterHour: [tomorrowPoint],
    },
  };

  render(<PriceExplorer data={dataWithTomorrow} />);

  const selectedDate = screen.getByText("22.8.2026");
  const selectedInterval = screen.getByText("Valittu aikaväli:");
  expect(
    selectedDate.compareDocumentPosition(selectedInterval) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Huomenna" }));

  expect(screen.getByText("23.8.2026")).toBeTruthy();
});

it("marks the selected interval as current until a future interval is chosen", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={data} />);

  expect(screen.getByLabelText("Nykyinen aikaväli").textContent).toBe("Nyt");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
    "Nykyinen aikaväli",
  );

  await user.click(
    screen.getByRole("button", {
      name: /Valitse aikaväli 14:00–15:00/i,
    }),
  );

  expect(screen.queryByLabelText("Nykyinen aikaväli")).toBeNull();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
    "Valittu aikaväli",
  );
});

it("defaults to today's calendar-day horizon", () => {
  render(<PriceExplorer data={data} />);

  const todayButton = screen.getByRole("button", { name: "Tänään" });
  expect(todayButton.getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("button", { name: "Seuraavat 24h" })).toBeNull();
  expect(screen.getByRole("button", { name: "Huomenna" })).toBeTruthy();
});

it("shows carried-forward markers only in the 15-minute chart", async () => {
  const user = userEvent.setup();
  const dataWithCarriedPoint: ExplorerData = {
    ...data,
    today: {
      hourly: data.today.hourly,
      quarterHour: [
        { ...expensivePoint, carriedForward: true },
        cheapestPoint,
      ],
    },
  };

  render(<PriceExplorer data={dataWithCarriedPoint} />);

  expect(document.querySelector(".price-chart__bar--carried")).toBeNull();

  await user.click(
    screen.getByRole("button", { name: "15 minuutin tarkkuus" }),
  );

  expect(document.querySelector(".price-chart__bar--carried")).not.toBeNull();
});

it("shows the current-time line only on today's horizon", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-22T10:30:00.000Z"));
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
    name: "Pörssisähkön hinta",
  });
  const unavailableMessage =
    "Huomisen hinnat eivät ole vielä saatavilla. Ne päivittyvät noin klo 15.";

  expect(chart.textContent).toContain(unavailableMessage);
  expect(screen.queryAllByText(unavailableMessage)).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Tänään" })).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Huomenna" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.queryByRole("group", { name: "Hintayhteenveto" })).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: /Valitse aikaväli 00:00–01:00/,
    }),
  ).toBeNull();
});

it("hides the summary for a truncated tomorrow horizon", async () => {
  const user = userEvent.setup();
  const truncatedTomorrowPoint = (
    id: string,
    startAt: string,
    endAt: string,
    priceCentsPerKwh: number,
  ): PricePoint => ({
    ...expensivePoint,
    id,
    startAt,
    endAt,
    priceCentsPerKwh,
    label: "00:00–01:00",
    level: "normal",
  });
  const truncatedTomorrowData: ExplorerData = {
    ...data,
    tomorrow: {
      hourly: [
        truncatedTomorrowPoint(
          "truncated-0",
          "2026-08-22T21:00:00.000Z",
          "2026-08-22T22:00:00.000Z",
          5,
        ),
        truncatedTomorrowPoint(
          "truncated-1",
          "2026-08-22T22:00:00.000Z",
          "2026-08-22T23:00:00.000Z",
          8,
        ),
      ],
      quarterHour: [],
    },
  };

  render(<PriceExplorer data={truncatedTomorrowData} />);
  await user.click(screen.getByRole("button", { name: "Huomenna" }));

  expect(screen.queryByRole("group", { name: "Hintayhteenveto" })).toBeNull();
});

it("matches the mockup chart header and control order", () => {
  render(<PriceExplorer data={data} />);

  const chart = screen.getByRole("region", {
    name: "Pörssisähkön hinta",
  });
  const chartHeader = chart.querySelector(".price-chart__header");
  const horizonControls = screen.getByRole("group", {
    name: "Tarkastelujakso",
  });
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
  expect(headerGroups).toEqual(["Hintatarkkuus", "Tarkastelujakso"]);
  expect(screen.getByRole("button", { name: "Tuntikeskiarvo" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "15 minuutin tarkkuus" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Tänään" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Huomenna" })).toBeTruthy();
});

it("shows natural Finnish copy in the calculation and source explanations", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={data} />);

  await user.click(screen.getByRole("button", { name: "Miten laskemme?" }));
  const formulaDialog = screen.getByRole("dialog");
  expect(formulaDialog.textContent).toContain(
    "Arvio perustuu valittuun spot-hintaan ja kunkin ennalta määritellyn käyttötavan kulutukseen.",
  );
  expect(formulaDialog.textContent).toContain(
    "Laskennassa säilytetään täysi tarkkuus, ja kustannus pyöristetään näytettäessä kahteen desimaaliin.",
  );

  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Tietolähde" }));
  const sourceDialog = screen.getByRole("dialog");
  expect(sourceDialog.textContent).toContain(
    "ENTSO-E:n uusimpia Suomen tarjousalueen spot-hintoja 15 minuutin tarkkuudella",
  );
  expect(sourceDialog.textContent).toContain(
    "Suomen yleisen 25,5 %:n arvonlisäveron",
  );
  expect(sourceDialog.textContent).toContain(
    "Puuttuvan hinnan tilalla käytetään 15 minuutin näkymässä viimeisintä saatavilla olevaa hintaa",
  );
});
