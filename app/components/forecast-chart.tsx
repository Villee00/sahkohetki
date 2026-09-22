"use client";

import { useId } from "react";
import type { KeyboardEvent } from "react";
import type { ForecastInterval } from "../../lib/forecast-types";

type ForecastChartProps = {
  points: ForecastInterval[];
  selectedId: string | null;
  currentTime: string | null;
  onSelect: (id: string) => void;
};

const WIDTH = 1_200;
const HEIGHT = 360;
const MARGIN = { top: 44, right: 22, bottom: 54, left: 62 } as const;
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

const powerFormatter = new Intl.NumberFormat("fi-FI", {
  maximumFractionDigits: 0,
});

const hourFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  hour: "2-digit",
  minute: "2-digit",
});

const accessibleHourFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const dayFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  weekday: "long",
});

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Helsinki",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatPower(value: number): string {
  return powerFormatter
    .format(Math.round(value))
    .replace(/[\u00a0\u202f]/g, " ");
}

function xPosition(index: number, count: number): number {
  if (count <= 1) return MARGIN.left + PLOT_WIDTH / 2;
  return MARGIN.left + (index / (count - 1)) * PLOT_WIDTH;
}

function yPosition(value: number, maximum: number): number {
  return MARGIN.top + PLOT_HEIGHT - (value / maximum) * PLOT_HEIGHT;
}

function niceMaximum(values: number[]): number {
  const maximum = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const normalized = maximum / magnitude;
  const rounded =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 4
          ? 4
          : normalized <= 6
            ? 6
            : normalized <= 8
              ? 8
              : 10;
  return rounded * magnitude;
}

function seriesSegments(
  points: ForecastInterval[],
  valueFor: (point: ForecastInterval) => number | null,
  maximum: number,
): string[] {
  const segments: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) segments.push(current.join(" "));
    current = [];
  };

  points.forEach((point, index) => {
    const value = valueFor(point);
    if (value === null || !Number.isFinite(value)) {
      flush();
      return;
    }
    const command = current.length === 0 ? "M" : "L";
    current.push(
      `${command} ${xPosition(index, points.length).toFixed(2)} ${yPosition(
        value,
        maximum,
      ).toFixed(2)}`,
    );
  });
  flush();
  return segments;
}

function selectionLabel(point: ForecastInterval): string {
  const time = accessibleHourFormatter.format(new Date(point.startAt));
  if (
    !point.available ||
    point.productionMw === null ||
    point.consumptionMw === null
  ) {
    return `Valitse tunti ${time}, tiedot puuttuvat`;
  }
  return `Valitse tunti ${time}, tuotanto ${formatPower(
    point.productionMw,
  )} MW, kulutus ${formatPower(point.consumptionMw)} MW`;
}

function currentPosition(
  points: ForecastInterval[],
  currentTime: string | null,
): number | null {
  if (!currentTime || points.length === 0) return null;
  const now = Date.parse(currentTime);
  const start = Date.parse(points[0].startAt);
  const end = Date.parse(points[points.length - 1].endAt);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    now < start ||
    now >= end ||
    end <= start
  ) {
    return null;
  }
  return MARGIN.left + ((now - start) / (end - start)) * PLOT_WIDTH;
}

