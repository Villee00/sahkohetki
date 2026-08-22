"use client";

import type { PriceLevel, PricePoint } from "@/lib/price-types";

type PriceChartProps = {
  points: PricePoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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

function getBarHeightForPrice(price: number, minimum: number, maximum: number): number {
  if (minimum === maximum) return 58;

  const normalized = (price - minimum) / (maximum - minimum);
  return 18 + normalized * 82;
}

function getBarHeight(point: PricePoint, minimum: number, maximum: number): number {
  if (!point.available || point.priceCentsPerKwh === null) return 12;
  return getBarHeightForPrice(point.priceCentsPerKwh, minimum, maximum);
}

function getAvailablePrices(points: PricePoint[]): number[] {
  return points.flatMap((point) =>
    point.available && point.priceCentsPerKwh !== null ? [point.priceCentsPerKwh] : [],
  );
}

function getAveragePrice(availablePrices: number[]): number | null {
  if (availablePrices.length === 0) return null;

  return availablePrices.reduce((total, price) => total + price, 0) / availablePrices.length;
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

export function PriceChart({ points, selectedId, onSelect }: PriceChartProps) {
  const availablePrices = getAvailablePrices(points);
  const minimum = availablePrices.length > 0 ? Math.min(...availablePrices) : 0;
  const maximum = availablePrices.length > 0 ? Math.max(...availablePrices) : 0;
  const averagePrice = getAveragePrice(availablePrices);
  const averageHeight =
    averagePrice === null ? null : getBarHeightForPrice(averagePrice, minimum, maximum);
  const averageLabel =
    averagePrice === null
      ? null
      : `Vuorokauden keskiarvo ${formatPrice(averagePrice)} snt/kWh`;
  const chartGridStyle = {
    gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
  };

  return (
    <section aria-labelledby="price-chart-heading" className="price-chart space-y-4">
      <div className="price-chart__header flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Hintajaksot
          </p>
          <h2 id="price-chart-heading" className="mt-1 text-xl font-semibold text-white">
            Valitse ajankohta
          </h2>
        </div>
        <p className="text-right text-xs text-slate-400">
          Valitse palkki näppäimistöllä tai osoittimella.
        </p>
      </div>

      {points.length > 0 ? (
        <div className="price-chart__frame rounded-2xl border border-slate-700/70 bg-slate-950/35 p-4">
          <div className="price-chart__legend" aria-label="Kaavion selite">
            <span className="price-chart__legend-item">
              <span className="price-chart__legend-swatch price-chart__legend-swatch--bar" aria-hidden="true" />
              <span>Hinta (snt/kWh)</span>
            </span>
            {averageLabel ? (
              <span className="price-chart__legend-item">
                <span className="price-chart__legend-swatch price-chart__legend-swatch--average" aria-hidden="true" />
                <span>{averageLabel}</span>
              </span>
            ) : null}
          </div>

          <div className="price-chart__bar-area">
            {averageLabel && averageHeight !== null ? (
              <div
                className="price-chart__average-line"
                style={{ bottom: `${averageHeight}%` }}
                role="img"
                aria-label={averageLabel}
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
                      } ${
                        isSelected
                          ? "bg-sky-400/15 ring-2 ring-sky-300"
                          : "hover:bg-white/5"
                      }`}
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
                        className={`price-chart__bar ${barClass} block w-full rounded-t-lg transition group-focus-visible:bg-sky-200`}
                        style={{ height: `${getBarHeight(point, minimum, maximum)}%` }}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className={`price-chart__axis grid${points.length > 48 ? " price-chart__axis--dense" : ""}`}
            style={chartGridStyle}
            aria-hidden="true"
          >
            {points.map((point) => {
              const { hour, minute, offset } = getPointTimeLabel(point);
              return (
                <span key={point.id} className="price-chart__time-label" data-minute={minute}>
                  <span>{hour}</span>
                  <span className="price-chart__time-label-minutes">:{minute}</span>
                  {offset ? <span className="price-chart__time-label-offset">{offset}</span> : null}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="unavailable-panel rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
          Hintajaksoja ei ole tällä hetkellä saatavilla.
        </p>
      )}

    </section>
  );
}
