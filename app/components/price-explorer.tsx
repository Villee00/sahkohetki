"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ApplianceCard } from "./appliance-card";
import { ExplanationDialog } from "./explanation-dialog";
import { Icon } from "./icon";
import { PriceChart } from "./price-chart";
import type { ExplorerData, HorizonPoints, PriceLevel, PricePoint } from "@/lib/price-types";

type PriceMode = "hourly" | "quarterHour";
type Horizon = "next24Hours" | "tomorrow";
type DialogName = "formula" | "source" | null;

type LevelCopy = {
  label: string;
  description: string;
  className: string;
};

const levelCopy: Record<PriceLevel, LevelCopy> = {
  cheap: {
    label: "Edullinen",
    description: "Tämä jakso kuuluu aktiivisen näkymän edullisimpaan kolmannekseen.",
    className: "text-emerald-300",
  },
  normal: {
    label: "Tavanomainen",
    description: "Tämä jakso asettuu aktiivisen näkymän keskimmäiseen kolmannekseen.",
    className: "text-amber-200",
  },
  high: {
    label: "Korkea",
    description: "Tämä jakso kuuluu aktiivisen näkymän kalleimpaan kolmannekseen.",
    className: "text-rose-300",
  },
};

const horizonLabels: Record<Horizon, string> = {
  next24Hours: "Seuraavat 24 tuntia",
  tomorrow: "Huomenna",
};

const modeLabels: Record<PriceMode, string> = {
  hourly: "Tunneittain",
  quarterHour: "15 min tarkkuudella",
};

