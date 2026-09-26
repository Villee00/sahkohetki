"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PriceLevel, PricePoint } from "@/lib/price-types";
import { Icon } from "./ui-icon";

type PriceChartProps = {
  points: PricePoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showCarriedForwardMarker?: boolean;
  currentTime?: number | null;
  headerContent?: ReactNode;
  emptyMessage?: string;
  onScrubbingChange?: (isScrubbing: boolean) => void;
};

const levelLabels: Record<PriceLevel, string> = {
  cheap: "Edullinen",
  normal: "Normaali",
  high: "Korkea",
};

const priceFormatter = new Intl.NumberFormat("fi-FI", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function formatPrice(price: number): string {
  return priceFormatter.format(price);
}

const axisFormatter = new Intl.NumberFormat("fi-FI", {
  maximumFractionDigits: 2,
});

type ChartScale = {
  minimum: number;
  maximum: number;
  step: number;
  ticks: number[];
};

function getNiceStep(range: number): number {
  if (range <= 0) return 1;

  const roughStep = range / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceNormalized =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function getChartScale(prices: number[]): ChartScale {
  if (prices.length === 0) {
    return { minimum: 0, maximum: 1, step: 1, ticks: [0, 1] };
  }

  const minimumValue = Math.min(-5, ...prices);
  const maximumValue = Math.max(20, ...prices);
  const step = getNiceStep(maximumValue - minimumValue);
  const minimum = Math.floor(minimumValue / step) * step;
  const maximum = Math.max(
    minimum + step,
    Math.ceil(maximumValue / step) * step,
  );
  const ticks: number[] = [];

  for (let tick = minimum; tick <= maximum + step * 0.0001; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }

  return { minimum, maximum, step, ticks };
}

function getScalePosition(value: number, scale: ChartScale): number {
  const range = scale.maximum - scale.minimum;
  if (range <= 0) return 0;
  return ((value - scale.minimum) / range) * 100;
}

function getCurrentTimePosition(
  points: PricePoint[],
  currentTime: number | null | undefined,
): number | null {
  if (
    currentTime === null ||
    currentTime === undefined ||
    points.length === 0
  ) {
    return null;
  }

  const chartStart = Date.parse(points[0].startAt);
  const chartEnd = Date.parse(points[points.length - 1].endAt);
  if (
    !Number.isFinite(currentTime) ||
    !Number.isFinite(chartStart) ||
    !Number.isFinite(chartEnd) ||
    chartEnd <= chartStart ||
    currentTime < chartStart ||
    currentTime >= chartEnd
  ) {
    return null;
  }

  return ((currentTime - chartStart) / (chartEnd - chartStart)) * 100;
}

function getBarStyle(
  point: PricePoint,
  scale: ChartScale,
): {
  bottom: string;
  height: string;
} {
  const zeroPosition = getScalePosition(0, scale);
  if (!point.available || point.priceCentsPerKwh === null) {
    return {
      bottom: `${Math.max(0, zeroPosition - 0.75)}%`,
      height: "0.75%",
    };
  }

  const value = point.priceCentsPerKwh;
  const distance = Math.max(
    Math.abs(getScalePosition(value, scale) - zeroPosition),
    0.75,
  );

  return {
    bottom: `${value >= 0 ? zeroPosition : zeroPosition - distance}%`,
    height: `${distance}%`,
  };
}

function formatAxisValue(value: number): string {
  return axisFormatter.format(value).replace("−", "-");
}

function getAvailablePointPrice(point: PricePoint): number | null {
  return point.available && point.priceCentsPerKwh !== null
    ? point.priceCentsPerKwh
    : null;
}

function getAvailablePrices(points: PricePoint[]): number[] {
  return points.flatMap((point) => {
    const price = getAvailablePointPrice(point);
    return price === null ? [] : [price];
  });
}

function getAveragePrice(points: PricePoint[]): number | null {
  const prices = getAvailablePrices(points);
  if (prices.length === 0) return null;
  return prices.reduce((total, price) => total + price, 0) / prices.length;
}

function getPointCenterPosition(index: number, count: number): number {
  return ((index + 0.5) / count) * 100;
}

function getLineYPosition(price: number, scale: ChartScale): number {
  return Number((100 - getScalePosition(price, scale)).toFixed(6));
}

function getLineCoordinates(
  index: number,
  count: number,
  price: number,
  scale: ChartScale,
) {
  return {
    x1: (index / count) * 100,
    x2: ((index + 1) / count) * 100,
    y: getLineYPosition(price, scale),
  };
}

function getLineCoordinatesForId(
  points: PricePoint[],
  id: string | null,
  scale: ChartScale,
) {
  const index = points.findIndex((point) => point.id === id);
  if (index < 0) return null;
  const price = getAvailablePointPrice(points[index]);
  return price === null
    ? null
    : getLineCoordinates(index, points.length, price, scale);
}

function getLineSegments(points: PricePoint[], scale: ChartScale): string[] {
  const segments: string[] = [];
  let coordinates: string[] = [];

  points.forEach((point, index) => {
    const price = getAvailablePointPrice(point);
    if (price === null) {
      if (coordinates.length > 0) segments.push(coordinates.join(" "));
      coordinates = [];
      return;
    }

    const { x1, x2, y } = getLineCoordinates(
      index,
      points.length,
      price,
      scale,
    );
    coordinates.push(`${x1},${y}`, `${x2},${y}`);
  });

  if (coordinates.length > 0) segments.push(coordinates.join(" "));
  return segments;
}

function getPointTimeLabel(point: PricePoint): {
  hour: string;
  minute: string;
  offset: string | null;
} {
  const [timeRange, offsetLabel] = point.label.split(" (");
  const startLabel = timeRange?.split("–")[0] ?? point.label;
  const [hour = startLabel, minute = ""] = startLabel.split(":");
  const offset = offsetLabel?.replace(")", "").replace(/UTC/g, "") ?? null;
  return { hour, minute, offset };
}

function formatPointHour(hour: string): string {
  const numericHour = Number.parseInt(hour, 10);
  return Number.isNaN(numericHour) ? hour : String(numericHour);
}

function shouldHidePointLabelOnMobile(hour: string, minute: string): boolean {
  const numericHour = Number.parseInt(hour, 10);
  return (
    minute !== "00" ||
    !Number.isInteger(numericHour) ||
    numericHour % 2 !== 0
  );
}

function pointAccessibleLabel(
  point: PricePoint,
  showCarriedForwardMarker: boolean,
): string {
  const price = getAvailablePointPrice(point);
  if (price === null) {
    return `Aikaväli ${point.label}, hinta ei ole saatavilla`;
  }

  const level = point.level
    ? `, hintataso ${levelLabels[point.level].toLowerCase()}`
    : "";
  const carriedForward =
    showCarriedForwardMarker && point.carriedForward === true
      ? ", lähdearvo puuttui ja hinta on täydennetty viimeisimmällä julkaistulla hinnalla"
      : "";
  return `Valitse aikaväli ${point.label}, hinta ${formatPrice(
    price,
  )} senttiä kilowattitunnilta${level}${carriedForward}`;
}

export function PriceChart({
  points,
  selectedId,
  onSelect,
  showCarriedForwardMarker = false,
  currentTime,
  headerContent,
  emptyMessage,
  onScrubbingChange,
}: PriceChartProps) {
  const [showLineChart, setShowLineChart] = useState(false);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [focusedPointId, setFocusedPointId] = useState<string | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const plotAreaRef = useRef<HTMLDivElement | null>(null);

  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const onScrubbingChangeRef = useRef(onScrubbingChange);
  useEffect(() => {
    onScrubbingChangeRef.current = onScrubbingChange;
  }, [onScrubbingChange]);

  const pointsRef = useRef(points);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  const mouseCleanupRef = useRef<(() => void) | null>(null);

  const getPointFromClientX = useCallback(
    (
      clientX: number,
      cachedRect?: { left: number; width: number } | null,
    ): PricePoint | null => {
      const currentPoints = pointsRef.current;
      if (currentPoints.length === 0) return null;

      let left = cachedRect?.left;
      let width = cachedRect?.width;

      if (left === undefined || width === undefined || width <= 0) {
        const plot = plotAreaRef.current;
        if (!plot) return null;
        const rect = plot.getBoundingClientRect();
        if (rect.width <= 0) return null;
        left = rect.left;
        width = rect.width;
      }

      const clampedX = Math.max(0, Math.min(width, clientX - left));
      const ratio = clampedX / width;
      const index = Math.min(
        currentPoints.length - 1,
        Math.max(0, Math.floor(ratio * currentPoints.length)),
      );
      return currentPoints[index] ?? null;
    },
    [],
  );

  const handlePlotPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const plot = plotAreaRef.current;
    if (!plot) return;

    mouseCleanupRef.current?.();

    const rect = plot.getBoundingClientRect();
    const cachedRect = { left: rect.left, width: rect.width };
    const point = getPointFromClientX(e.clientX, cachedRect);
    if (!point) return;

    let isMouseDragging = true;
    setIsScrubbing(true);
    onScrubbingChangeRef.current?.(true);
    setHoveredPointId(point.id);
    if (point.available) {
      onSelectRef.current(point.id);
    }

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isMouseDragging) return;
      const pt = getPointFromClientX(moveEvent.clientX, cachedRect);
      if (pt) {
        setHoveredPointId(pt.id);
        if (pt.available) {
          onSelectRef.current(pt.id);
        }
      }
    };

    const cleanupMouse = () => {
      isMouseDragging = false;
      setIsScrubbing(false);
      onScrubbingChangeRef.current?.(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", cleanupMouse);
      mouseCleanupRef.current = null;
    };

    mouseCleanupRef.current = cleanupMouse;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", cleanupMouse);
  };

  useEffect(() => {
    const plot = plotAreaRef.current;
    if (!plot) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let scrubbingActive = false;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let lastScrubbedId: string | null = null;
    let lastVibrateTime = 0;
    let rafId: number | null = null;
    let pendingClientX: number | null = null;
    let cachedRect: { left: number; width: number } | null = null;

    const triggerHaptic = () => {
      const now = Date.now();
      if (now - lastVibrateTime < 35) return;
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(6);
          lastVibrateTime = now;
        }
      } catch {
        // Safe to ignore if vibrate unsupported or blocked
      }
    };

    const processScrubPoint = (clientX: number) => {
      const point = getPointFromClientX(clientX, cachedRect);
      if (!point) return;

      if (point.id !== lastScrubbedId) {
        lastScrubbedId = point.id;
        triggerHaptic();
        setHoveredPointId(point.id);
        if (point.available) {
          onSelectRef.current(point.id);
        }
      }
    };

    const endScrub = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (pendingClientX !== null) {
        processScrubPoint(pendingClientX);
        pendingClientX = null;
      }
      cachedRect = null;
      if (scrubbingActive) {
        scrubbingActive = false;
        setIsScrubbing(false);
        onScrubbingChangeRef.current?.(false);
        setHoveredPointId(null);
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        if (scrubbingActive) {
          endScrub();
        }
        return;
      }
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      scrubbingActive = false;
      lastScrubbedId = null;

      const rect = plot.getBoundingClientRect();
      cachedRect = rect.width > 0 ? { left: rect.left, width: rect.width } : null;

      // When the user holds on the chart for 110ms, engage smooth scrubbing mode
      holdTimer = setTimeout(() => {
        scrubbingActive = true;
        setIsScrubbing(true);
        onScrubbingChangeRef.current?.(true);
        processScrubPoint(touchStartX);
      }, 110);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        if (scrubbingActive) {
          endScrub();
        }
        return;
      }
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);

      if (!scrubbingActive) {
        // If moving vertically more than horizontally, it's a page scroll: cancel hold
        if (dy > 7 && dy > dx) {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
          return;
        }

        // If moving horizontally clearly, activate scrub mode immediately
        if (dx > 6 && dx > dy) {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
          scrubbingActive = true;
          setIsScrubbing(true);
          onScrubbingChangeRef.current?.(true);
        }
      }

      if (scrubbingActive) {
        if (e.cancelable) {
          e.preventDefault();
        }
        pendingClientX = touch.clientX;
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            rafId = null;
            if (pendingClientX !== null) {
              processScrubPoint(pendingClientX);
            }
          });
        }
      }
    };

    plot.addEventListener("touchstart", handleTouchStart, { passive: true });
    plot.addEventListener("touchmove", handleTouchMove, { passive: false });
    plot.addEventListener("touchend", endScrub, { passive: true });
    plot.addEventListener("touchcancel", endScrub, { passive: true });

    return () => {
      if (holdTimer) clearTimeout(holdTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      mouseCleanupRef.current?.();
      plot.removeEventListener("touchstart", handleTouchStart);
      plot.removeEventListener("touchmove", handleTouchMove);
      plot.removeEventListener("touchend", endScrub);
      plot.removeEventListener("touchcancel", endScrub);
    };
  }, [getPointFromClientX]);

  const activePointId = hoveredPointId ?? focusedPointId;
  const availablePrices = getAvailablePrices(points);
  const chartScale = getChartScale(availablePrices);
  const zeroPosition = getScalePosition(0, chartScale);
  const averagePrice = getAveragePrice(points);
  const averagePosition =
    averagePrice === null ? null : getScalePosition(averagePrice, chartScale);
  const averageLabel =
    averagePrice === null
      ? null
      : `Päivän keskihinta: ${formatPrice(averagePrice)} snt/kWh`;
  const currentTimePosition = getCurrentTimePosition(points, currentTime);
  const hasCarriedForwardPoint =
    showCarriedForwardMarker && points.some((point) => point.carriedForward);
  const hasUnavailablePoint = points.some(
    (point) => getAvailablePointPrice(point) === null,
  );
  const chartGridStyle = {
    gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
  };
  const lineSegments = showLineChart ? getLineSegments(points, chartScale) : [];
  const selectedLine = getLineCoordinatesForId(points, selectedId, chartScale);
  const hoveredLine = getLineCoordinatesForId(points, activePointId, chartScale);

  return (
    <section
      aria-labelledby="price-chart-heading"
      className={`price-chart${isScrubbing ? " price-chart--scrubbing" : ""}`}
    >
      <div className="price-chart__frame rounded-3xl border border-slate-700/70 bg-slate-950/35 p-5 sm:p-6">
        <div className="price-chart__header">
          <h2
            id="price-chart-heading"
            className="price-chart__title"
            aria-label="Pörssisähkön hinta"
          >
            <Icon name="chart" className="price-chart__title-icon" />
            <span>Pörssisähkön hinta</span>
            <span className="price-chart__title-hint">
              (Valitse aika napsauttamalla{" "}
              {showLineChart ? "viivaa" : "pylvästä"})
            </span>
          </h2>
          <div className="price-chart__header-tools">
            <button
              type="button"
              className={`price-chart__view-toggle view-toggle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300${showLineChart ? " view-toggle--active" : ""}`}
              aria-pressed={showLineChart}
              onClick={() => setShowLineChart((value) => !value)}
            >
              Viivakaavio
            </button>
            {headerContent}
          </div>
        </div>

        {points.length > 0 ? (
          <>
            <div className="price-chart__plot-layout">
              <div
                className="price-chart__plot"
                role="group"
                aria-label="Pörssisähkön hintakaavio"
              >
                <div className="price-chart__y-axis" aria-hidden="true">
                  <span className="price-chart__y-unit">snt/kWh</span>
                  {chartScale.ticks.map((tick) => (
                    <span
                      key={tick}
                      className="price-chart__y-tick"
                      style={{
                        bottom: `${getScalePosition(tick, chartScale)}%`,
                      }}
                    >
                      {formatAxisValue(tick)}
                    </span>
                  ))}
                </div>

                <div
                  ref={plotAreaRef}
                  className="price-chart__plot-area"
                  data-scrubbing={isScrubbing ? "true" : undefined}
                  onPointerDown={handlePlotPointerDown}
                >
                  <div
                    className="price-chart__grid-lines"
                    data-testid="price-chart-grid"
                    aria-hidden="true"
                  >
                    {chartScale.ticks.map((tick) => (
                      <span
                        key={tick}
                        className="price-chart__grid-line"
                        style={{
                          bottom: `${getScalePosition(tick, chartScale)}%`,
                        }}
                      />
                    ))}
                  </div>
                  <div
                    className="price-chart__vertical-grid"
                    data-testid="price-chart-vertical-grid"
                    style={chartGridStyle}
                    aria-hidden="true"
                  >
                    {points.map((point) => (
                      <span
                        key={point.id}
                        className="price-chart__vertical-grid-line"
                      />
                    ))}
                  </div>
                  {averagePosition !== null && averageLabel !== null ? (
                    <span
                      className="price-chart__average-line"
                      data-testid="price-chart-average-line"
                      style={{ bottom: `${averagePosition}%` }}
                      role="img"
                      aria-label={averageLabel}
                    />
                  ) : null}
                  <span
                    className="price-chart__zero-line"
                    style={{ bottom: `${zeroPosition}%` }}
                    aria-hidden="true"
                  />
                  {currentTimePosition !== null ? (
                    <span
                      className="price-chart__current-time"
                      data-testid="price-chart-current-time"
                      style={{ left: `${currentTimePosition}%` }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {showLineChart ? (
                    <div
                      className="price-chart__line-layer"
                      data-testid="price-chart-line"
                      aria-hidden="true"
                    >
                      <svg
                        className="price-chart__line"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                      >
                        {lineSegments.map((coordinates, index) => (
                          <polyline key={index} points={coordinates} />
                        ))}
                        {selectedLine ? (
                          <line
                            className="price-chart__line-selected"
                            x1={selectedLine.x1}
                            x2={selectedLine.x2}
                            y1={selectedLine.y}
                            y2={selectedLine.y}
                          />
                        ) : null}
                        {hoveredLine ? (
                          <line
                            className="price-chart__line-hover"
                            x1={hoveredLine.x1}
                            x2={hoveredLine.x2}
                            y1={hoveredLine.y}
                            y2={hoveredLine.y}
                          />
                        ) : null}
                        {showCarriedForwardMarker
                          ? points.map((point, index) => {
                              const price = getAvailablePointPrice(point);
                              if (price === null || !point.carriedForward) {
                                return null;
                              }
                              const { x1, x2, y } = getLineCoordinates(
                                index,
                                points.length,
                                price,
                                chartScale,
                              );
                              return (
                                <line
                                  key={point.id}
                                  className="price-chart__line-carried"
                                  x1={x1}
                                  x2={x2}
                                  y1={y}
                                  y2={y}
                                />
                              );
                            })
                          : null}
                      </svg>
                      {points.map((point, index) => {
                        const price = getAvailablePointPrice(point);
                        return price === null ? (
                          <span
                            key={point.id}
                            className="price-chart__unavailable-marker"
                            style={{
                              left: `${getPointCenterPosition(index, points.length)}%`,
                              bottom: `${zeroPosition}%`,
                            }}
                          />
                        ) : null;
                      })}
                    </div>
                  ) : null}
                  <div
                    className="price-chart__bars grid"
                    style={chartGridStyle}
                  >
                    {points.map((point, index) => {
                      const isSelected = point.id === selectedId;
                      const isHovered = point.id === activePointId;
                      const showSelectedBar = isSelected && !isHovered;
                      const pointPrice = getAvailablePointPrice(point);
                      const isCarriedForward =
                        showCarriedForwardMarker && point.carriedForward === true;
                      const levelClass = point.level ?? "unavailable";
                      const barClass = point.available
                        ? `price-chart__bar--${point.level ?? "normal"}`
                        : "price-chart__bar--unavailable";
                      const align =
                        index < points.length * 0.22
                          ? "start"
                          : index > points.length * 0.78
                            ? "end"
                            : "center";

                      return (
                        <div
                          key={point.id}
                          className={`price-chart__item${
                            isHovered ? " price-chart__item--hovered" : ""
                          }`}
                          onMouseEnter={() => setHoveredPointId(point.id)}
                          onMouseLeave={() => setHoveredPointId(null)}
                        >
                          <button
                            type="button"
                            className={`price-chart__bar-button group flex w-full items-end justify-center rounded-xl px-1 pt-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                              !point.available
                                ? "price-chart__bar-button--unavailable"
                                : ""
                            } ${isSelected ? "price-chart__bar-button--selected" : ""}`}
                            aria-label={pointAccessibleLabel(
                              point,
                              showCarriedForwardMarker,
                            )}
                            aria-pressed={isSelected}
                            data-level={levelClass}
                            data-carried-forward={
                              isCarriedForward ? "true" : undefined
                            }
                            disabled={!point.available}
                            onBlur={() => setFocusedPointId(null)}
                            onClick={() => {
                              if (point.available) onSelect(point.id);
                            }}
                            onFocus={() => setFocusedPointId(point.id)}
                          >
                            {!showLineChart ? (
                              <span
                                aria-hidden="true"
                                className={`price-chart__bar ${barClass}${
                                  showSelectedBar
                                    ? " price-chart__bar--selected"
                                    : ""
                                }${
                                  isHovered ? " price-chart__bar--hovered" : ""
                                }${
                                  isCarriedForward
                                    ? " price-chart__bar--carried"
                                    : ""
                                } block w-full rounded-t-lg transition group-focus-visible:bg-sky-200`}
                                style={getBarStyle(point, chartScale)}
                              />
                            ) : null}
                          </button>
                          {isHovered && pointPrice !== null ? (
                            <span
                              className="price-chart__tooltip"
                              data-level={levelClass}
                              data-align={align}
                              role="tooltip"
                            >
                              <span className="price-chart__tooltip-time">
                                {point.label}
                              </span>{" "}
                              <span className="price-chart__tooltip-price">
                                {formatPrice(pointPrice)}{" "}
                                <span className="price-chart__tooltip-unit">
                                  snt/kWh
                                </span>
                              </span>
                              {isCarriedForward ? (
                                <span className="price-chart__tooltip-note">
                                  Puuttunut lähdearvo – käytetty viimeisin julkaistu hinta
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div
                className={`price-chart__axis grid${points.length > 48 ? " price-chart__axis--dense" : ""}`}
                style={chartGridStyle}
                aria-hidden="true"
              >
                {points.map((point) => {
                  const { hour, minute, offset } = getPointTimeLabel(point);
                  const hideOnMobile = shouldHidePointLabelOnMobile(
                    hour,
                    minute,
                  );
                  return (
                    <span
                      key={point.id}
                      className="price-chart__time-label"
                      data-minute={minute}
                      data-mobile-hidden={hideOnMobile ? "true" : undefined}
                    >
                      <span className="price-chart__time-label-main">
                        {formatPointHour(hour)}
                      </span>
                      {offset ? (
                        <span className="price-chart__time-label-offset">
                          {offset}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </div>

            <div
              className="price-chart__legend"
              data-testid="price-chart-legend"
              aria-label={showLineChart ? "Kaavion merkinnät" : "Kaavion värit"}
            >
              <span className="price-chart__legend-prefix">
                {showLineChart ? "Merkinnät:" : "Värit:"}
              </span>
              {showLineChart ? (
                <span className="price-chart__legend-item">
                  <span
                    className="price-chart__legend-swatch price-chart__legend-swatch--line"
                    aria-hidden="true"
                  />
                  <span className="price-chart__legend-detail">
                    Sininen viiva
                  </span>
                  <span className="price-chart__legend-detail">
                    = Spot-hinta
                  </span>
                </span>
              ) : (
                <>
                  <span className="price-chart__legend-item">
                    <span
                      className="price-chart__legend-swatch price-chart__legend-swatch--cheap"
                      aria-hidden="true"
                    />
                    <span className="price-chart__legend-name price-chart__legend-name--cheap">
                      Vihreä
                    </span>
                    <span className="price-chart__legend-detail">
                      = Edullinen
                    </span>
                  </span>
                  <span className="price-chart__legend-item">
                    <span
                      className="price-chart__legend-swatch price-chart__legend-swatch--normal"
                      aria-hidden="true"
                    />
                    <span className="price-chart__legend-name price-chart__legend-name--normal">
                      Keltainen
                    </span>
                    <span className="price-chart__legend-detail">
                      = Normaali
                    </span>
                  </span>
                  <span className="price-chart__legend-item">
                    <span
                      className="price-chart__legend-swatch price-chart__legend-swatch--high"
                      aria-hidden="true"
                    />
                    <span className="price-chart__legend-name price-chart__legend-name--high">
                      Punainen
                    </span>
                    <span className="price-chart__legend-detail">
                      = Korkea
                    </span>
                  </span>
                </>
              )}
              {showLineChart && hasUnavailablePoint ? (
                <span className="price-chart__legend-item">
                  <span
                    className="price-chart__legend-swatch price-chart__legend-swatch--unavailable"
                    aria-hidden="true"
                  />
                  <span className="price-chart__legend-detail">
                    Ei saatavilla
                  </span>
                </span>
              ) : null}
              {hasCarriedForwardPoint ? (
                <span className="price-chart__legend-item">
                  <span
                    className={`price-chart__legend-swatch price-chart__legend-swatch--carried${showLineChart ? "-line" : ""}`}
                    aria-hidden="true"
                  />
                  <span className="price-chart__legend-name price-chart__legend-name--carried">
                    {showLineChart ? "Katkoviiva" : "Viivoitettu"}
                  </span>
                  <span className="price-chart__legend-detail">
                    = viimeisin julkaistu hinta puuttuneen tilalla
                  </span>
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="unavailable-panel rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
            {emptyMessage ?? "Hintajaksoja ei ole tällä hetkellä saatavilla."}
          </p>
        )}
      </div>
    </section>
  );
}
