"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FormEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import Image from "next/image";
import { ApplianceCard } from "./appliance-card";
import { ExplanationDialog } from "./explanation-dialog";
import { Icon } from "./ui-icon";
import { PriceChart } from "./price-chart";
import { applyPriceMargin } from "../../lib/price-domain";
import { getHelsinkiDateBounds, getHelsinkiDateKey } from "../../lib/time";
import { PRICE_LEVEL_CUTOFFS, PRICE_SCALE_BOUNDS } from "../../lib/price-types";
import type {
  ExplorerData,
  HorizonPoints,
  PriceLevel,
  PricePoint,
} from "@/lib/price-types";

type PriceMode = "hourly" | "quarterHour";
type Horizon = "today" | "tomorrow";
type DialogName = "formula" | "source" | "settings" | null;

const PRICE_MARGIN_STORAGE_KEY = "sahkohetki.price-margin";

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
  hourly: "Tuntikeskiarvo",
  quarterHour: "15 minuutin tarkkuus",
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

const selectedDateFormatter = new Intl.DateTimeFormat("fi-FI", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  timeZone: "Europe/Helsinki",
});
const QUARTER_HOUR_MILLISECONDS = 15 * 60 * 1000;
const HOUR_MILLISECONDS = 60 * 60 * 1000;

function formatPrice(price: number): string {
  return priceFormatter.format(price);
}

function parsePriceMargin(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;

  const margin = Number(normalized);
  return Number.isFinite(margin) && margin >= 0 ? margin : null;
}

function formatMarginInput(margin: number): string {
  return String(margin);
}

