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

function getBarHeight(point: PricePoint, minimum: number, maximum: number): number {
  if (!point.available || point.priceCentsPerKwh === null) return 12;
  if (minimum === maximum) return 58;

  const normalized = (point.priceCentsPerKwh - minimum) / (maximum - minimum);
  return 18 + normalized * 82;
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
  const availablePrices = points.flatMap((point) =>
    point.available && point.priceCentsPerKwh !== null ? [point.priceCentsPerKwh] : [],
  );
  const minimum = availablePrices.length > 0 ? Math.min(...availablePrices) : 0;
  const maximum = availablePrices.length > 0 ? Math.max(...availablePrices) : 0;

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
        <div className="price-chart__scroll overflow-x-auto rounded-2xl border border-slate-700/70 bg-slate-950/35 p-4">
          <div
            className="price-chart__bars grid min-h-64 items-end gap-2"
            style={{
              gridTemplateColumns: `repeat(${points.length}, minmax(3.75rem, 1fr))`,
              minWidth: `${Math.max(points.length * 3.75, 24)}rem`,
            }}
          >
            {points.map((point) => {
              const isSelected = point.id === selectedId;
              const levelClass = point.level ?? "unavailable";
              const barClass = point.available
                ? `price-chart__bar--${point.level ?? "normal"}`
                : "price-chart__bar--unavailable";
              return (
                <div key={point.id} className="price-chart__item flex min-w-0 h-full flex-col justify-end gap-2">
                  <button
                    type="button"
                    className={`price-chart__bar-button group flex min-h-44 w-full flex-col items-center justify-end rounded-xl px-1 py-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-50 ${
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
                      className={`price-chart__bar ${barClass} block w-full max-w-10 rounded-t-lg transition group-focus-visible:bg-sky-200`}
                      style={{ height: `${getBarHeight(point, minimum, maximum)}%` }}
                    />
                    <span className="price-chart__time-label mt-2 block text-[0.7rem] font-medium leading-tight text-slate-300">
                      {point.label}
                    </span>
                  </button>
                  <span className="price-chart__level-label min-h-4 text-center text-[0.65rem] text-slate-500" data-level={point.level ?? "unavailable"}>
                    {point.level ? levelLabels[point.level] : "Ei saatavilla"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="unavailable-panel rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
          Hintajaksoja ei ole tällä hetkellä saatavilla.
        </p>
      )}

      <div className="price-chart__summary rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Tekstimuotoinen yhteenveto
        </p>
        <ul className="price-chart__summary-list mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((point) => (
            <li key={point.id} className="flex items-baseline justify-between gap-3 border-b border-slate-800/80 pb-2">
              <span>{point.label}</span>
              <span className="text-right font-mono text-xs text-slate-200">
                {point.available && point.priceCentsPerKwh !== null
                  ? `${formatPrice(point.priceCentsPerKwh)} snt/kWh`
                  : "Ei saatavilla"}
                {point.level ? ` · ${levelLabels[point.level]}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
