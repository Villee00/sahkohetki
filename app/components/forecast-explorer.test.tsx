// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ElectricityForecastResult,
  ForecastInterval,
  ForecastSnapshot,
} from "../../lib/forecast-types";
import { ForecastExplorer } from "./forecast-explorer";

afterEach(cleanup);

function interval(
  startAt: string,
  productionMw: number | null,
  consumptionMw: number | null,
  overrides: Partial<ForecastInterval> = {},
): ForecastInterval {
  const start = Date.parse(startAt);
  const available = productionMw !== null && consumptionMw !== null;
  const domesticBalanceMw = available ? productionMw - consumptionMw : null;
  return {
    id: startAt,
    granularity: "hour",
    startAt,
    endAt: new Date(start + 60 * 60 * 1_000).toISOString(),
    label: "",
    available,
    productionMw,
    consumptionMw,
    domesticBalanceMw,
    domesticBalanceKind:
      domesticBalanceMw === null
        ? null
        : domesticBalanceMw < 0
          ? "domestic-deficit"
          : domesticBalanceMw > 0
            ? "domestic-surplus"
            : "balanced",
    domesticCoveragePercent:
      available && consumptionMw > 0
        ? (productionMw / consumptionMw) * 100
        : null,
    windMw: 3_850,
    solarMw: 120,
    windCapacityMw: 8_000,
    solarCapacityMw: 1_500,
    windCapacityUtilizationPercent: 48.125,
    solarCapacityUtilizationPercent: 8,
    ...overrides,
  };
}

const firstHour = interval(
  "2026-09-22T12:00:00.000Z",
  9_300,
  11_000,
);
const secondHour = interval(
  "2026-09-22T13:00:00.000Z",
  12_000,
  10_000,
  { windMw: 4_100, solarMw: 200 },
);
const thirdHour = interval(
  "2026-09-22T14:00:00.000Z",
  10_000,
  10_000,
  { windMw: 4_000, solarMw: 160 },
);

const readySnapshot: ForecastSnapshot = {
  status: "ready",
  generatedAt: "2026-09-22T12:30:00.000Z",
  freshness: {
    state: "fresh",
    fetchedAt: "2026-09-22T12:29:30.000Z",
    ageSeconds: 30,
  },
  horizon: {
    startAt: firstHour.startAt,
    endAt: thirdHour.endAt,
    durationHours: 72,
  },
  quarterHour: [],
  hourly: [firstHour, secondHour, thirdHour],
  missingIntervals: [],
  current: {
    production: {
      valueMw: 9_600,
      observedAt: "2026-09-22T12:28:00.000Z",
    },
    consumption: {
      valueMw: 10_800,
      observedAt: "2026-09-22T12:28:00.000Z",
    },
    netImport: {
      valueMw: 1_200,
      observedAt: "2026-09-22T12:28:00.000Z",
    },
    shortageStatus: {
      code: 0,
      level: "normal",
      observedAt: "2026-09-22T12:27:00.000Z",
    },
  },
  source: {
    name: "Fingrid Open Data",
    homepageUrl: "https://data.fingrid.fi/en",
    apiUrl: "https://data.fingrid.fi/api/data",
    datasets: { productionForecast: 241, consumptionForecast: 166 },
    capacityDescription:
      "Wind and solar capacity values are Fingrid forecast-model estimates, not a guarantee of available electricity.",
  },
};

function renderExplorer(result: ElectricityForecastResult = readySnapshot) {
  return render(<ForecastExplorer result={result} />);
}

