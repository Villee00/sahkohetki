// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PriceChart } from "./price-chart";

afterEach(() => cleanup());

const point = {
  id: "quarter-1015",
  startAt: "2026-08-22T10:15:00.000Z",
  endAt: "2026-08-22T10:30:00.000Z",
  label: "10:15–10:30",
  priceCentsPerKwh: 4.5,
  available: true,
  level: "cheap" as const,
};

const higherPoint = {
  id: "quarter-1030",
  startAt: "2026-08-22T10:30:00.000Z",
  endAt: "2026-08-22T10:45:00.000Z",
  label: "10:30–10:45",
  priceCentsPerKwh: 9,
  available: true,
  level: "normal" as const,
};

const previousHourPoint = {
  ...point,
  id: "hour-1200",
  startAt: "2026-08-22T09:00:00.000Z",
  endAt: "2026-08-22T10:00:00.000Z",
  label: "12:00–13:00",
};

const currentHourPoint = {
  ...point,
  id: "hour-1300",
  startAt: "2026-08-22T10:00:00.000Z",
  endAt: "2026-08-22T11:00:00.000Z",
  label: "13:00–14:00",
};

const nextHourPoint = {
  ...higherPoint,
  id: "hour-1400",
  startAt: "2026-08-22T11:00:00.000Z",
  endAt: "2026-08-22T12:00:00.000Z",
  label: "14:00–15:00",
};

it("lets a keyboard-accessible chart button select an available interval", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<PriceChart points={[point]} selectedId={point.id} onSelect={onSelect} />);
  const button = screen.getByRole("button", { name: /10:15/ });
  expect(button.getAttribute("aria-pressed")).toBe("true");
  await user.click(button);
  expect(onSelect).toHaveBeenCalledWith(point.id);
});

it("shows the exact price when hovering an available interval", async () => {
  const user = userEvent.setup();
  render(<PriceChart points={[point]} selectedId={point.id} onSelect={vi.fn()} />);

  const button = screen.getByRole("button", { name: /10:15/ });
  await user.hover(button);

  expect(button.getAttribute("title")).toBe("4,50 snt/kWh");
});

it("renders the mockup-style zero-based chart with a visible price scale", () => {
  render(
    <PriceChart
      points={[
        point,
        higherPoint,
        {
          ...higherPoint,
          id: "quarter-1100",
          label: "11:00–11:15",
          priceCentsPerKwh: 18.67,
          level: "high" as const,
        },
      ]}
      selectedId="quarter-1100"
      onSelect={vi.fn()}
    />,
  );

  expect(screen.getByRole("heading", { name: "Pörssisähkön tuntikaavio" })).toBeTruthy();
  expect(screen.queryByText("Hintajaksot")).toBeNull();
  expect(screen.getByTestId("price-chart-grid")).toBeTruthy();
  expect(screen.getByTestId("price-chart-vertical-grid").children).toHaveLength(3);
  expect(screen.getByText("-5")).toBeTruthy();
  expect(screen.getByText("0")).toBeTruthy();
  expect(screen.getByText("5")).toBeTruthy();
  expect(screen.getByText("10")).toBeTruthy();
  expect(screen.getByText("15")).toBeTruthy();
  expect(screen.getByText("20")).toBeTruthy();
  expect(screen.queryByText("-5 c")).toBeNull();
  expect(screen.getByText("snt/kWh")).toBeTruthy();
  expect(screen.getByText("10:15–10:30")).toBeTruthy();
  expect(screen.getByText("11:00–11:15")).toBeTruthy();
  expect(screen.queryByText(/Päivän keskihinta/)).toBeNull();
  expect(
    Number.parseFloat(
      screen.getByTestId("price-chart-average-line").style.bottom,
    ),
  ).toBeCloseTo(62.8933, 4);
  expect(screen.getByTestId("price-chart-legend")).toBeTruthy();
  expect(screen.getByText("Vihreä")).toBeTruthy();
  expect(screen.getByText("Keltainen")).toBeTruthy();
  expect(screen.getByText("Punainen")).toBeTruthy();

  const selectedButton = screen.getByRole("button", { name: /11:00/ });
  expect(selectedButton.getAttribute("aria-pressed")).toBe("true");
  expect(selectedButton.querySelector(".price-chart__bar--selected")).toBeTruthy();
});

it("places the current-time line exactly within the current interval", () => {
  render(
    <PriceChart
      points={[previousHourPoint, currentHourPoint, nextHourPoint]}
      selectedId={currentHourPoint.id}
      onSelect={vi.fn()}
      currentTime={Date.parse("2026-08-22T10:30:00.000Z")}
    />,
  );

  expect(screen.getByTestId("price-chart-current-time").style.left).toBe("50%");
});

it("keeps unavailable intervals in the chart without changing the scale", () => {
  render(
    <PriceChart
      points={[
        point,
        {
          ...higherPoint,
          id: "quarter-unavailable",
          label: "10:30–10:45",
          priceCentsPerKwh: null,
          available: false,
        },
        { ...higherPoint, id: "quarter-1045", label: "10:45–11:00" },
      ]}
      selectedId={point.id}
      onSelect={vi.fn()}
    />,
  );

  expect(screen.getByTestId("price-chart-grid")).toBeTruthy();
  expect(screen.getByText("0")).toBeTruthy();
  expect(screen.getByText("10")).toBeTruthy();
  expect(screen.getByText("snt/kWh")).toBeTruthy();
  expect(screen.getByRole("button", { name: /hinta ei ole saatavilla/ }).hasAttribute("disabled")).toBe(true);
});

it("calculates the daily average from available intervals only", () => {
  render(
    <PriceChart
      points={[
        point,
        {
          ...higherPoint,
          id: "quarter-unavailable-for-average",
          priceCentsPerKwh: null,
          available: false,
        },
        { ...higherPoint, id: "quarter-1100", priceCentsPerKwh: 18.67 },
      ]}
      selectedId={point.id}
      onSelect={vi.fn()}
    />,
  );

  expect(
    screen.getByRole("img", {
      name: "Päivän keskihinta: 11,59 snt/kWh",
    }),
  ).toBeTruthy();
});

it("keeps daylight-saving offset markers in visible time labels", () => {
  render(
    <PriceChart
      points={[{ ...point, label: "03:00–04:00 (UTC+3)" }]}
      selectedId={point.id}
      onSelect={vi.fn()}
    />,
  );

  expect(screen.getByText("+3")).toBeTruthy();
});
