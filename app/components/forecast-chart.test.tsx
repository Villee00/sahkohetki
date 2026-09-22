// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForecastInterval } from "../../lib/forecast-types";
import { ForecastChart } from "./forecast-chart";

afterEach(cleanup);

function point(
  startAt: string,
  productionMw: number | null,
  consumptionMw: number | null,
): ForecastInterval {
  const start = Date.parse(startAt);
  const available = productionMw !== null && consumptionMw !== null;
  const balance = available ? productionMw - consumptionMw : null;
  return {
    id: startAt,
    granularity: "hour",
    startAt,
    endAt: new Date(start + 60 * 60 * 1_000).toISOString(),
    label: "",
    available,
    productionMw,
    consumptionMw,
    domesticBalanceMw: balance,
    domesticBalanceKind:
      balance === null
        ? null
        : balance < 0
          ? "domestic-deficit"
          : balance > 0
            ? "domestic-surplus"
            : "balanced",
    domesticCoveragePercent:
      available && consumptionMw > 0
        ? (productionMw / consumptionMw) * 100
        : null,
    windMw: null,
    solarMw: null,
    windCapacityMw: null,
    solarCapacityMw: null,
    windCapacityUtilizationPercent: null,
    solarCapacityUtilizationPercent: null,
  };
}

const points = [
  point("2026-09-22T12:00:00.000Z", 9_000, 10_000),
  point("2026-09-22T13:00:00.000Z", null, 10_200),
  point("2026-09-22T14:00:00.000Z", 11_000, 10_000),
];

describe("ForecastChart", () => {
  it("exposes its meaning and every hour without relying on color", () => {
    render(
      <ForecastChart
        points={points}
        selectedId={points[0].id}
        currentTime="2026-09-22T12:30:00.000Z"
        onSelect={() => undefined}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: /tuotanto- ja kulutusennuste seuraaville tunneille/i,
      }),
    ).toBeTruthy();
    expect(screen.getByText("Tuotantoennuste")).toBeTruthy();
    expect(screen.getByText("Kulutusennuste")).toBeTruthy();
    expect(screen.getByText("Laskennallinen alijäämä")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Valitse tunti.*tiedot puuttuvat/i }),
    ).toBeTruthy();
  });

  it("selects with pointer input and adjacent-arrow keyboard controls", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ForecastChart
        points={points}
        selectedId={points[0].id}
        currentTime="2026-09-22T12:30:00.000Z"
        onSelect={onSelect}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Valitse tunti.*11 000 MW/i }),
    );
    expect(onSelect).toHaveBeenLastCalledWith(points[2].id);

    fireEvent.keyDown(
      screen.getByRole("button", { name: /Valitse tunti.*9 000 MW/i }),
      { key: "ArrowRight" },
    );
    expect(onSelect).toHaveBeenLastCalledWith(points[1].id);
  });

  it("draws separate line segments around a missing hour instead of interpolating", () => {
    render(
      <ForecastChart
        points={points}
        selectedId={points[0].id}
        currentTime={null}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getAllByTestId("production-line-segment")).toHaveLength(2);
    expect(screen.getAllByTestId("consumption-line-segment")).toHaveLength(1);
    expect(screen.getByTestId("forecast-chart-svg").getAttribute("data-gap-count")).toBe(
      "1",
    );
  });
});
