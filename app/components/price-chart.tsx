"use client";

import type { ReactNode } from "react";
import type { PriceLevel, PricePoint } from "@/lib/price-types";
import { Icon } from "./ui-icon";

type PriceChartProps = {
  points: PricePoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentTime?: number | null;
  headerContent?: ReactNode;
  emptyMessage?: string;
};

const levelLabels: Record<PriceLevel, string> = {
  cheap: "Edullinen",
  normal: "Tavanomainen",
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
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
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
  const maximum = Math.max(minimum + step, Math.ceil(maximumValue / step) * step);
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
  if (currentTime === null || currentTime === undefined || points.length === 0) {
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

function getBarStyle(point: PricePoint, scale: ChartScale): {
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
  return `${axisFormatter.format(value).replace("−", "-")} c`;
}

function getAvailablePrices(points: PricePoint[]): number[] {
  return points.flatMap((point) =>
    point.available && point.priceCentsPerKwh !== null ? [point.priceCentsPerKwh] : [],
  );
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

function pointAccessibleLabel(point: PricePoint): string {
  if (!point.available || point.priceCentsPerKwh === null) {
    return `Valitse aikaväli ${point.label}, hinta ei ole saatavilla`;
  }

  const level = point.level ? `, hintataso ${levelLabels[point.level].toLowerCase()}` : "";
  return `Valitse aikaväli ${point.label}, hinta ${formatPrice(
    point.priceCentsPerKwh,
  )} senttiä kilowattitunnilta${level}`;
}

export function PriceChart({
  points,
  selectedId,
  onSelect,
  currentTime,
  headerContent,
  emptyMessage,
}: PriceChartProps) {
  const availablePrices = getAvailablePrices(points);
  const chartScale = getChartScale(availablePrices);
  const zeroPosition = getScalePosition(0, chartScale);
  const currentTimePosition = getCurrentTimePosition(points, currentTime);
  const chartGridStyle = {
    gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
  };

  return (
    <section aria-labelledby="price-chart-heading" className="price-chart">
      <div className="price-chart__frame rounded-3xl border border-slate-700/70 bg-slate-950/35 p-5 sm:p-6">
        <div className="price-chart__header">
          <h2
            id="price-chart-heading"
            className="price-chart__title"
            aria-label="Pörssisähkön Tuntikaavio"
          >
            <Icon name="chart" className="price-chart__title-icon" />
            <span>Pörssisähkön Tuntikaavio</span>
            <span className="price-chart__title-hint">(Klikkaa pylvästä valitaksesi ajan)</span>
          </h2>
          {headerContent ? <div className="price-chart__header-tools">{headerContent}</div> : null}
        </div>

        {points.length > 0 ? (
          <>
          <div className="price-chart__plot-layout">
            <div className="price-chart__plot" role="group" aria-label="Pörssisähkön hintakaavio">
              <div className="price-chart__y-axis" aria-hidden="true">
                {chartScale.ticks.map((tick) => (
                  <span
                    key={tick}
                    className="price-chart__y-tick"
                    style={{ bottom: `${getScalePosition(tick, chartScale)}%` }}
                  >
                    {formatAxisValue(tick)}
                  </span>
                ))}
              </div>

              <div className="price-chart__plot-area">
                <div className="price-chart__grid-lines" data-testid="price-chart-grid" aria-hidden="true">
                  {chartScale.ticks.map((tick) => (
                    <span
                      key={tick}
                      className="price-chart__grid-line"
                      style={{ bottom: `${getScalePosition(tick, chartScale)}%` }}
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
                    <span key={point.id} className="price-chart__vertical-grid-line" />
                  ))}
                </div>
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
                <div className="price-chart__bars grid" style={chartGridStyle}>
                  {points.map((point) => {
                    const isSelected = point.id === selectedId;
                    const levelClass = point.level ?? "unavailable";
                    const barClass = point.available
                      ? `price-chart__bar--${point.level ?? "normal"}`
                      : "price-chart__bar--unavailable";
                    return (
                      <div key={point.id} className="price-chart__item">
                        <button
                          type="button"
                          className={`price-chart__bar-button group flex w-full items-end justify-center rounded-xl px-1 pt-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                            !point.available ? "price-chart__bar-button--unavailable" : ""
                          } ${isSelected ? "price-chart__bar-button--selected" : ""}`}
                          aria-label={pointAccessibleLabel(point)}
                          aria-pressed={isSelected}
                          data-level={levelClass}
                          disabled={!point.available}
                          onClick={() => {
                            if (point.available) onSelect(point.id);
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className={`price-chart__bar ${barClass}${isSelected ? " price-chart__bar--selected" : ""} block w-full rounded-t-lg transition group-focus-visible:bg-sky-200`}
                            style={getBarStyle(point, chartScale)}
                          />
                        </button>
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
                const [timeRange] = point.label.split(" (");
                return (
                  <span key={point.id} className="price-chart__time-label" data-minute={minute}>
                    <span className="price-chart__time-label-main">{timeRange ?? `${hour}:${minute}`}</span>
                    {offset ? <span className="price-chart__time-label-offset">{offset}</span> : null}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="price-chart__legend" data-testid="price-chart-legend" aria-label="Kaavion värit">
            <span className="price-chart__legend-prefix">Värit:</span>
            <span className="price-chart__legend-item">
              <span className="price-chart__legend-swatch price-chart__legend-swatch--cheap" aria-hidden="true" />
              <span className="price-chart__legend-name price-chart__legend-name--cheap">Vihreä</span>
              <span className="price-chart__legend-detail">= Edullinen</span>
            </span>
            <span className="price-chart__legend-item">
              <span className="price-chart__legend-swatch price-chart__legend-swatch--normal" aria-hidden="true" />
              <span className="price-chart__legend-name price-chart__legend-name--normal">Keltainen</span>
              <span className="price-chart__legend-detail">= Tavanomainen</span>
            </span>
            <span className="price-chart__legend-item">
              <span className="price-chart__legend-swatch price-chart__legend-swatch--high" aria-hidden="true" />
              <span className="price-chart__legend-name price-chart__legend-name--high">Punainen</span>
              <span className="price-chart__legend-detail">= Korkea</span>
            </span>
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
