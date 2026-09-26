// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, render, screen } from "@testing-library/react";
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

const carriedPoint = {
  ...point,
  id: "quarter-carried",
  carriedForward: true,
};

it("lets a keyboard-accessible chart button select an available interval", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <PriceChart points={[point]} selectedId={point.id} onSelect={onSelect} />,
  );
  const button = screen.getByRole("button", { name: /10:15/ });
  expect(button.getAttribute("aria-pressed")).toBe("true");
  await user.click(button);
  expect(onSelect).toHaveBeenCalledWith(point.id);
});

it("switches between bar and line charts while keeping interval selection", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <PriceChart
      points={[point, higherPoint]}
      selectedId={point.id}
      onSelect={onSelect}
    />,
  );

  const toggle = screen.getByRole("button", { name: "Viivakaavio" });
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  expect(document.querySelectorAll(".price-chart__bar")).toHaveLength(2);

  await user.click(toggle);
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelector(".price-chart__bar")).toBeNull();
  expect(screen.getByTestId("price-chart-line").querySelectorAll("polyline")).toHaveLength(1);
  expect(document.querySelector(".price-chart__line-point")).toBeNull();
  expect(document.querySelector(".price-chart__line-selected")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: /10:30–10:45/ }));
  expect(onSelect).toHaveBeenCalledWith(higherPoint.id);

  await user.click(toggle);
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  expect(screen.queryByTestId("price-chart-line")).toBeNull();
  expect(document.querySelectorAll(".price-chart__bar")).toHaveLength(2);
});