export function ForecastChart({
  points,
  selectedId,
  currentTime,
  onSelect,
}: ForecastChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const availableValues = points.flatMap((point) => [
    ...(point.productionMw === null ? [] : [point.productionMw]),
    ...(point.consumptionMw === null ? [] : [point.consumptionMw]),
  ]);
  const maximum = niceMaximum(availableValues) * 1.05;
  const ticks = Array.from({ length: 5 }, (_, index) => (maximum / 4) * index);
  const productionSegments = seriesSegments(
    points,
    (point) => point.productionMw,
    maximum,
  );
  const consumptionSegments = seriesSegments(
    points,
    (point) => point.consumptionMw,
    maximum,
  );
  const selectedIndex = Math.max(
    0,
    points.findIndex((point) => point.id === selectedId),
  );
  const selectedPoint = points.find((point) => point.id === selectedId) ?? null;
  const nowX = currentPosition(points, currentTime);
  const gapCount = points.filter((point) => !point.available).length;

  const dayBoundaries = points.flatMap((point, index) => {
    const key = dayKeyFormatter.format(new Date(point.startAt));
    const previousKey =
      index > 0
        ? dayKeyFormatter.format(new Date(points[index - 1].startAt))
        : null;
    return index === 0 || key !== previousKey
      ? [{ index, label: dayFormatter.format(new Date(point.startAt)) }]
      : [];
  });
  const dayBoundaryIndexes = new Set(dayBoundaries.map(({ index }) => index));

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = Math.min(points.length - 1, index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = Math.max(0, index - 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = points.length - 1;
    }
    if (nextIndex === null || nextIndex === index) return;
    event.preventDefault();
    onSelect(points[nextIndex].id);
    const sibling = event.currentTarget.parentElement?.children.item(nextIndex);
    if (sibling instanceof HTMLElement) sibling.focus();
  };

  if (points.length === 0) {
    return (
      <div className="forecast-chart__empty">
        Ennustepisteitä ei ole saatavilla.
      </div>
    );
  }

  return (
    <div className="forecast-chart">
      <div className="forecast-chart__legend" aria-label="Kaavion selite">
        <span className="forecast-legend forecast-legend--production">
          Tuotantoennuste
        </span>
        <span className="forecast-legend forecast-legend--consumption">
          Kulutusennuste
        </span>
        <span className="forecast-legend forecast-legend--deficit">
          Laskennallinen alijäämä
        </span>
      </div>
      <div className="forecast-chart__scroller" tabIndex={0}>
        <div className="forecast-chart__canvas">
          <svg
            data-testid="forecast-chart-svg"
            data-gap-count={gapCount}
            className="forecast-chart__svg"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label="Tuotanto- ja kulutusennuste seuraaville tunneille"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id={`${gradientId}-surplus`}
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop offset="0" stopColor="#38bdf8" stopOpacity="0.32" />
                <stop offset="1" stopColor="#38bdf8" stopOpacity="0.05" />
              </linearGradient>
              <linearGradient
                id={`${gradientId}-deficit`}
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop offset="0" stopColor="#fbbf24" stopOpacity="0.38" />
                <stop offset="1" stopColor="#f59e0b" stopOpacity="0.07" />
              </linearGradient>
              <filter id={`${gradientId}-glow`} x="-20%" y="-30%" width="140%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {ticks.map((tick) => {
              const y = yPosition(tick, maximum);
              return (
                <g key={tick}>
                  <line
                    x1={MARGIN.left}
                    x2={WIDTH - MARGIN.right}
                    y1={y}
                    y2={y}
                    className="forecast-chart__grid"
                  />
                  <text
                    x={MARGIN.left - 11}
                    y={y + 4}
                    textAnchor="end"
                    className="forecast-chart__axis-label"
                  >
                    {formatPower(tick)}
                  </text>
                </g>
              );
            })}
            <text x={10} y={MARGIN.top - 16} className="forecast-chart__axis-unit">
              MW
            </text>

            {dayBoundaries.map(({ index, label }) => {
              const x = xPosition(index, points.length);
              return (
                <g key={`${index}-${label}`}>
                  {index > 0 ? (
                    <line
                      x1={x}
                      x2={x}
                      y1={MARGIN.top - 18}
                      y2={HEIGHT - MARGIN.bottom + 8}
                      className="forecast-chart__day-line"
                    />
                  ) : null}
                  <text
                    x={Math.min(x + 10, WIDTH - 100)}
                    y={20}
                    className="forecast-chart__day-label"
                  >
                    {label.charAt(0).toUpperCase() + label.slice(1)}
                  </text>
                </g>
              );
            })}

            {points.slice(0, -1).map((point, index) => {
              const next = points[index + 1];
              if (
                !point.available ||
                !next.available ||
                point.productionMw === null ||
                point.consumptionMw === null ||
                next.productionMw === null ||
                next.consumptionMw === null
              ) {
                return null;
              }
              const x1 = xPosition(index, points.length);
              const x2 = xPosition(index + 1, points.length);
              const productionY1 = yPosition(point.productionMw, maximum);
              const productionY2 = yPosition(next.productionMw, maximum);
              const consumptionY1 = yPosition(point.consumptionMw, maximum);
              const consumptionY2 = yPosition(next.consumptionMw, maximum);
              const deficit =
                (point.domesticBalanceMw ?? 0) +
                  (next.domesticBalanceMw ?? 0) <
                0;
              return (
                <path
                  key={`area-${point.id}`}
                  d={`M ${x1} ${productionY1} L ${x2} ${productionY2} L ${x2} ${consumptionY2} L ${x1} ${consumptionY1} Z`}
                  fill={`url(#${gradientId}-${deficit ? "deficit" : "surplus"})`}
                  className={
                    deficit
                      ? "forecast-chart__area forecast-chart__area--deficit"
                      : "forecast-chart__area forecast-chart__area--surplus"
                  }
                />
              );
            })}

            {productionSegments.map((path, index) => (
              <path
                key={`production-${index}`}
                data-testid="production-line-segment"
                d={path}
                className="forecast-chart__line forecast-chart__line--production"
                filter={`url(#${gradientId}-glow)`}
              />
            ))}
            {consumptionSegments.map((path, index) => (
              <path
                key={`consumption-${index}`}
                data-testid="consumption-line-segment"
                d={path}
                className="forecast-chart__line forecast-chart__line--consumption"
              />
            ))}

            {points.map((point, index) =>
              point.productionMw === null ? null : (
                <circle
                  key={`production-dot-${point.id}`}
                  cx={xPosition(index, points.length)}
                  cy={yPosition(point.productionMw, maximum)}
                  r="2.4"
                  className="forecast-chart__point forecast-chart__point--production"
                />
              ),
            )}
            {points.map((point, index) =>
              point.consumptionMw === null ? null : (
                <circle
                  key={`consumption-dot-${point.id}`}
                  cx={xPosition(index, points.length)}
                  cy={yPosition(point.consumptionMw, maximum)}
                  r="2.2"
                  className="forecast-chart__point forecast-chart__point--consumption"
                />
              ),
            )}

            {nowX !== null ? (
              <g>
                <line
                  x1={nowX}
                  x2={nowX}
                  y1={MARGIN.top - 8}
                  y2={HEIGHT - MARGIN.bottom}
                  className="forecast-chart__now-line"
                />
                <text
                  x={nowX}
                  y={MARGIN.top - 15}
                  textAnchor="middle"
                  className="forecast-chart__now-label"
                >
                  Nyt
                </text>
              </g>
            ) : null}

            {selectedPoint ? (
              <g className="forecast-chart__selection">
                <line
                  x1={xPosition(selectedIndex, points.length)}
                  x2={xPosition(selectedIndex, points.length)}
                  y1={MARGIN.top}
                  y2={HEIGHT - MARGIN.bottom}
                  className="forecast-chart__selection-line"
                />
                {selectedPoint.productionMw !== null ? (
                  <circle
                    cx={xPosition(selectedIndex, points.length)}
                    cy={yPosition(selectedPoint.productionMw, maximum)}
                    r="5"
                    className="forecast-chart__selection-dot forecast-chart__selection-dot--production"
                  />
                ) : null}
                {selectedPoint.consumptionMw !== null ? (
                  <circle
                    cx={xPosition(selectedIndex, points.length)}
                    cy={yPosition(selectedPoint.consumptionMw, maximum)}
                    r="5"
                    className="forecast-chart__selection-dot forecast-chart__selection-dot--consumption"
                  />
                ) : null}
              </g>
            ) : null}

            {points.map((point, index) =>
              index % 6 === 0 || index === points.length - 1 ? (
                <text
                  key={`time-${point.id}`}
                  x={xPosition(index, points.length)}
                  y={HEIGHT - 19}
                  textAnchor="middle"
                  className="forecast-chart__time-label"
                >
                  {hourFormatter.format(new Date(point.startAt))}
                </text>
              ) : null,
            )}
          </svg>

          <div
            className="forecast-chart__hit-grid"
            style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
          >
            {points.map((point, index) => (
              <button
                key={point.id}
                type="button"
                className={`forecast-chart__hit ${point.id === selectedId ? "forecast-chart__hit--selected" : ""} ${dayBoundaryIndexes.has(index) ? "forecast-chart__hit--day-start" : ""}`}
                aria-label={selectionLabel(point)}
                aria-pressed={point.id === selectedId}
                tabIndex={
                  point.id === selectedId || (!selectedId && index === 0) ? 0 : -1
                }
                onClick={() => onSelect(point.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              />
            ))}
          </div>
        </div>
      </div>
      <p className="forecast-chart__hint">
        Valitse tunti napauttamalla tai käytä nuolinäppäimiä.
      </p>
    </div>
  );
}