describe("ForecastExplorer", () => {
  it("selects the complete hour containing now and explains a domestic deficit", () => {
    renderExplorer();

    expect(screen.getByRole("heading", { name: "Sähköennuste" })).toBeTruthy();
    expect(
      screen.getByText(/Kotimainen tuotanto kattaa arviolta 85 % kulutuksesta/),
    ).toBeTruthy();
    expect(screen.getByText(/Arvioitu tuontitarve/).textContent).toMatch(
      /1.?700 MW/,
    );
    const ledger = screen.getByTestId("forecast-ledger");
    expect(within(ledger).getByText("Tuotanto")).toBeTruthy();
    expect(within(ledger).getByText("Kulutus")).toBeTruthy();
    expect(within(ledger).getByText("Kattavuus")).toBeTruthy();
    expect(within(ledger).getByText("Tuuli")).toBeTruthy();
    expect(within(ledger).getByText("Aurinko")).toBeTruthy();
  });

  it("moves between hours and changes the plain-language balance summary", async () => {
    const user = userEvent.setup();
    renderExplorer();

    await user.click(screen.getByRole("button", { name: "Seuraava tunti" }));
    expect(
      screen.getByText(/Tuotanto ylittää kotimaisen kulutusennusteen arviolta/)
        .textContent,
    ).toMatch(/2.?000 MW/);
    expect(screen.getByRole("button", { name: "Edellinen tunti" })).not.toHaveProperty(
      "disabled",
      true,
    );
  });

  it("falls forward to the first complete future hour when the current hour is missing", () => {
    renderExplorer({
      ...readySnapshot,
      hourly: [
        interval(firstHour.startAt, null, 11_000),
        secondHour,
        thirdHour,
      ],
      missingIntervals: [
        {
          granularity: "hour",
          startAt: firstHour.startAt,
          endAt: firstHour.endAt,
          missingSeries: ["production"],
        },
      ],
    });

    expect(
      screen.getByText(/Tuotanto ylittää kotimaisen kulutusennusteen arviolta/),
    ).toBeTruthy();
    expect(screen.getByTestId("selected-hour-summary").textContent).toContain(
      "16–17",
    );
  });

  it("shows real gaps and exposes the complete hourly table", async () => {
    const user = userEvent.setup();
    renderExplorer({
      ...readySnapshot,
      hourly: [firstHour, interval(secondHour.startAt, null, 10_000), thirdHour],
      missingIntervals: [
        {
          granularity: "hour",
          startAt: secondHour.startAt,
          endAt: secondHour.endAt,
          missingSeries: ["production"],
        },
      ],
    });

    expect(screen.getByRole("status").textContent).toMatch(/puuttuvia tuntitietoja/i);
    await user.click(screen.getByText("Näytä ennuste taulukkona"));
    const table = screen.getByRole("table", { name: /72 tunnin sähköennuste/i });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("Ei saatavilla")).toBeTruthy();
  });

  it("labels missing capacity as unavailable instead of deriving utilization", () => {
    renderExplorer({
      ...readySnapshot,
      hourly: readySnapshot.hourly.map((hour) => ({
        ...hour,
        windCapacityMw: null,
        solarCapacityMw: null,
        windCapacityUtilizationPercent: null,
        solarCapacityUtilizationPercent: null,
      })),
    });

    expect(screen.getAllByText("Kapasiteettiarviota ei saatavilla")).toHaveLength(
      2,
    );
  });

  it("distinguishes a stale forecast and measured current state", () => {
    renderExplorer({
      ...readySnapshot,
      freshness: {
        state: "stale",
        fetchedAt: "2026-09-22T12:20:00.000Z",
        ageSeconds: 10 * 60,
      },
    });

    expect(screen.getByText(/viimeisin onnistunut ennuste/i)).toBeTruthy();
    const current = screen.getByRole("region", { name: "Tilanne nyt" });
    expect(current.textContent).toMatch(/9.?600 MW/);
    expect(current.textContent).toMatch(/Nettotuonti/);
    expect(current.textContent).toMatch(/Normaali/);
  });

  it("shows distinct clock offsets for the repeated autumn hour in summary and table", async () => {
    const user = userEvent.setup();
    const first = interval("2026-10-25T00:00:00.000Z", 9_000, 10_000, {
      label: "03:00–03:00 (UTC+3→UTC+2)",
    });
    const second = interval("2026-10-25T01:00:00.000Z", 9_100, 10_100, {
      label: "03:00–04:00 (UTC+2)",
    });
    renderExplorer({
      ...readySnapshot,
      generatedAt: "2026-10-25T00:30:00.000Z",
      hourly: [first, second],
    });

    expect(screen.getByTestId("selected-hour-summary").textContent).toContain("UTC+3→UTC+2");
    await user.click(screen.getByRole("button", { name: "Seuraava tunti" }));
    expect(screen.getByTestId("selected-hour-summary").textContent).toContain("UTC+2");
    await user.click(screen.getByText("Näytä ennuste taulukkona"));
    const table = screen.getByRole("table", { name: /72 tunnin sähköennuste/i });
    expect(within(table).getByText(/UTC\+3→UTC\+2/)).toBeTruthy();
    expect(within(table).getByText(/03:00–04:00 \(UTC\+2\)/)).toBeTruthy();
  });

  it("renders a useful Finnish unavailable state when the API key is not configured", () => {
    renderExplorer({
      status: "unavailable",
      reason: "missing-configuration",
      message: "source detail",
    });

    expect(screen.getByRole("heading", { name: "Sähköennuste" })).toBeTruthy();
    expect(screen.getByText(/Sähköennuste ei ole juuri nyt saatavilla/)).toBeTruthy();
    expect(screen.getByText(/FINGRID_API_KEY/)).toBeTruthy();
    expect(screen.queryByText("source detail")).toBeNull();
  });
});