it("holds each price flat for its full interval and changes at the boundary", async () => {
  const user = userEvent.setup();
  render(
    <PriceChart
      points={[point, higherPoint]}
      selectedId={point.id}
      onSelect={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Viivakaavio" }));
  expect(
    screen
      .getByTestId("price-chart-line")
      .querySelector("polyline")
      ?.getAttribute("points"),
  ).toBe("0,62 50,62 50,44 100,44");
});

it("shows the hovered interval tooltip without dots in line mode", async () => {
  const user = userEvent.setup();
  render(
    <PriceChart
      points={[point, higherPoint]}
      selectedId={point.id}
      onSelect={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Viivakaavio" }));
  expect(screen.getByText(/Valitse aika napsauttamalla viivaa/)).toBeTruthy();
  const nextInterval = screen.getByRole("button", { name: /10:30–10:45/ });
  await user.hover(nextInterval);

  expect(screen.getByRole("tooltip").textContent).toContain("9,00 snt/kWh");
  const highlightedLine = screen
    .getByTestId("price-chart-line")
    .querySelector(".price-chart__line-hover");
  expect(highlightedLine?.getAttribute("x1")).toBe("50");
  expect(highlightedLine?.getAttribute("x2")).toBe("100");
  expect(document.querySelector(".price-chart__line-point")).toBeNull();

  await user.unhover(nextInterval);
  expect(
    screen
      .getByTestId("price-chart-line")
      .querySelector(".price-chart__line-hover"),
  ).toBeNull();
});

it("uses a dashed line segment to identify a carried-forward price", async () => {
  const user = userEvent.setup();
  render(
    <PriceChart
      points={[point, { ...higherPoint, carriedForward: true }]}
      selectedId={point.id}
      onSelect={vi.fn()}
      showCarriedForwardMarker
    />,
  );

  await user.click(screen.getByRole("button", { name: "Viivakaavio" }));
  const carriedLine = screen
    .getByTestId("price-chart-line")
    .querySelector(".price-chart__line-carried");
  expect(carriedLine?.getAttribute("x1")).toBe("50");
  expect(carriedLine?.getAttribute("x2")).toBe("100");
  expect(document.querySelector(".price-chart__line-point")).toBeNull();
});

it("shows a line-specific legend without the bar colors", async () => {
  const user = userEvent.setup();
  render(
    <PriceChart
      points={[point, higherPoint]}
      selectedId={point.id}
      onSelect={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Viivakaavio" }));
  expect(screen.getByText("Sininen viiva")).toBeTruthy();
  expect(screen.queryByText("Vihreä")).toBeNull();
  expect(screen.queryByText("Keltainen")).toBeNull();
  expect(screen.queryByText("Punainen")).toBeNull();
});

it("breaks the line at unavailable intervals", async () => {
  const user = userEvent.setup();
  render(
    <PriceChart
      points={[
        point,
        higherPoint,
        { ...higherPoint, id: "missing", available: false, priceCentsPerKwh: null },
        { ...point, id: "later-1" },
        { ...higherPoint, id: "later-2" },
      ]}
      selectedId={point.id}
      onSelect={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Viivakaavio" }));
  expect(
    screen.getByTestId("price-chart-line").querySelectorAll("polyline"),
  ).toHaveLength(2);
  expect(document.querySelector(".price-chart__line-point")).toBeNull();
  expect(
    document.querySelectorAll(".price-chart__unavailable-marker"),
  ).toHaveLength(1);
  expect(
    screen
      .getByRole("button", { name: /hinta ei ole saatavilla/ })
      .hasAttribute("disabled"),
  ).toBe(true);
});

it("marks unavailable intervals after the line ends", async () => {
  const user = userEvent.setup();
  render(
    <PriceChart
      points={[
        point,
        higherPoint,
        {
          ...point,
          id: "unpublished",
          available: false,
          priceCentsPerKwh: null,
        },
      ]}
      selectedId={point.id}
      onSelect={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Viivakaavio" }));
  const missingMarker = document.querySelector<HTMLElement>(
    ".price-chart__unavailable-marker",
  );
  expect(missingMarker).not.toBeNull();
  expect(Number.parseFloat(missingMarker?.style.left ?? "0")).toBeCloseTo(
    83.33,
    2,
  );
  expect(screen.getByText("Ei saatavilla")).toBeTruthy();
});

it("shows a fast styled tooltip and highlights the hovered interval", async () => {
  const user = userEvent.setup();
  render(
    <PriceChart points={[point]} selectedId={point.id} onSelect={vi.fn()} />,
  );

  const button = screen.getByRole("button", { name: /10:15/ });
  expect(screen.queryByRole("tooltip")).toBeNull();
  await user.hover(button);

  const tooltip = screen.getByRole("tooltip");
  expect(tooltip.textContent).toContain("10:15–10:30");
  expect(tooltip.textContent).toContain("4,50 snt/kWh");
  expect(button.getAttribute("title")).toBeNull();
  expect(
    button.parentElement?.classList.contains("price-chart__item--hovered"),
  ).toBe(true);

  await user.unhover(button);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("shows the price tooltip when an interval receives keyboard focus", async () => {
  const user = userEvent.setup();
  render(<PriceChart points={[point]} selectedId={point.id} onSelect={vi.fn()} />);

  await user.tab();
  await user.tab();

  expect(screen.getByRole("tooltip").textContent).toContain("4,50 snt/kWh");
});

it("marks carried-forward prices only when the quarter-hour marker is enabled", () => {
  const { rerender } = render(
    <PriceChart
      points={[carriedPoint]}
      selectedId={carriedPoint.id}
      onSelect={vi.fn()}
      showCarriedForwardMarker
    />,
  );

  expect(
    screen
      .getByRole("button", { name: /täydennetty viimeisimmällä julkaistulla hinnalla/ })
      .querySelector(".price-chart__bar")
      ?.classList.contains("price-chart__bar--carried"),
  ).toBe(true);
  expect(screen.getByText("Viivoitettu")).toBeTruthy();

  rerender(
    <PriceChart
      points={[carriedPoint]}
      selectedId={carriedPoint.id}
      onSelect={vi.fn()}
    />,
  );

  expect(
    document.querySelector(".price-chart__bar--carried"),
  ).toBeNull();
  expect(screen.queryByText("Viivoitettu")).toBeNull();
});

it("keeps hover presentation dominant while selecting a different interval", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <PriceChart
      points={[point, higherPoint]}
      selectedId={point.id}
      onSelect={vi.fn()}
    />,
  );

  const nextButton = screen.getByRole("button", { name: /10:30–10:45/ });
  await user.hover(nextButton);
  await user.click(nextButton);
  rerender(
    <PriceChart
      points={[point, higherPoint]}
      selectedId={higherPoint.id}
      onSelect={vi.fn()}
    />,
  );

  expect(nextButton.getAttribute("aria-pressed")).toBe("true");
  expect(
    nextButton
      .querySelector(".price-chart__bar")
      ?.classList.contains("price-chart__bar--hovered"),
  ).toBe(true);
  expect(
    nextButton
      .querySelector(".price-chart__bar")
      ?.classList.contains("price-chart__bar--selected"),
  ).toBe(false);
});

it("keeps the focused interval highlighted after the pointer leaves another interval", async () => {
  const user = userEvent.setup();
  render(
    <PriceChart
      points={[point, higherPoint]}
      selectedId={point.id}
      onSelect={vi.fn()}
    />,
  );

  const firstButton = screen.getByRole("button", { name: /10:15/ });
  const secondItem = screen.getByRole("button", { name: /10:30–10:45/ }).parentElement;
  expect(secondItem).not.toBeNull();

  await user.click(firstButton);
  await user.hover(secondItem!);
  await user.unhover(secondItem!);

  expect(screen.getByRole("tooltip").textContent).toContain("4,50 snt/kWh");
  expect(firstButton.parentElement?.classList.contains("price-chart__item--hovered")).toBe(true);
});

it("highlights an unavailable interval when its cell is hovered", async () => {
  const user = userEvent.setup();
  render(
    <PriceChart
      points={[
        point,
        {
          ...higherPoint,
          id: "quarter-unavailable-hover",
          label: "10:30–10:45",
          priceCentsPerKwh: null,
          available: false,
        },
      ]}
      selectedId={point.id}
      onSelect={vi.fn()}
    />,
  );

  const unavailableButton = screen.getByRole("button", {
    name: /hinta ei ole saatavilla/,
  });
  const unavailableItem = unavailableButton.parentElement;
  expect(unavailableItem).not.toBeNull();

  await user.hover(unavailableItem!);

  expect(
    unavailableItem?.classList.contains("price-chart__item--hovered"),
  ).toBe(true);
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

  expect(
    screen.getByRole("heading", { name: "Pörssisähkön hinta" }),
  ).toBeTruthy();
  expect(screen.queryByText("Hintajaksot")).toBeNull();
  expect(screen.getByTestId("price-chart-grid")).toBeTruthy();
  expect(screen.getByTestId("price-chart-vertical-grid").children).toHaveLength(
    3,
  );
  expect(
    Array.from(document.querySelectorAll(".price-chart__y-tick")).map(
      (tick) => tick.textContent,
    ),
  ).toEqual(["-5", "0", "5", "10", "15", "20"]);
  expect(screen.queryByText("-5 c")).toBeNull();
  expect(screen.getByText("snt/kWh")).toBeTruthy();
  expect(
    Array.from(document.querySelectorAll(".price-chart__time-label-main")).map(
      (label) => label.textContent,
    ),
  ).toEqual(["10", "10", "11"]);
  expect(screen.queryByText("10:15–10:30")).toBeNull();
  expect(screen.queryByText("11:00–11:15")).toBeNull();
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
  expect(
    selectedButton.querySelector(".price-chart__bar--selected"),
  ).toBeTruthy();
});

it("renders numeric hour ticks and marks every other hour for mobile", () => {
  const styles = readFileSync(`${process.cwd()}/app/globals.css`, "utf8");
  const hourPoints = [0, 1, 2, 3].map((hour) => ({
    ...point,
    id: `hour-${hour}`,
    startAt: `2026-08-22T${String(hour).padStart(2, "0")}:00:00.000Z`,
    endAt: `2026-08-22T${String(hour + 1).padStart(2, "0")}:00:00.000Z`,
    label: `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`,
  }));

  render(
    <PriceChart points={hourPoints} selectedId={hourPoints[0].id} onSelect={vi.fn()} />,
  );

  const labels = Array.from(
    document.querySelectorAll(".price-chart__time-label"),
  );
  expect(
    labels.map((label) => label.querySelector(".price-chart__time-label-main")?.textContent),
  ).toEqual(["0", "1", "2", "3"]);
  expect(
    labels.map((label) => label.getAttribute("data-mobile-hidden")),
  ).toEqual([null, "true", null, "true"]);
  expect(screen.queryByText("00:00–01:00")).toBeNull();
  expect(screen.getByRole("button", { name: /00:00–01:00/ })).toBeTruthy();
  expect(styles).toMatch(
    /@media \(max-width: 47\.999rem\)[\s\S]*\.price-chart__time-label\[data-mobile-hidden="true"\][\s\S]*visibility: hidden;/,
  );
});

it("anchors hour labels to the grid line at desktop and mobile sizes", () => {
  const styles = readFileSync(`${process.cwd()}/app/globals.css`, "utf8");
  const labelRule = styles.match(
    /\.price-chart__time-label\s*\{([\s\S]*?)\n\}/,
  )?.[1] ?? "";
  const narrowLabelRule = styles.match(
    /@media \(max-width: 30rem\)[\s\S]*?\.price-chart__time-label\s*\{([\s\S]*?)\n  \}/,
  )?.[1] ?? "";

  expect(labelRule).toMatch(/justify-self:\s*start;/);
  expect(labelRule).toMatch(/transform:\s*translateX\(-50%\);/);
  expect(narrowLabelRule).toMatch(/transform:\s*translateX\(-50%\);/);
});

it("centers each price bar within its chart cell", () => {
  const styles = readFileSync(`${process.cwd()}/app/globals.css`, "utf8");
  const barRule = styles.match(/\.price-chart__bar\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const hoveredRule =
    styles.match(/\.price-chart__bar--hovered\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(barRule).toMatch(/left:\s*50%;/);
  expect(barRule).toMatch(/right:\s*auto;/);
  expect(barRule).toMatch(/transform:\s*translateX\(-50%\);/);
  expect(hoveredRule).toMatch(/transform:\s*translateX\(-50%\)/);
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
  expect(
    Array.from(document.querySelectorAll(".price-chart__y-tick")).map(
      (tick) => tick.textContent,
    ),
  ).toEqual(["-5", "0", "5", "10", "15", "20"]);
  expect(screen.getByText("snt/kWh")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: /hinta ei ole saatavilla/ })
      .hasAttribute("disabled"),
  ).toBe(true);
});

it("anchors negative bars below the zero line while preserving available semantics", () => {
  render(
    <PriceChart
      points={[
        {
          ...point,
          id: "quarter-negative",
          priceCentsPerKwh: -2.5,
          level: "cheap",
        },
      ]}
      selectedId="quarter-negative"
      onSelect={vi.fn()}
    />,
  );

  const button = screen.getByRole("button", { name: /−2,50/ });
  const bar = button.querySelector<HTMLElement>(".price-chart__bar");
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(button.hasAttribute("disabled")).toBe(false);
  expect(Number.parseFloat(bar?.style.bottom ?? "0")).toBeLessThan(20);
  expect(Number.parseFloat(bar?.style.height ?? "0")).toBeGreaterThan(0);
});

it("settles chart bars with CSS height and bottom transitions", () => {
  const styles = readFileSync(`${process.cwd()}/app/globals.css`, "utf8");
  const barRule = styles.match(/\.price-chart__bar\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(barRule).toMatch(/transition:[^;]*height/);
  expect(barRule).toMatch(/transition:[^;]*bottom/);
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


it("supports touch-hold scrubbing to select and highlight intervals smoothly", () => {
  vi.useFakeTimers();
  const onSelect = vi.fn();
  const onScrubbingChange = vi.fn();

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => {},
  });

  const { container } = render(
    <PriceChart
      points={[point, higherPoint]}
      selectedId={point.id}
      onSelect={onSelect}
      onScrubbingChange={onScrubbingChange}
    />,
  );

  const plotArea = container.querySelector(".price-chart__plot-area");
  expect(plotArea).not.toBeNull();

  // Touch on the second half (x = 150 of 200 -> higherPoint)
  const touchStart = new Event("touchstart", { bubbles: true, cancelable: true });
  Object.assign(touchStart, {
    touches: [{ clientX: 150, clientY: 50 }],
  });
  plotArea!.dispatchEvent(touchStart);

  // Before 110ms hold timer, scrub is not yet active
  expect(onScrubbingChange).not.toHaveBeenCalled();

  // Advance time past the 110ms hold threshold
  act(() => { vi.advanceTimersByTime(120); });

  expect(onScrubbingChange).toHaveBeenCalledWith(true);
  expect(onSelect).toHaveBeenCalledWith(higherPoint.id);
  expect(screen.getByRole("tooltip").textContent).toContain("9,00 snt/kWh");

  // Touch end ends scrubbing
  const touchEnd = new Event("touchend", { bubbles: true, cancelable: true });
  act(() => { plotArea!.dispatchEvent(touchEnd); });

  expect(onScrubbingChange).toHaveBeenCalledWith(false);
  expect(screen.queryByRole("tooltip")).toBeNull();

  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("supports horizontal touch drag to scrub across intervals and cancels vertical scroll", () => {
  const onSelect = vi.fn();
  const onScrubbingChange = vi.fn();

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => {},
  });

  const { container } = render(
    <PriceChart
      points={[point, higherPoint]}
      selectedId={point.id}
      onSelect={onSelect}
      onScrubbingChange={onScrubbingChange}
    />,
  );

  const plotArea = container.querySelector(".price-chart__plot-area")!;

  // Touch start at x=20, y=50 (first point)
  const touchStart = new Event("touchstart", { bubbles: true, cancelable: true });
  Object.assign(touchStart, {
    touches: [{ clientX: 20, clientY: 50 }],
  });
  plotArea.dispatchEvent(touchStart);

  // Horizontal move to x=150, y=52 (dx = 130, dy = 2 -> clear horizontal scrub)
  const touchMove = new Event("touchmove", { bubbles: true, cancelable: true });
  Object.assign(touchMove, {
    touches: [{ clientX: 150, clientY: 52 }],
  });
  const preventDefaultSpy = vi.spyOn(touchMove, "preventDefault");
  plotArea.dispatchEvent(touchMove);

  expect(onScrubbingChange).toHaveBeenCalledWith(true);
  expect(preventDefaultSpy).toHaveBeenCalled();

  // End touch
  const touchEnd = new Event("touchend", { bubbles: true, cancelable: true });
  plotArea.dispatchEvent(touchEnd);

  expect(onScrubbingChange).toHaveBeenCalledWith(false);
  vi.restoreAllMocks();
});

it("preserves standard page scrolling on vertical touch gestures", () => {
  vi.useFakeTimers();
  const onSelect = vi.fn();
  const onScrubbingChange = vi.fn();

  const { container } = render(
    <PriceChart
      points={[point, higherPoint]}
      selectedId={point.id}
      onSelect={onSelect}
      onScrubbingChange={onScrubbingChange}
    />,
  );

  const plotArea = container.querySelector(".price-chart__plot-area")!;

  // Touch start at x=50, y=50
  const touchStart = new Event("touchstart", { bubbles: true, cancelable: true });
  Object.assign(touchStart, {
    touches: [{ clientX: 50, clientY: 50 }],
  });
  plotArea.dispatchEvent(touchStart);

  // Vertical move (dy = 25, dx = 2 -> page scroll)
  const touchMove = new Event("touchmove", { bubbles: true, cancelable: true });
  Object.assign(touchMove, {
    touches: [{ clientX: 52, clientY: 75 }],
  });
  const preventDefaultSpy = vi.spyOn(touchMove, "preventDefault");
  plotArea.dispatchEvent(touchMove);

  // Timers advance, but hold timer should have been canceled
  vi.advanceTimersByTime(200);

  expect(preventDefaultSpy).not.toHaveBeenCalled();
  expect(onScrubbingChange).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();

  vi.useRealTimers();
});

it("positions tooltips with data-align attribute to prevent clipping near edges", async () => {
  const user = userEvent.setup();
  // 5 points: index 0 (<0.22) is start, index 2 (0.4) is center, index 4 (0.8) is end
  const points = [0, 1, 2, 3, 4].map((i) => ({
    ...point,
    id: `p-${i}`,
    label: `10:0${i}–10:0${i + 1}`,
  }));

  render(<PriceChart points={points} selectedId="p-0" onSelect={vi.fn()} />);

  const buttons = screen.getAllByRole("button", { name: /10:0/ });

  // Hover first point (edge left)
  await user.hover(buttons[0]);
  expect(screen.getByRole("tooltip").getAttribute("data-align")).toBe("start");
  await user.unhover(buttons[0]);

  // Hover middle point
  await user.hover(buttons[2]);
  expect(screen.getByRole("tooltip").getAttribute("data-align")).toBe("center");
  await user.unhover(buttons[2]);

  // Hover last point (edge right)
  await user.hover(buttons[4]);
  expect(screen.getByRole("tooltip").getAttribute("data-align")).toBe("end");
  await user.unhover(buttons[4]);
});
