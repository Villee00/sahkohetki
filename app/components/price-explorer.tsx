"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ApplianceCard } from "./appliance-card";
import { ExplanationDialog } from "./explanation-dialog";
import { Icon } from "./ui-icon";
import { PriceChart } from "./price-chart";
import type {
  ExplorerData,
  HorizonPoints,
  PriceLevel,
  PricePoint,
} from "@/lib/price-types";

type PriceMode = "hourly" | "quarterHour";
type Horizon = "today" | "tomorrow";
type DialogName = "formula" | "source" | null;

type LevelCopy = {
  label: string;
  className: string;
};

const levelCopy: Record<PriceLevel, LevelCopy> = {
  cheap: {
    label: "Edullinen",
    className: "text-emerald-300",
  },
  normal: {
    label: "Tavanomainen",
    className: "text-amber-200",
  },
  high: {
    label: "Korkea",
    className: "text-rose-300",
  },
};

const horizonLabels: Record<Horizon, string> = {
  today: "Tänään",
  tomorrow: "Huomenna",
};

const modeLabels: Record<PriceMode, string> = {
  hourly: "Tunnittain (h)",
  quarterHour: "15 min tarkkuus",
};

const priceFormatter = new Intl.NumberFormat("fi-FI", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const consumptionFormatter = new Intl.NumberFormat("fi-FI", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const fetchedAtFormatter = new Intl.DateTimeFormat("fi-FI", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Helsinki",
});

function formatPrice(price: number): string {
  return priceFormatter.format(price);
}

function formatFetchedAt(fetchedAt: string | null): string {
  if (!fetchedAt) return "ei tiedossa";
  const date = new Date(fetchedAt);
  return Number.isFinite(date.getTime())
    ? fetchedAtFormatter.format(date)
    : "ei tiedossa";
}

function getCurrentPoint(data: ExplorerData): PricePoint | undefined {
  if (data.currentHourId === null) return undefined;
  return data.today.hourly.find((point) => point.id === data.currentHourId);
}

function firstAvailable(points: PricePoint[]): PricePoint | undefined {
  return points.find(
    (point) => point.available && point.priceCentsPerKwh !== null,
  );
}

function isAvailablePoint(points: PricePoint[], id: string | null): boolean {
  return (
    id !== null &&
    points.some(
      (point) =>
        point.id === id && point.available && point.priceCentsPerKwh !== null,
    )
  );
}

function getInitialSelection(data: ExplorerData): string | null {
  const hourly = data.today.hourly;
  if (isAvailablePoint(hourly, data.currentHourId)) return data.currentHourId;
  return firstAvailable(hourly)?.id ?? null;
}

function getSelectionForPoints(
  points: PricePoint[],
  currentId: string | null,
  preferredId: string | null,
): string | null {
  if (isAvailablePoint(points, currentId)) return currentId;
  if (isAvailablePoint(points, preferredId)) return preferredId;
  return firstAvailable(points)?.id ?? null;
}

function findCheapest(points: PricePoint[]): PricePoint | undefined {
  return points.reduce<PricePoint | undefined>((cheapest, point) => {
    if (!point.available || point.priceCentsPerKwh === null) return cheapest;
    if (
      cheapest === undefined ||
      cheapest.priceCentsPerKwh === null ||
      point.priceCentsPerKwh < cheapest.priceCentsPerKwh
    ) {
      return point;
    }
    return cheapest;
  }, undefined);
}

function getSpectrumPosition(
  points: PricePoint[],
  selectedPoint: PricePoint | null,
): number | null {
  if (!selectedPoint || selectedPoint.priceCentsPerKwh === null) return null;
  const prices = points.flatMap((point) =>
    point.available && point.priceCentsPerKwh !== null
      ? [point.priceCentsPerKwh]
      : [],
  );
  if (prices.length === 0) return null;
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  if (minimum === maximum) return 50;
  return (
    ((selectedPoint.priceCentsPerKwh - minimum) / (maximum - minimum)) * 100
  );
}

function isCompletePriceHorizon(points: PricePoint[]): boolean {
  return (
    points.length > 0 &&
    points.every((point) => point.available && point.priceCentsPerKwh !== null)
  );
}

function getUnavailableMessage(
  data: ExplorerData,
  horizon: Horizon,
  activePoints: PricePoint[],
  selectedPoint: PricePoint | null,
): string | null {
  if (data.status === "unavailable") {
    return data.message ?? "Hintatiedot eivät ole saatavilla juuri nyt.";
  }

  if (horizon === "tomorrow" && !isCompletePriceHorizon(activePoints)) {
    return "Huomisen hinnat eivät ole vielä saatavilla, mutta ne päivitetään noin klo 15.00.";
  }
  if (!selectedPoint) return "Valittua hintajaksoa ei ole saatavilla.";
  return null;
}

export function PriceExplorer({ data }: { data: ExplorerData }) {
  const [mode, setMode] = useState<PriceMode>("hourly");
  const [horizon, setHorizon] = useState<Horizon>("today");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    getInitialSelection(data),
  );
  const [openDialog, setOpenDialog] = useState<DialogName>(null);
  const coffeeUse = data.uses.find((use) => use.id === "coffee");
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogWasOpenRef = useRef(false);

  const activeHorizon: HorizonPoints = data[horizon];
  const activePoints = useMemo(
    () => activeHorizon[mode],
    [activeHorizon, mode],
  );
  const selectedPoint = useMemo(
    () =>
      activePoints.find(
        (point) => point.id === selectedId && point.available,
      ) ?? null,
    [activePoints, selectedId],
  );
  const availablePoints = useMemo(
    () =>
      activePoints.filter(
        (point) => point.available && point.priceCentsPerKwh !== null,
      ),
    [activePoints],
  );
  const cheapestPoint = useMemo(
    () => findCheapest(activePoints),
    [activePoints],
  );
  const spectrumPosition = useMemo(
    () => getSpectrumPosition(activePoints, selectedPoint),
    [activePoints, selectedPoint],
  );
  const unavailableMessage = getUnavailableMessage(
    data,
    horizon,
    activePoints,
    selectedPoint,
  );
  const isTomorrowUnavailable =
    data.status === "ready" &&
    horizon === "tomorrow" &&
    !isCompletePriceHorizon(activePoints);
  const currentPoint = getCurrentPoint(data);
  const currentPrice =
    currentPoint?.available && currentPoint.priceCentsPerKwh !== null
      ? currentPoint.priceCentsPerKwh
      : null;

  const closeDialog = useCallback(() => {
    setOpenDialog(null);
  }, []);

  useEffect(() => {
    if (!openDialog) {
      if (dialogWasOpenRef.current) {
        openerRef.current?.focus();
        dialogWasOpenRef.current = false;
      }
      return;
    }

    dialogWasOpenRef.current = true;
    closeButtonRef.current?.focus();
    if (!closeButtonRef.current) dialogRef.current?.focus();

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => document.removeEventListener("keydown", handleDialogKeyDown);
  }, [closeDialog, openDialog]);

  const openExplanation = (
    name: Exclude<DialogName, null>,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    openerRef.current = event.currentTarget;
    setOpenDialog(name);
  };

  const changeMode = (nextMode: PriceMode) => {
    const nextPoints = data[horizon][nextMode];
    setMode(nextMode);
    setSelectedId((currentId) => {
      const preferredId =
        nextMode === "hourly" ? data.currentHourId : data.currentQuarterId;
      return getSelectionForPoints(nextPoints, currentId, preferredId);
    });
  };

  const changeHorizon = (nextHorizon: Horizon) => {
    const nextPoints = data[nextHorizon][mode];
    setHorizon(nextHorizon);
    setSelectedId((currentId) =>
      getSelectionForPoints(nextPoints, currentId, null),
    );
  };

  const level = selectedPoint?.level ? levelCopy[selectedPoint.level] : null;
  const selectedPrice = selectedPoint?.priceCentsPerKwh ?? null;
  const currentSelectionId =
    mode === "hourly" ? data.currentHourId : data.currentQuarterId;
  const isCurrentSelection =
    horizon === "today" && selectedPoint?.id === currentSelectionId;
  const heading = selectedPoint
    ? `${isCurrentSelection ? "Nykyinen aikaväli" : "Valittu jakso"} ${selectedPoint.label}`
    : "Valittu jakso";
  const viewControls = (
    <div className="price-chart__controls">
      <div className="view-control-group">
        <div
          className="view-control-options"
          role="group"
          aria-label="Hintatarkkuus"
        >
          {(Object.keys(modeLabels) as PriceMode[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`view-toggle min-h-11 rounded-xl px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
                mode === option ? "view-toggle--active" : ""
              }`}
              aria-pressed={mode === option}
              onClick={() => changeMode(option)}
            >
              {modeLabels[option]}
            </button>
          ))}
        </div>
      </div>
      <div className="view-control-group">
        <div
          className="view-control-options"
          role="group"
          aria-label="Aikahorisontti"
        >
          {(Object.keys(horizonLabels) as Horizon[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`view-toggle min-h-11 rounded-xl px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
                horizon === option
                  ? "view-toggle--active view-toggle--horizon"
                  : ""
              }`}
              aria-pressed={horizon === option}
              onClick={() => changeHorizon(option)}
            >
              {horizonLabels[option]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <main className="site-shell min-h-screen bg-slate-950 text-slate-100">
      <header className="site-header sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
        <div className="site-header__inner mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:gap-5 sm:px-6 lg:px-8">
          <a
            href="#main-content"
            className="group inline-flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
          >
            <span className="brand-mark inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-300 text-slate-950">
              <Icon name="spark" className="h-4 w-4" />
            </span>
            <span className="site-brand-text">
              <span className="block text-sm font-semibold tracking-tight text-white">
                Sähköhetki
              </span>
              <span className="block text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                Spot-hinta arjessa
              </span>
            </span>
          </a>
          <div className="site-header__tools flex min-w-0 items-center gap-1 sm:gap-2">
            <div
              className="current-value flex min-w-0 items-center gap-2"
              aria-label={`Nykyinen spot-hinta ${currentPrice === null ? "ei saatavilla" : `${formatPrice(currentPrice)} snt/kWh`}, aikaväli ${currentPoint?.label ?? "ei saatavilla"}`}
            >
              <span className="current-value__context flex min-w-0 items-baseline gap-2">
                <span className="current-value__label text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-sky-300">
                  Nyt
                </span>
                <span className="current-value__time truncate font-mono text-xs text-slate-300">
                  {currentPoint?.label ?? "Ei saatavilla"}
                </span>
              </span>
              <span className="current-value__price shrink-0 font-mono text-sm font-semibold text-white">
                {currentPrice === null ? "—" : formatPrice(currentPrice)}
              </span>
              <span className="current-value__unit shrink-0 text-[0.65rem] text-slate-500">
                snt/kWh
              </span>
            </div>
            <nav
              aria-label="Lisätietoja"
              className="flex items-center gap-0.5 sm:gap-1"
            >
              <button
                type="button"
                aria-label="Miten laskemme?"
                className="site-nav-button inline-flex min-h-9 items-center gap-2 rounded-xl px-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 sm:px-3"
                onClick={(event) => openExplanation("formula", event)}
              >
                <Icon name="info" className="h-4 w-4" />
                <span aria-hidden="true" className="hidden sm:inline">
                  Miten laskemme?
                </span>
                <span className="sr-only sm:hidden">Miten laskemme?</span>
              </button>
              <button
                type="button"
                aria-label="Tietolähde"
                className="site-nav-button inline-flex min-h-9 items-center gap-2 rounded-xl px-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 sm:px-3"
                onClick={(event) => openExplanation("source", event)}
              >
                <Icon name="source" className="h-4 w-4" />
                <span aria-hidden="true" className="hidden sm:inline">
                  Tietolähde
                </span>
                <span className="sr-only sm:hidden">Tietolähde</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      <div
        id="main-content"
        className="page-content mx-auto max-w-7xl space-y-7 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8"
      >
        <section
          aria-labelledby="selected-heading"
          className="hero-panel overflow-hidden rounded-3xl border border-slate-700/70 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/30 sm:p-6"
        >
          <h1 id="selected-heading" className="sr-only">
            {heading}
          </h1>
          <div className="price-hero__top flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <div className="price-hero__interval flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <span className="price-hero__clock-dot" aria-hidden="true" />
                <span>Valittu aikaväli:</span>
                {isCurrentSelection ? (
                  <span
                    className="price-hero__current-badge"
                    aria-label="Nykyinen aika"
                  >
                    Nyt
                  </span>
                ) : null}
                <span className="price-hero__interval-value rounded-lg border border-slate-700 bg-slate-950/55 px-2 py-1 font-mono text-slate-200">
                  {selectedPoint?.label ?? "Ei saatavilla"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="hero-price font-mono text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                  {selectedPrice === null ? "—" : formatPrice(selectedPrice)}
                </span>
                <span className="font-mono text-base text-slate-400">
                  snt / kWh
                </span>
                <span className="font-mono text-xs text-slate-500">
                  (sis. ALV)
                </span>
              </div>
            </div>

            <div className="price-hero__actions flex flex-wrap items-center justify-start gap-3 lg:justify-end">
              {level ? (
                <span
                  className={`level-badge level-badge--${selectedPoint?.level ?? "unavailable"} ${level.className}`}
                >
                  {level.label} hinta
                </span>
              ) : (
                <span className="level-badge level-badge--unavailable">
                  Hintataso ei ole saatavilla
                </span>
              )}
              {cheapestPoint ? (
                <button
                  type="button"
                  className="cheapest-jump inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-left text-sm transition hover:border-emerald-200/60 hover:bg-emerald-300/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200"
                  aria-label={`Halvin saatavilla oleva jakso ${cheapestPoint.label}`}
                  aria-pressed={selectedPoint?.id === cheapestPoint.id}
                  onClick={() => setSelectedId(cheapestPoint.id)}
                >
                  <span className="price-hero__pig-dot" aria-hidden="true">
                    ✦
                  </span>
                  <span className="text-emerald-100">Halvin hetki:</span>
                  <span className="font-mono font-semibold text-emerald-200">
                    {cheapestPoint.label}
                  </span>
                </button>
              ) : null}
            </div>
          </div>

          {selectedPoint && spectrumPosition !== null ? (
            <div
              className="spectrum-widget mt-5"
              aria-label="Valitun hinnan sijainti aktiivisen näkymän hinnastossa"
              role="img"
            >
              <div className="spectrum-scale flex items-center justify-between gap-4 text-xs text-slate-500">
                <span className="font-mono font-semibold text-emerald-300">
                  Min:{" "}
                  {formatPrice(
                    Math.min(
                      ...availablePoints.map(
                        (point) => point.priceCentsPerKwh!,
                      ),
                    ),
                  )}{" "}
                  snt
                </span>
                <span className="hidden text-center sm:inline">
                  Sähkön hintahaarukka tarkastelujaksolla
                </span>
                <span className="font-mono font-semibold text-rose-300">
                  Max:{" "}
                  {formatPrice(
                    Math.max(
                      ...availablePoints.map(
                        (point) => point.priceCentsPerKwh!,
                      ),
                    ),
                  )}{" "}
                  snt
                </span>
              </div>
              <div className="spectrum-track relative mt-3 h-2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-400">
                <span
                  className="spectrum-marker absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-slate-950 bg-white shadow-lg shadow-white/25"
                  style={{
                    left: `${Math.min(100, Math.max(0, spectrumPosition))}%`,
                  }}
                >
                  <span aria-hidden="true" className="spectrum-marker__tick" />
                </span>
              </div>
              <div className="spectrum-labels mt-3 flex justify-between gap-3 text-[0.68rem] text-slate-500">
                <span>&lt; 5,00 snt (Halpa)</span>
                <span className="hidden text-center sm:inline">
                  5,00–14,00 snt (Normaali)
                </span>
                <span>&gt; 14,00 snt (Kallis)</span>
              </div>
            </div>
          ) : null}
        </section>

        {unavailableMessage && !isTomorrowUnavailable ? (
          <section
            role="status"
            className="unavailable-panel rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 text-sm leading-7 text-amber-100"
          >
            <div className="flex gap-3">
              <Icon
                name="info"
                className="mt-1 h-5 w-5 shrink-0 text-amber-200"
              />
              <p>{unavailableMessage}</p>
            </div>
          </section>
        ) : null}

        {data.status === "ready" ? (
          <PriceChart
            points={isTomorrowUnavailable ? [] : activePoints}
            selectedId={selectedId}
            onSelect={setSelectedId}
            headerContent={viewControls}
            emptyMessage={
              isTomorrowUnavailable
                ? (unavailableMessage ?? undefined)
                : undefined
            }
          />
        ) : null}

        {selectedPoint && cheapestPoint ? (
          <section
            aria-labelledby="uses-heading"
            className="uses-section space-y-5"
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
                  Yhdeksän arjen käyttöä
                </p>
                <h2
                  id="uses-heading"
                  className="mt-2 text-3xl font-semibold tracking-tight text-white"
                >
                  Mitä käyttö maksaa?
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-400">
                Arvio käyttää vain valittua spot-energiahintaa. Verkkopalvelu,
                myyjän marginaali, sähkövero ja perusmaksut eivät sisälly.
              </p>
            </div>
            <div className="appliance-grid">
              {data.uses.map((use) => {
                const estimate = selectedPoint.estimates?.[use.id];
                return estimate ? (
                  <ApplianceCard key={use.id} use={use} estimate={estimate} />
                ) : null;
              })}
            </div>
          </section>
        ) : null}

        <footer className="site-footer border-t border-slate-800 pt-6 text-sm leading-7 text-slate-500">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="font-medium text-slate-300">
                Sähköhetki näyttää Pörssisähkö.netin verollisen
                spot-energiahinnan.
              </p>
              <p>
                Palvelu on suuntaa-antava kustannusarvio, ei tarkka sähkölasku.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <span>
                Palvelin haki tiedot: {formatFetchedAt(data.fetchedAt)}
              </span>
              <a
                className="inline-flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                href={data.source.pricesUrl}
                target="_blank"
                rel="noreferrer"
              >
                {data.source.name}
                <Icon name="arrow-up-right" className="h-4 w-4" />
              </a>
              <a
                className="inline-flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                href={data.source.documentationUrl}
                target="_blank"
                rel="noreferrer"
              >
                API-dokumentaatio
                <Icon name="arrow-up-right" className="h-4 w-4" />
              </a>
            </div>
          </div>
        </footer>
      </div>

      <ExplanationDialog
        id="formula-dialog"
        title="Miten kustannusarvio lasketaan?"
        open={openDialog === "formula"}
        onClose={closeDialog}
        dialogRef={dialogRef}
        closeButtonRef={closeButtonRef}
      >
        <p>
          Arvio käyttää yhtä valittua spot-hintaa koko ennalta määritellylle
          käytölle. Hinta sisältää lähteen ilmoittaman arvonlisäveron.
        </p>
        <p className="rounded-2xl border border-sky-300/20 bg-sky-300/10 px-4 py-3 font-mono text-sm text-sky-100">
          kulutus (kWh) × spot-hinta (snt/kWh) = kustannus (snt)
        </p>
        <p>
          Esimerkiksi kahvinkeittimen tutkittu vertailuarvo on{" "}
          {coffeeUse
            ? `${consumptionFormatter.format(coffeeUse.consumptionKwh)} kWh`
            : "katalogissa määritelty kulutus"}
          . Näytetty kustannus säilyttää laskennan täyden tarkkuuden ja
          pyöristää vain esityksen kahteen desimaaliin.
        </p>
        <p>
          Verkkopalvelumaksut, sähkövero, sähkönmyyjän marginaali ja perusmaksut
          eivät sisälly tähän opetukselliseen energia-arvioon.
        </p>
      </ExplanationDialog>

      <ExplanationDialog
        id="source-dialog"
        title="Mistä hintatiedot tulevat?"
        open={openDialog === "source"}
        onClose={closeDialog}
        dialogRef={dialogRef}
        closeButtonRef={closeButtonRef}
      >
        <p>
          Sähköhetki käyttää Pörssisähkö.netin viimeisimpiä Suomen 15 minuutin
          spot-hintoja. Palvelin validoi lähteen ja rakentaa tästä näkymään
          tuntikeskiarvot sekä neljännestuntien tarkat arvot.
        </p>
        <p>
          Tiedot haetaan palvelimella ja niitä säilytetään noin 12 tunnin ajan.
          Avoin sivu ei hae hintoja uudelleen selaimessa eikä korvaa puuttuvaa
          hintaa vanhalla arvolla.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <a
            className="inline-flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            href={data.source.pricesUrl}
            target="_blank"
            rel="noreferrer"
          >
            Pörssisähkö.net
            <Icon name="arrow-up-right" className="h-4 w-4" />
          </a>
          <a
            className="inline-flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            href={data.source.documentationUrl}
            target="_blank"
            rel="noreferrer"
          >
            API-dokumentaatio
            <Icon name="arrow-up-right" className="h-4 w-4" />
          </a>
          <a
            className="inline-flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            href={data.source.apiUrl}
            target="_blank"
            rel="noreferrer"
          >
            Raakadata (JSON)
            <Icon name="arrow-up-right" className="h-4 w-4" />
          </a>
        </div>
      </ExplanationDialog>
    </main>
  );
}
