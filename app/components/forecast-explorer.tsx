"use client";

import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Factory,
  House,
  RadioTower,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CurrentElectricityState,
  ElectricityForecastResult,
  ElectricityShortageLevel,
  ForecastInterval,
  ForecastSnapshot,
  PowerMeasurement,
} from "../../lib/forecast-types";
import { ForecastChart } from "./forecast-chart";
import { SiteHeader } from "./site-header";

type ForecastExplorerProps = {
  result: ElectricityForecastResult;
};

const powerFormatter = new Intl.NumberFormat("fi-FI", {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("fi-FI", {
  maximumFractionDigits: 0,
});

const clockFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  hour: "2-digit",
  minute: "2-digit",
});

const weekdayFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  weekday: "short",
});

const dateTimeFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  weekday: "short",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  weekday: "short",
  day: "numeric",
  month: "numeric",
});

function formatPower(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  const number = powerFormatter.format(Math.abs(rounded));
  if (!signed || rounded === 0) return `${number} MW`;
  return `${rounded > 0 ? "+" : "−"}${number} MW`;
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${percentFormatter.format(Math.round(value))} %`;
}

function formatHourRange(point: ForecastInterval): string {
  const start = new Date(point.startAt);
  const end = new Date(point.endAt);
  const weekday = weekdayFormatter.format(start).replace(".", "");
  if (point.label) return `${weekday} ${point.label}`;
  const startHour = clockFormatter.format(start).split(".")[0];
  const endHour = clockFormatter.format(end).split(".")[0];
  return `${weekday} ${startHour}–${endHour}`;
}

function firstSelectedId(snapshot: ForecastSnapshot): string | null {
  const now = Date.parse(snapshot.generatedAt);
  const containing = snapshot.hourly.find(
    (point) =>
      point.available &&
      Date.parse(point.startAt) <= now &&
      now < Date.parse(point.endAt),
  );
  if (containing) return containing.id;

  const future = snapshot.hourly.find(
    (point) => point.available && Date.parse(point.startAt) >= now,
  );
  return future?.id ?? snapshot.hourly.find((point) => point.available)?.id ?? snapshot.hourly[0]?.id ?? null;
}

function shortageCopy(level: ElectricityShortageLevel | null): string {
  switch (level) {
    case "normal":
      return "Normaali";
    case "shortage-possible":
      return "Sähköpula mahdollinen";
    case "high-risk":
      return "Suuri sähköpulariski";
    case "shortage":
      return "Sähköpula";
    default:
      return "Tila ei saatavilla";
  }
}

function summaryFor(point: ForecastInterval | null): {
  title: string;
  detail: string;
} {
  if (
    !point ||
    !point.available ||
    point.domesticBalanceMw === null ||
    point.domesticCoveragePercent === null
  ) {
    return {
      title: "Tunnin tuotanto- tai kulutusennuste puuttuu",
      detail: "Puuttuvaa arvoa ei arvioida tai siirretä toiselta tunnilta.",
    };
  }

  if (point.domesticBalanceMw < 0) {
    return {
      title: `Kotimainen tuotanto kattaa arviolta ${Math.round(
        point.domesticCoveragePercent,
      )} % kulutuksesta`,
      detail: `Arvioitu tuontitarve ${formatPower(
        Math.abs(point.domesticBalanceMw),
      )}`,
    };
  }
  if (point.domesticBalanceMw > 0) {
    return {
      title: `Tuotanto ylittää kotimaisen kulutusennusteen arviolta ${formatPower(
        point.domesticBalanceMw,
      )}`,
      detail: "Laskennallinen kotimainen tuotantoylijäämä",
    };
  }
  return {
    title: "Tuotanto ja kulutus ovat ennusteessa tasapainossa",
    detail: "Laskennallinen kotimainen tasapaino 0 MW",
  };
}

type LedgerItemProps = {
  label: string;
  value: string;
  tone: "production" | "consumption" | "balance" | "neutral" | "wind" | "solar";
};

function LedgerItem({ label, value, tone }: LedgerItemProps) {
  return (
    <div className={`forecast-ledger__item forecast-ledger__item--${tone}`}>
      <span className="forecast-ledger__label">
        <span className="forecast-ledger__dot" aria-hidden="true" />
        {label}
      </span>
      <strong className="forecast-ledger__value">{value}</strong>
    </div>
  );
}

type MiniSeries = {
  path: string;
  firstX: number;
  lastX: number;
};

function miniSegments(
  points: ForecastInterval[],
  valueFor: (point: ForecastInterval) => number | null,
  maximum: number,
): MiniSeries[] {
  const width = 1_000;
  const height = 126;
  const top = 12;
  const bottom = 24;
  const plotHeight = height - top - bottom;
  const x = (index: number) =>
    points.length <= 1 ? width / 2 : (index / (points.length - 1)) * width;
  const y = (value: number) => top + plotHeight - (value / maximum) * plotHeight;
  const segments: MiniSeries[] = [];
  let commands: string[] = [];
  let firstX = 0;
  let lastX = 0;

  const flush = () => {
    if (commands.length > 0) {
      segments.push({ path: commands.join(" "), firstX, lastX });
    }
    commands = [];
  };

  points.forEach((point, index) => {
    const value = valueFor(point);
    if (value === null || !Number.isFinite(value)) {
      flush();
      return;
    }
    const nextX = x(index);
    if (commands.length === 0) firstX = nextX;
    lastX = nextX;
    commands.push(
      `${commands.length === 0 ? "M" : "L"} ${nextX.toFixed(2)} ${y(value).toFixed(2)}`,
    );
  });
  flush();
  return segments;
}

type RenewableChartProps = {
  title: string;
  points: ForecastInterval[];
  forecastKey: "windMw" | "solarMw";
  capacityKey: "windCapacityMw" | "solarCapacityMw";
  tone: "wind" | "solar";
};

function RenewableChart({
  title,
  points,
  forecastKey,
  capacityKey,
  tone,
}: RenewableChartProps) {
  const forecasts = points.flatMap((point) =>
    point[forecastKey] === null ? [] : [point[forecastKey]],
  );
  const capacities = points.flatMap((point) =>
    point[capacityKey] === null ? [] : [point[capacityKey]],
  );
  const maximum = Math.max(1, ...forecasts, ...capacities) * 1.1;
  const forecastSegments = miniSegments(
    points,
    (point) => point[forecastKey],
    maximum,
  );
  const capacitySegments = miniSegments(
    points,
    (point) => point[capacityKey],
    maximum,
  );
  const baseline = 102;

  return (
    <div className={`renewable-chart renewable-chart--${tone}`}>
      <div className="renewable-chart__header">
        <h3>{title}</h3>
        <div className="renewable-chart__legend">
          <span className="renewable-chart__forecast-label">Ennuste</span>
          {capacities.length > 0 ? (
            <span className="renewable-chart__capacity-label">
              Arvioitu kapasiteetti
            </span>
          ) : (
            <span className="renewable-chart__capacity-missing">
              Kapasiteettiarviota ei saatavilla
            </span>
          )}
        </div>
      </div>
      <svg
        viewBox="0 0 1000 126"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title} ja Fingridin ennustemallin kapasiteettiarvio`}
        className="renewable-chart__svg"
      >
        <line x1="0" x2="1000" y1={baseline} y2={baseline} className="renewable-chart__axis" />
        <line x1="0" x2="1000" y1="57" y2="57" className="renewable-chart__grid" />
        {forecastSegments.map((segment, index) => (
          <g key={`forecast-${index}`}>
            <path
              d={`${segment.path} L ${segment.lastX} ${baseline} L ${segment.firstX} ${baseline} Z`}
              className="renewable-chart__area"
            />
            <path d={segment.path} className="renewable-chart__line" />
          </g>
        ))}
        {capacitySegments.map((segment, index) => (
          <path
            key={`capacity-${index}`}
            d={segment.path}
            className="renewable-chart__capacity"
          />
        ))}
      </svg>
    </div>
  );
}