const priceFormatter = new Intl.NumberFormat("fi-FI", {
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
  return Number.isFinite(date.getTime()) ? fetchedAtFormatter.format(date) : "ei tiedossa";
}

function firstAvailable(points: PricePoint[]): PricePoint | undefined {
  return points.find(
    (point) => point.available && point.priceCentsPerKwh !== null,
  );
}

function isAvailablePoint(points: PricePoint[], id: string | null): boolean {
  return id !== null && points.some(
    (point) => point.id === id && point.available && point.priceCentsPerKwh !== null,
  );
}

function getInitialSelection(data: ExplorerData): string | null {
  const hourly = data.next24Hours.hourly;
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

function getSpectrumPosition(points: PricePoint[], selectedPoint: PricePoint | null): number | null {
  if (!selectedPoint || selectedPoint.priceCentsPerKwh === null) return null;
  const prices = points.flatMap((point) =>
    point.available && point.priceCentsPerKwh !== null ? [point.priceCentsPerKwh] : [],
  );
  if (prices.length === 0) return null;
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  if (minimum === maximum) return 50;
  return ((selectedPoint.priceCentsPerKwh - minimum) / (maximum - minimum)) * 100;
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

  const availableCount = activePoints.filter((point) => point.available).length;
  if (horizon === "tomorrow" && availableCount === 0) {
    return "Huomisen hintoja ei ole vielä julkaistu tai niitä ei voitu varmistaa.";
  }
  if (!selectedPoint) return "Valittua hintajaksoa ei ole saatavilla.";
  return null;
}

export function PriceExplorer({ data }: { data: ExplorerData }) {
  const [mode, setMode] = useState<PriceMode>("hourly");
  const [horizon, setHorizon] = useState<Horizon>("next24Hours");
  const [selectedId, setSelectedId] = useState<string | null>(() => getInitialSelection(data));
  const [openDialog, setOpenDialog] = useState<DialogName>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousDialogRef = useRef<DialogName>(null);

  const activeHorizon: HorizonPoints = data[horizon];
  const activePoints = useMemo(
    () => activeHorizon[mode],
    [activeHorizon, mode],
  );
  const selectedPoint = useMemo(
    () => activePoints.find((point) => point.id === selectedId && point.available) ?? null,
    [activePoints, selectedId],
  );
  const availablePoints = useMemo(
    () => activePoints.filter((point) => point.available && point.priceCentsPerKwh !== null),
    [activePoints],
  );
  const cheapestPoint = useMemo(() => findCheapest(activePoints), [activePoints]);
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

  const closeDialog = useCallback(() => {
    setOpenDialog(null);
  }, []);

  useEffect(() => {
    if (!openDialog) {
      if (previousDialogRef.current !== null) openerRef.current?.focus();
      previousDialogRef.current = openDialog;
      return;
    }

    dialogRef.current?.focus();

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
      const preferredId = nextMode === "hourly" ? data.currentHourId : data.currentQuarterId;
      return getSelectionForPoints(nextPoints, currentId, preferredId);
    });
  };

  const changeHorizon = (nextHorizon: Horizon) => {
    const nextPoints = data[nextHorizon][mode];
    setHorizon(nextHorizon);
    setSelectedId((currentId) => getSelectionForPoints(nextPoints, currentId, null));
  };

  const level = selectedPoint?.level ? levelCopy[selectedPoint.level] : null;
  const selectedPrice = selectedPoint?.priceCentsPerKwh ?? null;
  const heading = selectedPoint ? `Valittu jakso ${selectedPoint.label}` : "Valittu jakso";

  return (
    <main className="site-shell min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-4 sm:px-6 lg:px-8">
          <a
            href="#main-content"
            className="group inline-flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-300 text-slate-950">
              <Icon name="spark" className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight text-white">Sahkohetki</span>
              <span className="block text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">Spot-hinta arjessa</span>
            </span>
          </a>
          <nav aria-label="Lisätietoja" className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
              onClick={(event) => openExplanation("formula", event)}
            >
              <Icon name="info" className="h-4 w-4" />
              <span className="hidden sm:inline">Miten laskemme?</span>
              <span className="sr-only sm:hidden">Miten laskemme?</span>
            </button>
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
              onClick={(event) => openExplanation("source", event)}
            >
              <Icon name="source" className="h-4 w-4" />
              <span className="hidden sm:inline">Tietolähde</span>
              <span className="sr-only sm:hidden">Tietolähde</span>
            </button>
          </nav>
        </div>
      </header>

      <div id="main-content" className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        <section aria-labelledby="selected-heading" className="overflow-hidden rounded-3xl border border-slate-700/70 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Sähkön hinta nyt ja pian</p>
              <h1 id="selected-heading" className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
                {heading}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-400">
                Valitse yksi hintajakso, niin sama verollinen spot-hinta näkyy kaikkien arjen käyttöjen kustannusarviona.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-950/45 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Valittu spot-hinta</p>
              <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2">
                <span className="font-mono text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                  {selectedPrice === null ? "—" : formatPrice(selectedPrice)}
                </span>
                <span className="pb-2 font-mono text-sm text-slate-400">snt/kWh · sis. ALV</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                {level ? (
                  <span className={`font-semibold ${level.className}`}>{level.label}</span>
                ) : (
                  <span className="text-slate-400">Hintataso ei ole saatavilla</span>
                )}
                <span className="text-slate-600">•</span>
                <span className="text-slate-400">{horizonLabels[horizon]}</span>
              </div>
              {level ? <p className="mt-3 text-sm leading-6 text-slate-400">{level.description}</p> : null}
            </div>
          </div>

          {selectedPoint && spectrumPosition !== null ? (
            <div className="mt-8" aria-label="Valitun hinnan sijainti aktiivisen näkymän hinnastossa" role="img">
              <div className="flex items-center justify-between gap-4 text-xs text-slate-500">
                <span>Halvin {formatPrice(Math.min(...availablePoints.map((point) => point.priceCentsPerKwh!)))} snt</span>
                <span>Kallein {formatPrice(Math.max(...availablePoints.map((point) => point.priceCentsPerKwh!)))} snt</span>
              </div>
              <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-400">
                <span
                  className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-slate-950 bg-white shadow-lg shadow-white/25"
                  style={{ left: `${Math.min(100, Math.max(0, spectrumPosition))}%` }}
                />
              </div>
              <p className="mt-3 text-center text-xs text-slate-400">Valittu jakso suhteessa aktiivisen näkymän saatavilla oleviin hintoihin</p>
            </div>
          ) : null}
        </section>

        <section aria-label="Näkymän valinta" className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/55 p-4 sm:grid-cols-2 sm:p-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Aikahorisontti</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Aikahorisontti">
              {(Object.keys(horizonLabels) as Horizon[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`min-h-11 rounded-xl px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
                    horizon === option ? "bg-white text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                  aria-pressed={horizon === option}
                  onClick={() => changeHorizon(option)}
                >
                  {horizonLabels[option]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Hintatarkkuus</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Hintatarkkuus">
              {(Object.keys(modeLabels) as PriceMode[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`min-h-11 rounded-xl px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
                    mode === option ? "bg-sky-300 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                  aria-pressed={mode === option}
                  onClick={() => changeMode(option)}
                >
                  {modeLabels[option]}
                </button>
              ))}
            </div>
          </div>
        </section>

        {unavailableMessage ? (
          <section role="status" className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 text-sm leading-7 text-amber-100">
            <div className="flex gap-3">
              <Icon name="info" className="mt-1 h-5 w-5 shrink-0 text-amber-200" />
              <p>{unavailableMessage}</p>
            </div>
          </section>
        ) : null}

        {data.status === "ready" && !(horizon === "tomorrow" && availablePoints.length === 0) ? (
          <PriceChart points={activePoints} selectedId={selectedId} onSelect={setSelectedId} />
        ) : null}

        {selectedPoint && cheapestPoint ? (
          <section aria-labelledby="uses-heading" className="space-y-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Yhdeksän arjen käyttöä</p>
                <h2 id="uses-heading" className="mt-2 text-3xl font-semibold tracking-tight text-white">Mitä käyttö maksaa?</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-400">Arvio käyttää vain valittua spot-energiahintaa. Verkkopalvelu, myyjän marginaali, sähkövero ja perusmaksut eivät sisälly.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.uses.map((use) => {
                const estimate = selectedPoint.estimates?.[use.id];
                return estimate ? (
                  <ApplianceCard key={use.id} use={use} estimate={estimate} cheapestPoint={cheapestPoint} />
                ) : null;
              })}
            </div>
          </section>
        ) : null}

        <footer className="border-t border-slate-800 pt-6 text-sm leading-7 text-slate-500">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="font-medium text-slate-300">Sahkohetki näyttää Pörssisähkö.netin verollisen spot-energiahinnan.</p>
              <p>Palvelu on suuntaa-antava kustannusarvio, ei tarkka sähkölasku.</p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <span>Palvelin haki tiedot: {formatFetchedAt(data.fetchedAt)}</span>
              <a className="inline-flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300" href={data.source.pricesUrl} target="_blank" rel="noreferrer">
                {data.source.name}
                <Icon name="arrow-up-right" className="h-4 w-4" />
              </a>
              <a className="inline-flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300" href={data.source.apiUrl} target="_blank" rel="noreferrer">
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
      >
        <p>
          Arvio käyttää yhtä valittua spot-hintaa koko ennalta määritellylle käytölle. Hinta sisältää lähteen ilmoittaman arvonlisäveron.
        </p>
        <p className="rounded-2xl border border-sky-300/20 bg-sky-300/10 px-4 py-3 font-mono text-sm text-sky-100">
          kulutus (kWh) × spot-hinta (snt/kWh) = kustannus (snt)
        </p>
        <p>
          Esimerkiksi kahvinkeittimen väliaikainen oletus on 0,12 kWh. Näytetty kustannus säilyttää laskennan täyden tarkkuuden ja pyöristää vain esityksen kahteen desimaaliin.
        </p>
        <p>
          Verkkopalvelumaksut, sähkövero, sähkönmyyjän marginaali ja perusmaksut eivät sisälly tähän opetukselliseen energia-arvioon.
        </p>
      </ExplanationDialog>

      <ExplanationDialog
        id="source-dialog"
        title="Mistä hintatiedot tulevat?"
        open={openDialog === "source"}
        onClose={closeDialog}
        dialogRef={dialogRef}
      >
        <p>
          Sahkohetki käyttää Pörssisähkö.netin viimeisimpiä Suomen 15 minuutin spot-hintoja. Palvelin validoi lähteen ja rakentaa tästä näkymään tuntikeskiarvot sekä neljännestuntien tarkat arvot.
        </p>
        <p>
          Tiedot haetaan palvelimella ja niitä säilytetään noin 12 tunnin ajan. Avoin sivu ei hae hintoja uudelleen selaimessa eikä korvaa puuttuvaa hintaa vanhalla arvolla.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <a className="inline-flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300" href={data.source.pricesUrl} target="_blank" rel="noreferrer">
            Pörssisähkö.net
            <Icon name="arrow-up-right" className="h-4 w-4" />
          </a>
          <a className="inline-flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300" href={data.source.apiUrl} target="_blank" rel="noreferrer">
            Rajapinta
            <Icon name="arrow-up-right" className="h-4 w-4" />
          </a>
        </div>
      </ExplanationDialog>
    </main>
  );
}
