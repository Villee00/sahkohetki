"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type {
  HistoryDayCell,
  HistoryGranularity,
  HistoryPageData,
  HistoryPeriodSummary,
  HistoryPriceBasis,
  PercentileDistribution,
} from "../../lib/history-types";

const numberFormatter = new Intl.NumberFormat("fi-FI", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("fi-FI", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const monthFormatter = new Intl.DateTimeFormat("fi-FI", {
  month: "short",
  timeZone: "UTC",
});
const fetchedFormatter = new Intl.DateTimeFormat("fi-FI", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Helsinki",
});

const granularityLabels: Record<HistoryGranularity, string> = {
  day: "Päivä",
  week: "Viikko",
  month: "Kuukausi",
};
const bandLabels = {
  "very-low": "poikkeuksellisen edullinen",
  low: "edullinen",
  typical: "tavanomainen",
  high: "kallis",
  "very-high": "poikkeuksellisen kallis",
} as const;

function dateValue(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00.000Z`);
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(dateValue(dateKey));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfIsoWeek(dateKey: string): string {
  const weekday = new Date(dateValue(dateKey)).getUTCDay();
  return addDays(dateKey, -(weekday === 0 ? 6 : weekday - 1));
}

function formatDate(dateKey: string): string {
  return dateFormatter.format(new Date(dateValue(dateKey)));
}

function formatPeriod(period: HistoryPeriodSummary): string {
  if (period.granularity === "day") return formatDate(period.startDateKey);
  if (period.granularity === "month") {
    const [year, month] = period.startDateKey.split("-");
    return `${Number(month)} / ${year}`;
  }
  return `${formatDate(period.startDateKey)}–${formatDate(period.endDateKey)}`;
}

function priceValue(
  period: HistoryPeriodSummary,
  basis: HistoryPriceBasis,
): number {
  return basis === "raw"
    ? period.average.rawEurPerMwh
    : period.average.householdCentsPerKwh;
}

function dayPrice(
  day: HistoryDayCell,
  basis: HistoryPriceBasis,
): number | null {
  if (!day.average) return null;
  return basis === "raw"
    ? day.average.rawEurPerMwh
    : day.average.householdCentsPerKwh;
}

function unit(basis: HistoryPriceBasis): string {
  return basis === "raw" ? "€/MWh" : "snt/kWh (sis. alv.)";
}

function compactUnit(basis: HistoryPriceBasis): string {
  return basis === "raw" ? "€/MWh" : "snt/kWh";
}

function heatBand(
  value: number | null,
  distribution: PercentileDistribution,
): string {
  if (value === null) return "missing";
  if (distribution.p10 !== null && value <= distribution.p10) return "very-low";
  if (distribution.p25 !== null && value <= distribution.p25) return "low";
  if (distribution.p75 !== null && value < distribution.p75) return "typical";
  if (distribution.p90 !== null && value <= distribution.p90) return "high";
  return "very-high";
}

function selectionIdForDay(
  dateKey: string,
  granularity: HistoryGranularity,
): string {
  if (granularity === "day") return `day:${dateKey}`;
  if (granularity === "week") return `week:${startOfIsoWeek(dateKey)}`;
  return `month:${dateKey.slice(0, 7)}`;
}

function fetchedLabel(fetchedAt: string | null): string {
  if (!fetchedAt) return "ei saatavilla";
  const date = new Date(fetchedAt);
  return Number.isFinite(date.getTime())
    ? fetchedFormatter.format(date)
    : "ei saatavilla";
}

export function HistoryExplorer({ data }: { data: HistoryPageData }) {
  const [granularity, setGranularity] = useState<HistoryGranularity>("day");
  const [basis, setBasis] = useState<HistoryPriceBasis>("household");
  const [selectedIds, setSelectedIds] = useState<
    Record<HistoryGranularity, string | null>
  >(() => ({
    day: data.periods.day.at(-1)?.id ?? null,
    week: data.periods.week.at(-1)?.id ?? null,
    month: data.periods.month.at(-1)?.id ?? null,
  }));
  const periods = data.periods[granularity];
  const selectedId = selectedIds[granularity];
  const selectedIndex = Math.max(
    0,
    periods.findIndex((period) => period.id === selectedId),
  );
  const selected = periods[selectedIndex] ?? null;
  const previous = selected?.previousId
    ? (periods.find((period) => period.id === selected.previousId) ?? null)
    : null;
  const selectedPrice = selected ? priceValue(selected, basis) : null;
  const previousPrice = previous ? priceValue(previous, basis) : null;
  const delta =
    selectedPrice !== null && previousPrice !== null
      ? selectedPrice - previousPrice
      : null;
  const distribution =
    basis === "raw"
      ? data.distributions.day.rawEurPerMwh
      : data.distributions.day.householdCentsPerKwh;

  const heatmapStart = data.days[0]
    ? startOfIsoWeek(data.days[0].dateKey)
    : null;
  const monthMarkers = useMemo(() => {
    if (!heatmapStart) return [];
    const seen = new Set<string>();
    return data.days.flatMap((day) => {
      const monthKey = day.dateKey.slice(0, 7);
      if (seen.has(monthKey)) return [];
      seen.add(monthKey);
      const column =
        Math.floor(
          (dateValue(day.dateKey) - dateValue(heatmapStart)) / (7 * 86400000),
        ) + 2;
      return [{ monthKey, dateKey: day.dateKey, column }];
    });
  }, [data.days, heatmapStart]);

  const chooseGranularity = (next: HistoryGranularity) => {
    setGranularity(next);
    if (!selectedIds[next]) {
      setSelectedIds((current) => ({
        ...current,
        [next]: data.periods[next].at(-1)?.id ?? null,
      }));
    }
  };
  const selectAt = (index: number) => {
    const next = periods[index];
    if (!next) return;
    setSelectedIds((current) => ({ ...current, [granularity]: next.id }));
  };
  const selectDay = (day: HistoryDayCell) => {
    const id = selectionIdForDay(day.dateKey, granularity);
    if (!periods.some((period) => period.id === id)) return;
    setSelectedIds((current) => ({ ...current, [granularity]: id }));
  };

  return (
    <main className="site-shell history-shell min-h-screen text-slate-100">
      <header className="site-header sticky top-0 z-30 border-b border-slate-800/80">
        <div className="site-header__inner mx-auto flex items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="group inline-flex items-center gap-3 rounded-lg"
          >
            <Image
              src="/icon.ico"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg"
              aria-hidden="true"
              unoptimized
            />
            <span className="site-brand-text">
              <span className="block text-sm font-semibold tracking-tight text-white">
                Sähköhetki
              </span>
              <span className="block text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                Pörssisähkön hinta
              </span>
            </span>
          </Link>
          <nav aria-label="Päänavigaatio" className="flex items-center gap-1">
            <Link
              href="/"
              className="site-nav-button inline-flex min-h-9 items-center rounded-xl px-3 text-sm text-slate-300"
            >
              Tänään
            </Link>
            <span
              className="site-nav-button site-nav-button--active inline-flex min-h-9 items-center rounded-xl px-3 text-sm"
              aria-current="page"
            >
              Historia
            </span>
          </nav>
        </div>
      </header>

      <div className="page-content mx-auto space-y-6 px-4 pb-16 pt-7 sm:px-6 lg:px-8">
        <section className="history-intro" aria-labelledby="history-heading">
          <p className="history-eyebrow">Suomen tarjousalue · ENTSO-E</p>
          <h1 id="history-heading">Hintahistoria</h1>
          <p className="history-lead">
            Näe, milloin pörssisähkö poikkesi tavallisesta ja miten valittu
            päivä, viikko tai kuukausi vertautuu edelliseen vastaavaan jaksoon.
          </p>
        </section>

        {data.status === "partial" ? (
          <p className="history-notice" role="status">
            {data.message ?? "Osa historiatiedoista puuttuu."}
          </p>
        ) : null}
        {data.status === "unavailable" ? (
          <section
            className="unavailable-panel rounded-2xl border p-5"
            role="alert"
          >
            <h2 className="font-semibold text-white">
              Hintahistoria ei ole saatavilla
            </h2>
            <p className="mt-2 text-sm leading-6">
              {data.message ?? "Historiatietoja ei voitu hakea juuri nyt."}
            </p>
          </section>
        ) : null}

        {data.status !== "unavailable" && selected ? (
          <>
            <section
              className="history-toolbar glass-panel"
              aria-label="Historianäkymän valinnat"
            >
              <div
                className="history-control"
                role="group"
                aria-label="Jakson pituus"
              >
                {(Object.keys(granularityLabels) as HistoryGranularity[]).map(
                  (option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={granularity === option}
                      className={granularity === option ? "is-active" : ""}
                      onClick={() => chooseGranularity(option)}
                    >
                      {granularityLabels[option]}
                    </button>
                  ),
                )}
              </div>
              <div
                className="history-control"
                role="group"
                aria-label="Hintaperuste"
              >
                <button
                  type="button"
                  aria-pressed={basis === "household"}
                  className={basis === "household" ? "is-active" : ""}
                  onClick={() => setBasis("household")}
                >
                  Kotitalousarvio
                </button>
                <button
                  type="button"
                  aria-pressed={basis === "raw"}
                  className={basis === "raw" ? "is-active" : ""}
                  onClick={() => setBasis("raw")}
                >
                  ENTSO-E-markkinahinta
                </button>
              </div>
              <div className="history-stepper">
                <button
                  type="button"
                  aria-label="Edellinen jakso"
                  disabled={selectedIndex <= 0}
                  onClick={() => selectAt(selectedIndex - 1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="Seuraava jakso"
                  disabled={selectedIndex >= periods.length - 1}
                  onClick={() => selectAt(selectedIndex + 1)}
                >
                  →
                </button>
              </div>
            </section>

            <section
              className="history-summary hero-panel"
              aria-labelledby="history-period-heading"
            >
              <div className="history-summary__primary">
                <p className="history-eyebrow">
                  Valittu {granularityLabels[granularity].toLowerCase()}
                </p>
                <h2 id="history-period-heading">{formatPeriod(selected)}</h2>
                <div className="history-price">
                  <span>{numberFormatter.format(selectedPrice!)}</span>
                  <small>{unit(basis)}</small>
                </div>
                <p
                  className={`history-normality history-normality--${selected.percentileBand[basis]}`}
                >
                  {bandLabels[selected.percentileBand[basis]]} ·{" "}
                  {numberFormatter.format(selected.percentileRank[basis])}.
                  persentiili
                </p>
              </div>
              <div className="history-metrics" aria-label="Jakson tunnusluvut">
                <article>
                  <span>Edellinen jakso</span>
                  <strong>
                    {previousPrice === null
                      ? "—"
                      : numberFormatter.format(previousPrice)}
                  </strong>
                  <small>
                    {previous ? formatPeriod(previous) : "Ei vertailujaksoa"}
                  </small>
                </article>
                <article>
                  <span>Muutos</span>
                  <strong>
                    {delta === null
                      ? "—"
                      : `${delta > 0 ? "+" : ""}${numberFormatter.format(delta)}`}
                  </strong>
                  <small>{compactUnit(basis)}</small>
                </article>
                <article>
                  <span>Negatiivista hintaa</span>
                  <strong>
                    {numberFormatter.format(selected.negativePricePercent)} %
                  </strong>
                  <small>jakson kestosta</small>
                </article>
                <article>
                  <span>Pisin kallis jakso</span>
                  <strong>{selected.longestExpensiveStreakHours} h</strong>
                  <small>yli 14 snt/kWh sis. alv.</small>
                </article>
                <article>
                  <span>Kattavuus</span>
                  <strong>Täydellinen</strong>
                  <small>
                    {numberFormatter.format(selected.expectedMinutes / 60)}{" "}
                    tuntia
                  </small>
                </article>
              </div>
              <div
                className="history-percentile"
                aria-label={`Valittu jakso on ${numberFormatter.format(selected.percentileRank[basis])}. persentiilissä`}
              >
                <span className="history-percentile__track" />
                <span
                  className="history-percentile__marker"
                  style={{
                    left: `${Math.min(100, Math.max(0, selected.percentileRank[basis]))}%`,
                  }}
                />
                <div>
                  <span>P10</span>
                  <span>P25</span>
                  <span>Mediaani</span>
                  <span>P75</span>
                  <span>P90</span>
                </div>
              </div>
            </section>

            <section
              className="history-calendar glass-panel"
              aria-labelledby="heatmap-heading"
            >
              <div className="history-calendar__header">
                <div>
                  <p className="history-eyebrow">Päivittäinen keskihinta</p>
                  <h2 id="heatmap-heading">Vuosi yhdellä silmäyksellä</h2>
                </div>
                <div
                  className="history-legend"
                  aria-label="Hintatasojen selite"
                >
                  <span data-band="very-low">Edullinen</span>
                  <span data-band="typical">Tavanomainen</span>
                  <span data-band="very-high">Kallis</span>
                  <span data-band="missing">Puuttuu</span>
                </div>
              </div>
              <div
                className="history-heatmap-scroll"
                tabIndex={0}
                aria-label="Hintahistorian lämpökartta, vieritä vaakasuunnassa"
              >
                <div
                  className="history-heatmap"
                  style={
                    {
                      "--history-weeks": Math.max(
                        1,
                        Math.ceil(data.days.length / 7) + 2,
                      ),
                    } as CSSProperties
                  }
                >
                  {monthMarkers.map((marker) => (
                    <span
                      key={marker.monthKey}
                      className="history-heatmap__month"
                      style={{ gridColumn: marker.column, gridRow: 1 }}
                    >
                      {monthFormatter.format(
                        new Date(dateValue(marker.dateKey)),
                      )}
                    </span>
                  ))}
                  {["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"].map(
                    (label, index) => (
                      <span
                        key={label}
                        className="history-heatmap__weekday"
                        style={{ gridColumn: 1, gridRow: index + 2 }}
                      >
                        {label}
                      </span>
                    ),
                  )}
                  {data.days.map((day) => {
                    const weekday =
                      (new Date(dateValue(day.dateKey)).getUTCDay() + 6) % 7;
                    const column = heatmapStart
                      ? Math.floor(
                          (dateValue(day.dateKey) - dateValue(heatmapStart)) /
                            (7 * 86400000),
                        ) + 2
                      : 2;
                    const value = dayPrice(day, basis);
                    const label =
                      value === null
                        ? `${formatDate(day.dateKey)}, hintatieto puuttuu`
                        : `${formatDate(day.dateKey)}, ${numberFormatter.format(value)} ${compactUnit(basis)}`;
                    const inSelection =
                      selected &&
                      day.dateKey >= selected.startDateKey &&
                      day.dateKey <= selected.endDateKey;
                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        className={`history-heatmap__cell ${inSelection ? "is-selected" : ""}`}
                        style={{ gridColumn: column, gridRow: weekday + 2 }}
                        data-band={heatBand(value, distribution)}
                        aria-label={label}
                        aria-pressed={inSelection}
                        title={label}
                        disabled={
                          !day.complete ||
                          !data.periods[granularity].some(
                            (period) =>
                              period.id ===
                              selectionIdForDay(day.dateKey, granularity),
                          )
                        }
                        onClick={() => selectDay(day)}
                      />
                    );
                  })}
                </div>
              </div>
            </section>
          </>
        ) : null}

        <footer className="site-footer border-t border-slate-800 pt-6 text-sm leading-7 text-slate-500">
          <p>
            Raaka markkinahinta on ENTSO-E:n julkaisema EUR/MWh-arvo.
            Kotitalousarvio muuntaa sen sentiksi kilowattitunnilta ja lisää 25,5
            % arvonlisäveron; marginaali, siirto ja sähkövero eivät sisälly
            arvioon.
          </p>
          <p>
            Päivitetty {fetchedLabel(data.fetchedAt)} ·{" "}
            <a href={data.source.pricesUrl} target="_blank" rel="noreferrer">
              {data.source.name}
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