type CurrentCardProps = {
  icon: LucideIcon;
  label: string;
  measurement: PowerMeasurement | null;
};

function CurrentCard({ icon: CardIcon, label, measurement }: CurrentCardProps) {
  return (
    <div className="current-state__card">
      <CardIcon className="current-state__icon" aria-hidden="true" />
      <div>
        <span className="current-state__label">{label}</span>
        <strong className="current-state__value">
          {measurement ? formatPower(measurement.valueMw) : "Ei tuoretta mittausta"}
        </strong>
      </div>
    </div>
  );
}

function CurrentState({ current }: { current: CurrentElectricityState }) {
  const netImportLabel =
    current.netImport && current.netImport.valueMw < 0
      ? "Nettovienti (mitattu)"
      : "Nettotuonti (mitattu)";
  const netImport = current.netImport
    ? { ...current.netImport, valueMw: Math.abs(current.netImport.valueMw) }
    : null;
  const status = shortageCopy(current.shortageStatus?.level ?? null);

  return (
    <section
      className="current-state forecast-panel"
      aria-labelledby="current-state-heading"
      aria-label="Tilanne nyt"
    >
      <h2 id="current-state-heading">Tilanne nyt</h2>
      <div className="current-state__grid">
        <CurrentCard icon={Factory} label="Tuotanto (mitattu)" measurement={current.production} />
        <CurrentCard icon={House} label="Kulutus (mitattu)" measurement={current.consumption} />
        <CurrentCard icon={ArrowLeftRight} label={netImportLabel} measurement={netImport} />
        <div className="current-state__card">
          <RadioTower className="current-state__icon" aria-hidden="true" />
          <div>
            <span className="current-state__label">Virallinen tila</span>
            <strong
              className={`current-state__value current-state__status current-state__status--${current.shortageStatus?.level ?? "unknown"}`}
            >
              {status}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function ForecastTable({ points }: { points: ForecastInterval[] }) {
  return (
    <details className="forecast-table forecast-panel">
      <summary>Näytä ennuste taulukkona</summary>
      <div className="forecast-table__scroller">
        <table>
          <caption>72 tunnin sähköennuste</caption>
          <thead>
            <tr>
              <th scope="col">Aika</th>
              <th scope="col">Tuotanto</th>
              <th scope="col">Kulutus</th>
              <th scope="col">Tasapaino</th>
              <th scope="col">Kattavuus</th>
              <th scope="col">Tuuli</th>
              <th scope="col">Aurinko</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.id}>
                <th scope="row">
                  <time dateTime={point.startAt}>
                    {point.label
                      ? `${dateFormatter.format(new Date(point.startAt))} ${point.label}`
                      : dateTimeFormatter.format(new Date(point.startAt))}
                  </time>
                </th>
                <td>
                  {point.productionMw === null
                    ? "Ei saatavilla"
                    : formatPower(point.productionMw)}
                </td>
                <td>{formatPower(point.consumptionMw)}</td>
                <td>{formatPower(point.domesticBalanceMw, true)}</td>
                <td>{formatPercent(point.domesticCoveragePercent)}</td>
                <td>{formatPower(point.windMw)}</td>
                <td>{formatPower(point.solarMw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function UnavailableForecast({ reason }: { reason: string }) {
  return (
    <main className="site-shell min-h-screen bg-slate-950 text-slate-100">
      <SiteHeader activeRoute="forecast" />
      <div id="main-content" tabIndex={-1} className="page-content mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <p className="forecast-eyebrow">Seuraavat 72 tuntia</p>
        <h1 className="forecast-title">Sähköennuste</h1>
        <section className="forecast-unavailable forecast-panel" role="alert">
          <h2>Sähköennuste ei ole juuri nyt saatavilla</h2>
          <p>
            {reason === "missing-configuration"
              ? "Lisää palvelimelle FINGRID_API_KEY, jotta tuotanto- ja kulutusennuste voidaan hakea."
              : "Fingridin tietoja ei saatu varmennettua. Yritä hetken kuluttua uudelleen."}
          </p>
        </section>
      </div>
    </main>
  );
}

export function ForecastExplorer({ result }: ForecastExplorerProps) {
  if (result.status === "unavailable") {
    return <UnavailableForecast reason={result.reason} />;
  }

  return <ReadyForecast snapshot={result} />;
}

function ReadyForecast({ snapshot }: { snapshot: ForecastSnapshot }) {
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    firstSelectedId(snapshot),
  );
  const [displayedAgeSeconds, setDisplayedAgeSeconds] = useState(
    snapshot.freshness.ageSeconds,
  );

  useEffect(() => {
    const updateAge = () => {
      const fetchedAt = Date.parse(snapshot.freshness.fetchedAt);
      if (!Number.isFinite(fetchedAt)) return;
      setDisplayedAgeSeconds(
        Math.max(0, Math.floor((Date.now() - fetchedAt) / 1_000)),
      );
    };
    const timer = window.setInterval(updateAge, 30_000);
    return () => window.clearInterval(timer);
  }, [snapshot.freshness.fetchedAt]);

  const selectedIndex = Math.max(
    0,
    snapshot.hourly.findIndex((point) => point.id === selectedId),
  );
  const selectedPoint = snapshot.hourly[selectedIndex] ?? null;
  const summary = useMemo(() => summaryFor(selectedPoint), [selectedPoint]);
  const missingHourCount = snapshot.missingIntervals.filter(
    (interval) => interval.granularity === "hour",
  ).length;
  const statusText = shortageCopy(
    snapshot.current.shortageStatus?.level ?? null,
  );
  const isMockData = snapshot.source.name === "Synteettinen esimerkkidata";

  const selectRelative = (offset: number) => {
    const nextIndex = Math.max(
      0,
      Math.min(snapshot.hourly.length - 1, selectedIndex + offset),
    );
    const next = snapshot.hourly[nextIndex];
    if (next) setSelectedId(next.id);
  };

  return (
    <main className="site-shell forecast-page min-h-screen bg-slate-950 text-slate-100">
      <SiteHeader
        activeRoute="forecast"
        context={
          <div className="forecast-header-context">
            <span>
              Päivitetty {clockFormatter.format(new Date(snapshot.freshness.fetchedAt))}
            </span>
            <span
              className={`forecast-system-state forecast-system-state--${snapshot.current.shortageStatus?.level ?? "unknown"}`}
            >
              {statusText}
            </span>
          </div>
        }
      />

      <div
        id="main-content"
        tabIndex={-1}
        className="page-content mx-auto max-w-7xl space-y-5 px-4 pb-12 pt-8 sm:px-6 lg:px-8 lg:pt-10"
      >
        <section className="forecast-hero" aria-labelledby="forecast-heading">
          <p className="forecast-eyebrow">Seuraavat 72 tuntia</p>
          <h1 id="forecast-heading" className="forecast-title">
            Sähköennuste
          </h1>
          <div
            className="forecast-summary"
            data-testid="selected-hour-summary"
            aria-live="polite"
            aria-atomic="true"
          >
            <h2>{summary.title}</h2>
            <p>
              {summary.detail}
              {selectedPoint ? ` · valittu tunti ${formatHourRange(selectedPoint)}` : ""}
            </p>
          </div>
          <div className="forecast-hour-controls" aria-label="Valitun tunnin vaihto">
            <button
              type="button"
              aria-label="Edellinen tunti"
              disabled={selectedIndex <= 0 || snapshot.hourly.length === 0}
              onClick={() => selectRelative(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Seuraava tunti"
              disabled={
                snapshot.hourly.length === 0 ||
                selectedIndex >= snapshot.hourly.length - 1
              }
              onClick={() => selectRelative(1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </section>

        {isMockData ? (
          <div className="forecast-notice forecast-notice--stale" role="status">
            Synteettinen esimerkkidata on käytössä paikallisessa testauksessa.
          </div>
        ) : null}

        {snapshot.freshness.state === "stale" ? (
          <div className="forecast-notice forecast-notice--stale" role="status">
            Näytetään viimeisin onnistunut ennuste ({Math.max(1, Math.round(displayedAgeSeconds / 60))} min vanha), koska Fingridin päivitys ei onnistunut.
          </div>
        ) : null}
        {missingHourCount > 0 ? (
          <div className="forecast-notice forecast-notice--partial" role="status">
            Ennusteessa on {missingHourCount} puuttuvia tuntitietoja. Aukkoja ei ole täytetty arvioilla.
          </div>
        ) : null}

        <section className="forecast-panel forecast-balance" aria-labelledby="balance-heading">
          <div className="forecast-panel__heading">
            <div>
              <p className="forecast-panel__kicker">Kotimainen tasapaino</p>
              <h2 id="balance-heading">Tuotanto ja kulutus</h2>
            </div>
            <span className="forecast-panel__range">72 h · tuntikeskiarvo</span>
          </div>
          <ForecastChart
            points={snapshot.hourly}
            selectedId={selectedId}
            currentTime={snapshot.generatedAt}
            onSelect={setSelectedId}
          />
        </section>

        <section
          className="forecast-ledger forecast-panel"
          data-testid="forecast-ledger"
          aria-label="Valitun tunnin luvut"
        >
          <LedgerItem label="Tuotanto" value={formatPower(selectedPoint?.productionMw ?? null)} tone="production" />
          <LedgerItem label="Kulutus" value={formatPower(selectedPoint?.consumptionMw ?? null)} tone="consumption" />
          <LedgerItem label="Erotus" value={formatPower(selectedPoint?.domesticBalanceMw ?? null, true)} tone="balance" />
          <LedgerItem label="Kattavuus" value={formatPercent(selectedPoint?.domesticCoveragePercent ?? null)} tone="neutral" />
          <LedgerItem label="Tuuli" value={formatPower(selectedPoint?.windMw ?? null)} tone="wind" />
          <LedgerItem label="Aurinko" value={formatPower(selectedPoint?.solarMw ?? null)} tone="solar" />
        </section>

        <section className="forecast-panel renewable-section" aria-labelledby="renewable-heading">
          <div className="forecast-panel__heading renewable-section__heading">
            <div>
              <p className="forecast-panel__kicker">Sääriippuvainen tuotanto</p>
              <h2 id="renewable-heading">Tuuli ja aurinko</h2>
            </div>
            <p className="renewable-section__caveat">
              Kapasiteetti on Fingridin ennustemallin arvio, ei virallinen käytettävissä oleva kapasiteetti.
            </p>
          </div>
          <div className="renewable-section__charts">
            <RenewableChart
              title="Tuuli (MW)"
              points={snapshot.hourly}
              forecastKey="windMw"
              capacityKey="windCapacityMw"
              tone="wind"
            />
            <RenewableChart
              title="Aurinko (MW)"
              points={snapshot.hourly}
              forecastKey="solarMw"
              capacityKey="solarCapacityMw"
              tone="solar"
            />
          </div>
        </section>

        <CurrentState current={snapshot.current} />
        <ForecastTable points={snapshot.hourly} />

        <footer className="forecast-footer">
          <span className="forecast-footer__brand">Sähköhetki</span>
          <span>Sähkön tilanne ihmisen mitassa.</span>
          {isMockData ? (
            <span>Lähde: Synteettinen esimerkkidata</span>
          ) : (
            <a href={snapshot.source.homepageUrl} target="_blank" rel="noreferrer">
              Lähde Fingrid / data.fingrid.fi, CC BY 4.0
            </a>
          )}
        </footer>
      </div>
    </main>
  );
}
