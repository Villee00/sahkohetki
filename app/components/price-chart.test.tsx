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
  level: "high" as const,
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

it("shows the active-view average line and keeps levels color-only", () => {
  render(
    <PriceChart
      points={[point, higherPoint]}
      selectedId={point.id}
      onSelect={vi.fn()}
    />,
  );

  expect(
    screen.getByRole("img", {
      name: "Vuorokauden keskiarvo 6,75 snt/kWh",
    }),
  ).toBeTruthy();
  expect(screen.getByText("Vuorokauden keskiarvo 6,75 snt/kWh")).toBeTruthy();
  expect(screen.queryByText("Edullinen")).toBeNull();
  expect(screen.queryByText("Tavanomainen")).toBeNull();
  expect(screen.queryByText("Korkea")).toBeNull();
  expect(screen.getAllByRole("button")).toHaveLength(2);
});

it("excludes unavailable intervals from the average line", () => {
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

  expect(
    screen.getByRole("img", {
      name: "Vuorokauden keskiarvo 6,75 snt/kWh",
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