function savePriceMargin(margin: number): void {
  try {
    if (margin === 0) {
      window.localStorage.removeItem(PRICE_MARGIN_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(PRICE_MARGIN_STORAGE_KEY, String(margin));
  } catch {
    // Settings still apply for the current page when storage is unavailable.
  }
}

function formatFetchedAt(fetchedAt: string | null): string {
  if (!fetchedAt) return "ei tiedossa";
  const date = new Date(fetchedAt);
  return Number.isFinite(date.getTime())
    ? fetchedAtFormatter.format(date)
    : "ei tiedossa";
}

function formatSelectedDate(startAt: string): string {
  const date = new Date(startAt);
  return Number.isFinite(date.getTime())
    ? selectedDateFormatter.format(date)
    : "Ei saatavilla";
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

type PriceSummary = {
  minimum: number;
  average: number;
  maximum: number;
};

function getPriceSummary(points: PricePoint[]): PriceSummary | null {
  const prices = points.flatMap((point) =>
    point.available && point.priceCentsPerKwh !== null
      ? [point.priceCentsPerKwh]
      : [],
  );
  if (prices.length === 0) return null;

  return {
    minimum: Math.min(...prices),
    average: prices.reduce((sum, price) => sum + price, 0) / prices.length,
    maximum: Math.max(...prices),
  };
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
  const range =
    PRICE_SCALE_BOUNDS.maximumCents - PRICE_SCALE_BOUNDS.minimumCents;
  return (
    ((selectedPoint.priceCentsPerKwh - PRICE_SCALE_BOUNDS.minimumCents) /
      range) *
    100
  );
}

function isCompletePriceHorizon(
  points: PricePoint[],
  mode: PriceMode,
): boolean {
  if (points.length === 0) return false;

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const firstStartMilliseconds = Date.parse(firstPoint.startAt);
  const lastEndMilliseconds = Date.parse(lastPoint.endAt);
  if (
    !Number.isFinite(firstStartMilliseconds) ||
    !Number.isFinite(lastEndMilliseconds)
  ) {
    return false;
  }

  let dateBounds: { startAt: string; endAt: string };
  try {
    dateBounds = getHelsinkiDateBounds(getHelsinkiDateKey(firstPoint.startAt));
  } catch {
    return false;
  }

  if (
    firstStartMilliseconds !== Date.parse(dateBounds.startAt) ||
    lastEndMilliseconds !== Date.parse(dateBounds.endAt)
  ) {
    return false;
  }

  const intervalMilliseconds =
    mode === "hourly" ? HOUR_MILLISECONDS : QUARTER_HOUR_MILLISECONDS;
  return points.every((point, index) => {
    if (!point.available || point.priceCentsPerKwh === null) return false;

    const startMilliseconds = Date.parse(point.startAt);
    const endMilliseconds = Date.parse(point.endAt);
    if (
      !Number.isFinite(startMilliseconds) ||
      !Number.isFinite(endMilliseconds) ||
      endMilliseconds - startMilliseconds !== intervalMilliseconds
    ) {
      return false;
    }

    if (index === 0) return true;
    return startMilliseconds === Date.parse(points[index - 1].endAt);
  });
}

function getUnavailableMessage(
  data: ExplorerData,
  horizon: Horizon,
  mode: PriceMode,
  activePoints: PricePoint[],
  selectedPoint: PricePoint | null,
): string | null {
  if (data.status === "unavailable") {
    return data.message ?? "Hintatiedot eivät ole saatavilla juuri nyt.";
  }

  if (horizon === "tomorrow" && !isCompletePriceHorizon(activePoints, mode)) {
    return "Huomisen hinnat eivät ole vielä saatavilla. Ne päivittyvät noin klo 15.";
  }
  if (!selectedPoint) return "Valitun aikavälin hintatietoa ei ole saatavilla.";
  return null;
}

export function PriceExplorer({ data }: { data: ExplorerData }) {
  const [mode, setMode] = useState<PriceMode>("hourly");
  const [horizon, setHorizon] = useState<Horizon>("today");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    getInitialSelection(data),
  );
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [openDialog, setOpenDialog] = useState<DialogName>(null);
  const [priceMargin, setPriceMargin] = useState(0);
  const [marginInput, setMarginInput] = useState("0");
  const [marginError, setMarginError] = useState<string | null>(null);
  const coffeeUse = data.uses.find((use) => use.id === "coffee");
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogWasOpenRef = useRef(false);

  const adjustedToday = useMemo<HorizonPoints>(
    () => ({
      hourly: applyPriceMargin(data.today.hourly, priceMargin),
      quarterHour: applyPriceMargin(data.today.quarterHour, priceMargin),
    }),
    [data.today.hourly, data.today.quarterHour, priceMargin],
  );
  const adjustedTomorrow = useMemo<HorizonPoints>(
    () => ({
      hourly: applyPriceMargin(data.tomorrow.hourly, priceMargin),
      quarterHour: applyPriceMargin(data.tomorrow.quarterHour, priceMargin),
    }),
    [data.tomorrow.hourly, data.tomorrow.quarterHour, priceMargin],
  );
  const activeHorizon: HorizonPoints =
    horizon === "today" ? adjustedToday : adjustedTomorrow;
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
  const priceSummary = useMemo(
    () => getPriceSummary(activePoints),
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
    mode,
    activePoints,
    selectedPoint,
  );
  const isTomorrowUnavailable =
    data.status === "ready" &&
    horizon === "tomorrow" &&
    !isCompletePriceHorizon(activePoints, mode);
  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(Date.now());
    updateCurrentTime();
    const intervalId = window.setInterval(updateCurrentTime, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let restoreTimeout: number | undefined;

    try {
      const storedMargin = window.localStorage.getItem(
        PRICE_MARGIN_STORAGE_KEY,
      );
      const parsedMargin =
        storedMargin === null ? null : parsePriceMargin(storedMargin);
      if (parsedMargin !== null) {
        restoreTimeout = window.setTimeout(() => {
          setPriceMargin(parsedMargin);
          setMarginInput(formatMarginInput(parsedMargin));
        }, 0);
      }
    } catch {
      // The default market price remains available when storage is unavailable.
    }

    return () => {
      if (restoreTimeout !== undefined) window.clearTimeout(restoreTimeout);
    };
  }, []);

  const closeDialog = useCallback(() => {
    setOpenDialog(null);
  }, []);

  const applyMargin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedMargin = parsePriceMargin(marginInput);
    if (parsedMargin === null) {
      setMarginError("Anna vähintään nollaa suurempi tai nolla snt/kWh.");
      return;
    }

    setPriceMargin(parsedMargin);
    setMarginInput(formatMarginInput(parsedMargin));
    setMarginError(null);
    savePriceMargin(parsedMargin);
    closeDialog();
  };

  const resetMargin = () => {
    setPriceMargin(0);
    setMarginInput("0");
    setMarginError(null);
    savePriceMargin(0);
    closeDialog();
  };

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
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    if (name === "settings") {
      setMarginInput(formatMarginInput(priceMargin));
      setMarginError(null);
    }
    setOpenDialog(name);
  };

  const changeMode = (nextMode: PriceMode) => {
    const nextPoints = (horizon === "today" ? adjustedToday : adjustedTomorrow)[
      nextMode
    ];
    setMode(nextMode);
    setSelectedId((currentId) => {
      const preferredId =
        nextMode === "hourly" ? data.currentHourId : data.currentQuarterId;
      return getSelectionForPoints(nextPoints, currentId, preferredId);
    });
  };

  const changeHorizon = (nextHorizon: Horizon) => {
    const nextPoints = (nextHorizon === "today"
      ? adjustedToday
      : adjustedTomorrow)[mode];
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
    ? `${isCurrentSelection ? "Nykyinen aikaväli" : "Valittu aikaväli"} ${selectedPoint.label}`
    : "Valittu aikaväli";
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
          aria-label="Tarkastelujakso"
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
                Pörssisähkö arjessa
              </span>
            </span>
          </a>
          <div className="site-header__tools flex min-w-0 items-center gap-1 sm:gap-2">
            <div
              className="current-value flex min-w-0 items-center gap-2"
              aria-label={`${isCurrentSelection ? "Nykyinen" : "Valittu"} ${priceMargin > 0 ? "hinta marginaali mukaan lukien" : "spot-hinta"} ${selectedPrice === null ? "ei saatavilla" : `${formatPrice(selectedPrice)} snt/kWh`}, aikaväli ${selectedPoint?.label ?? "ei saatavilla"}`}
            >
              <span className="current-value__context flex min-w-0 items-baseline gap-2">
                <span className="current-value__label text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-sky-300">
                  {isCurrentSelection ? "Nyt" : "Valittu"}
                </span>
                <span className="current-value__time truncate font-mono text-xs text-slate-300">
                  {selectedPoint?.label ?? "Ei saatavilla"}
                </span>
              </span>
              <span className="current-value__price shrink-0 font-mono text-sm font-semibold text-white">
                {selectedPrice === null ? "—" : formatPrice(selectedPrice)}
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
              <button
                type="button"
                aria-label="Hinta-asetukset"
                aria-describedby={
                  priceMargin > 0 ? "price-margin-status" : undefined
                }
                className={`site-nav-button inline-flex min-h-9 items-center gap-2 rounded-xl px-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 sm:px-3 ${priceMargin > 0 ? "site-nav-button--active" : ""}`}
                onClick={(event) => openExplanation("settings", event)}
              >
                <Icon name="settings" className="h-4 w-4" />
                <span aria-hidden="true" className="hidden sm:inline">
                  Hinta-asetukset
                </span>
                <span className="sr-only sm:hidden">Hinta-asetukset</span>
              </button>
              {priceMargin > 0 ? (
                <span id="price-margin-status" className="sr-only">
                  Marginaali {formatPrice(priceMargin)} snt/kWh käytössä
                </span>
              ) : null}
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
              {selectedPoint ? (
                <time
                  className="price-hero__selected-date mb-2 block font-mono text-xs font-medium tracking-wide text-slate-500"
                  dateTime={selectedPoint.startAt}
                >
                  {formatSelectedDate(selectedPoint.startAt)}
                </time>
              ) : null}
              <div className="price-hero__interval flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <span className="price-hero__clock-dot" aria-hidden="true" />
                <span>Valittu aikaväli:</span>
                {isCurrentSelection ? (
                  <span
                    className="price-hero__current-badge"
                    aria-label="Nykyinen aikaväli"
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
                {priceMargin > 0 ? (
                  <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 font-mono text-xs text-sky-100">
                    + {formatPrice(priceMargin)} snt marginaali
                  </span>
                ) : null}
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
              {priceSummary && !isTomorrowUnavailable ? (
                <div
                  className="price-summary"
                  role="group"
                  aria-label="Hintayhteenveto"
                >
                  <div className="price-summary__item price-summary__item--cheap">
                    <span className="price-summary__label">Halvin</span>
                    <span className="price-summary__value">
                      {formatPrice(priceSummary.minimum)}
                    </span>
                    <span className="price-summary__unit">snt/kWh</span>
                  </div>
                  <div className="price-summary__item price-summary__item--average">
                    <span className="price-summary__label">Keskihinta</span>
                    <span className="price-summary__value">
                      {formatPrice(priceSummary.average)}
                    </span>
                    <span className="price-summary__unit">snt/kWh</span>
                  </div>
                  <div className="price-summary__item price-summary__item--high">
                    <span className="price-summary__label">Kallein</span>
                    <span className="price-summary__value">
                      {formatPrice(priceSummary.maximum)}
                    </span>
                    <span className="price-summary__unit">snt/kWh</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {selectedPoint && spectrumPosition !== null ? (
            <div
              className="spectrum-widget mt-5"
              aria-label="Valitun hinnan sijainti hintatasoasteikolla"
              role="img"
            >
              <div className="spectrum-scale flex items-center justify-between gap-4 text-xs text-slate-500">
                <span className="font-mono font-semibold text-emerald-300">
                  Pienin:{" "}
                  {formatPrice(
                    Math.min(
                      ...availablePoints.map(
                        (point) => point.priceCentsPerKwh!,
                      ),
                    ),
                  )}{" "}
                  snt/kWh
                </span>
                <span className="hidden text-center sm:inline">
                  Sähkön hintahaarukka tarkastelujaksolla
                </span>
                <span className="font-mono font-semibold text-rose-300">
                  Suurin:{" "}
                  {formatPrice(
                    Math.max(
                      ...availablePoints.map(
                        (point) => point.priceCentsPerKwh!,
                      ),
                    ),
                  )}{" "}
                  snt/kWh
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
                <span>
                  ≤ {formatPrice(PRICE_LEVEL_CUTOFFS.cheapMaxCents)} snt/kWh (Edullinen)
                </span>
                <span className="hidden text-center sm:inline">
                  &gt; {formatPrice(PRICE_LEVEL_CUTOFFS.cheapMaxCents)}–≤{" "}
                  {formatPrice(PRICE_LEVEL_CUTOFFS.normalMaxCents)} snt/kWh
                  (Tavanomainen)
                </span>
                <span>
                  &gt; {formatPrice(PRICE_LEVEL_CUTOFFS.normalMaxCents)} snt/kWh
                  (Korkea)
                </span>
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
            currentTime={horizon === "today" ? currentTime : null}
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
                  Yhdeksän arjen sähkönkäyttökohdetta
                </p>
                <h2
                  id="uses-heading"
                  className="mt-2 text-3xl font-semibold tracking-tight text-white"
                >
                  Mitä sähkönkäyttö maksaa?
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-400">
                Arvio perustuu valittuun spot-hintaan
                {priceMargin > 0 ? " ja asetettuun myyjän marginaaliin" : ""}.
                Sähkön siirtomaksut, sähkövero ja perusmaksut eivät sisälly.
                {priceMargin > 0
                  ? ` Marginaali on ${formatPrice(priceMargin)} snt/kWh.`
                  : " Lisää myyjän marginaali hinta-asetuksista, jos haluat sen mukaan arvioon."}
              </p>
            </div>
            <div className="appliance-grid">
              {data.uses.map((use) => {
                const estimate = selectedPoint.estimates?.[use.id];
                return estimate ? (
                  <ApplianceCard
                    key={use.id}
                    use={use}
                    estimate={estimate}
                    costLabel={
                      priceMargin > 0
                        ? "ARVIOITU KUSTANNUS SPOT + MARGINAALI"
                        : undefined
                    }
                  />
                ) : null;
              })}
            </div>
          </section>
        ) : null}

        <footer className="site-footer border-t border-slate-800 pt-6 text-sm leading-7 text-slate-500">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="font-medium text-slate-300">
                Sähköhetki näyttää Pörssisähkö.netin ilmoittaman
                arvonlisäverollisen spot-hinnan
                {priceMargin > 0
                  ? " ja lisää siihen " +
                    formatPrice(priceMargin) +
                    " snt/kWh marginaalin."
                  : "."}
              </p>
              <p>
                Palvelu on suuntaa-antava kustannusarvio, ei tarkka sähkölasku.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <span>
                Tiedot haettu: {formatFetchedAt(data.fetchedAt)}
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
          Arvio perustuu valittuun spot-hintaan ja kunkin ennalta määritellyn
          käyttötavan kulutukseen. Hinta sisältää lähteen ilmoittaman
          arvonlisäveron.
        </p>
        <p className="rounded-2xl border border-sky-300/20 bg-sky-300/10 px-4 py-3 font-mono text-sm text-sky-100">
          kulutus (kWh) × (spot-hinta + marginaali) (snt/kWh) = kustannus (snt)
        </p>
        <p>
          Esimerkiksi kahvinkeittimen vertailukulutus on{" "}
          {coffeeUse
            ? `${consumptionFormatter.format(coffeeUse.consumptionKwh)} kWh`
            : "luettelossa määritelty kulutus"}
          . Laskennassa säilytetään täysi tarkkuus, ja kustannus pyöristetään
          näytettäessä kahteen desimaaliin.
        </p>
        <p>
          Sähkön siirtomaksut, sähkövero ja perusmaksut eivät sisälly tähän
          suuntaa-antavaan energia-arvioon.{" "}
          {priceMargin > 0
            ? "Asetettu " +
              formatPrice(priceMargin) +
              " snt/kWh sähkönmyyjän marginaali on mukana."
            : "Sähkönmyyjän marginaali ei sisälly, ellet lisää sitä hinta-asetuksista."}
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
          Sähköhetki käyttää Pörssisähkö.netin uusimpia Suomen alueen
          spot-hintoja 15 minuutin tarkkuudella.{" "}
          {priceMargin > 0
            ? "Näytettyihin hintoihin on lisätty " +
              formatPrice(priceMargin) +
              " snt/kWh marginaali."
            : "Näytetty hinta on lähteen ilmoittama spot-hinta."} Palvelin
          tarkistaa lähteen tiedot ja muodostaa niiden perusteella näkymään
          tuntikeskiarvot sekä 15 minuutin hinnat.
        </p>
        <p>
          Tiedot haetaan ja säilytetään palvelimella noin 12 tuntia. Sivu ei
          hae hintoja uudelleen selaimessa eikä täydennä puuttuvia hintoja
          vanhoilla arvoilla.
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

      <ExplanationDialog
        id="settings-dialog"
        title="Hinta-asetukset"
        open={openDialog === "settings"}
        onClose={closeDialog}
        dialogRef={dialogRef}
        closeButtonRef={closeButtonRef}
        closeButtonLabel="Sulje hinta-asetukset"
      >
        <form className="space-y-5" onSubmit={applyMargin}>
          <p>
            Lisää sähköyhtiösi snt/kWh-marginaali, niin se lasketaan mukaan
            jokaiseen markkinahintaan ja kustannusarvioon.
          </p>
          <div>
            <label
              htmlFor="price-margin"
              className="text-sm font-semibold text-white"
            >
              Sähköyhtiön marginaali
            </label>
            <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 focus-within:border-sky-300/60 focus-within:ring-2 focus-within:ring-sky-300/20">
              <input
                id="price-margin"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={marginInput}
                aria-describedby={
                  marginError
                    ? "price-margin-help price-margin-error"
                    : "price-margin-help"
                }
                aria-invalid={marginError ? true : undefined}
                className="min-w-0 flex-1 bg-transparent font-mono text-xl text-white outline-none placeholder:text-slate-600"
                onChange={(event) => {
                  setMarginInput(event.target.value);
                  if (marginError) setMarginError(null);
                }}
              />
              <span className="font-mono text-sm text-slate-400">snt/kWh</span>
            </div>
            <p id="price-margin-help" className="mt-2 text-xs leading-5 text-slate-500">
              Käytä desimaalierottimena pilkkua tai pistettä. Nolla palauttaa
              pelkän markkinahinnan.
            </p>
            {marginError ? (
              <p
                id="price-margin-error"
                role="alert"
                className="mt-2 text-sm text-rose-300"
              >
                {marginError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-sky-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            >
              Käytä marginaalia
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
              onClick={resetMargin}
            >
              Palauta spot-hintaan
            </button>
          </div>
        </form>
      </ExplanationDialog>
    </main>
  );
}
