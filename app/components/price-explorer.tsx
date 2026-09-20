"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import { ArrowUpRight, FileText, Info, Settings } from "lucide-react";
import { ApplianceCard } from "./appliance-card";
import { ExplanationDialog } from "./explanation-dialog";
import { Icon } from "./ui-icon";
import { PriceChart } from "./price-chart";
import { TransferCostPanel } from "./transfer-cost-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  applyPriceMargin,
  calculateUseCostWithTransfer,
} from "../../lib/price-domain";
import { getHelsinkiDateBounds, getHelsinkiDateKey } from "../../lib/time";
import { PRICE_LEVEL_CUTOFFS, PRICE_SCALE_BOUNDS } from "../../lib/price-types";
import type { EverydayUse } from "@/lib/appliances";
import type {
  CostEstimate,
  ExplorerData,
  HorizonPoints,
  MunicipalityTransfer,
  PriceLevel,
  PricePoint,
  TransferTariff,
} from "@/lib/price-types";

type PriceMode = "hourly" | "quarterHour";
type Horizon = "today" | "tomorrow";
type DialogName = "formula" | "source" | "settings" | null;
type LocationStatus = "idle" | "locating" | "success" | "error";

const PRICE_MARGIN_STORAGE_KEY = "sahkohetki.price-margin";
const TRANSFER_SELECTION_STORAGE_KEY = "sahkohetki.transfer-selection";

type LevelCopy = {
  label: string;
};

const levelCopy: Record<PriceLevel, LevelCopy> = {
  cheap: {
    label: "Edullinen",
  },
  normal: {
    label: "Normaali",
  },
  high: {
    label: "Korkea",
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

function isMunicipalityLocationResponse(
  value: unknown,
): value is { municipalityCode: string; municipalityName: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { municipalityCode?: unknown }).municipalityCode ===
      "string" &&
    typeof (value as { municipalityName?: unknown }).municipalityName ===
      "string"
  );
}

function getLocationResponseMessage(value: unknown): string | null {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as { message?: unknown }).message === "string"
    ? (value as { message: string }).message
    : null;
}

function getTransferUseEstimate(
  use: EverydayUse,
  point: PricePoint | null,
  tariff: TransferTariff | null,
  electricityTaxCentsPerKwh: number,
): CostEstimate | null {
  if (
    !point ||
    !point.available ||
    point.priceCentsPerKwh === null
  ) {
    return null;
  }

  if (!tariff) return point.estimates?.[use.id] ?? null;
  if (!tariff.priceAvailable || tariff.energyChargeCentsPerKwh === null) {
    return null;
  }

  const estimate = calculateUseCostWithTransfer(
    use.consumptionKwh,
    point.priceCentsPerKwh,
    tariff.energyChargeCentsPerKwh,
    electricityTaxCentsPerKwh,
  );
  const comparison = point.estimates?.[use.id]?.comparison;
  return comparison ? { ...estimate, comparison } : estimate;
}

function parseSavedTransferSelection(
  value: string | null,
): { municipalityCode: string; operatorId: string } | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { municipalityCode?: unknown }).municipalityCode !==
        "string" ||
      typeof (parsed as { operatorId?: unknown }).operatorId !== "string"
    ) {
      return null;
    }
    return {
      municipalityCode: (parsed as { municipalityCode: string }).municipalityCode,
      operatorId: (parsed as { operatorId: string }).operatorId,
    };
  } catch {
    return null;
  }
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
  const [selectedMunicipalityCode, setSelectedMunicipalityCode] = useState("");
  const [selectedOperatorId, setSelectedOperatorId] = useState("");
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const coffeeUse = data.uses.find((use) => use.id === "coffee");
  const transferData = data.transferData;
  const selectedMunicipality = useMemo<MunicipalityTransfer | null>(
    () =>
      transferData.municipalities.find(
        (municipality) =>
          municipality.municipalityCode === selectedMunicipalityCode,
      ) ?? null,
    [selectedMunicipalityCode, transferData.municipalities],
  );
  const selectedTransferTariff = useMemo<TransferTariff | null>(
    () =>
      selectedMunicipality?.operators.find(
        (operator) => operator.id === selectedOperatorId,
      ) ?? null,
    [selectedMunicipality, selectedOperatorId],
  );

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

  useEffect(() => {
    let restoreTimeout: number | undefined;

    try {
      const saved = parseSavedTransferSelection(
        window.localStorage.getItem(TRANSFER_SELECTION_STORAGE_KEY),
      );
      if (!saved) return;

      const municipality = transferData.municipalities.find(
        (candidate) => candidate.municipalityCode === saved.municipalityCode,
      );
      if (!municipality) return;

      const savedOperator = municipality.operators.find(
        (operator) => operator.id === saved.operatorId,
      );
      const operatorId =
        savedOperator?.id ??
        (municipality.operators.length === 1
          ? municipality.operators[0].id
          : "");
      restoreTimeout = window.setTimeout(() => {
        setSelectedMunicipalityCode(municipality.municipalityCode);
        setSelectedOperatorId(operatorId);
      }, 0);
    } catch {
      // The selectors remain empty when browser storage is unavailable.
    }

    return () => {
      if (restoreTimeout !== undefined) window.clearTimeout(restoreTimeout);
    };
  }, [transferData.municipalities]);

  useEffect(() => {
    if (!selectedMunicipalityCode) return;
    try {
      window.localStorage.setItem(
        TRANSFER_SELECTION_STORAGE_KEY,
        JSON.stringify({
          municipalityCode: selectedMunicipalityCode,
          operatorId: selectedOperatorId,
        }),
      );
    } catch {
      // Selection still applies for the current page when storage is unavailable.
    }
  }, [selectedMunicipalityCode, selectedOperatorId]);

  const changeMunicipality = (municipalityCode: string) => {
    const municipality = transferData.municipalities.find(
      (candidate) => candidate.municipalityCode === municipalityCode,
    );
    setSelectedMunicipalityCode(municipalityCode);
    setSelectedOperatorId(
      municipality?.operators.length === 1
        ? municipality.operators[0].id
        : "",
    );
  };

  const changeOperator = (operatorId: string) => {
    setSelectedOperatorId(operatorId);
  };

  const locateMunicipality = () => {
    setLocationMessage(null);

    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationMessage("Selain ei tue sijainnin hakua.");
      return;
    }

    setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          try {
            const response = await fetch("/api/municipality-by-location", {
              method: "POST",
              headers: {
                accept: "application/json",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              }),
              cache: "no-store",
            });
            const payload: unknown = await response.json().catch(() => null);

            if (!response.ok) {
              setLocationStatus("error");
              setLocationMessage(
                getLocationResponseMessage(payload) ??
                  "Sijaintikuntaa ei voitu selvittää.",
              );
              return;
            }
            if (!isMunicipalityLocationResponse(payload)) {
              setLocationStatus("error");
              setLocationMessage("Sijaintikuntaa ei voitu selvittää.");
              return;
            }

            changeMunicipality(payload.municipalityCode);
            setLocationStatus("success");
            setLocationMessage(
              `Kunta valittu sijainnin perusteella: ${payload.municipalityName}.`,
            );
          } catch {
            setLocationStatus("error");
            setLocationMessage(
              "Sijaintia ei voitu selvittää juuri nyt. Yritä uudelleen.",
            );
          }
        })();
      },
      (error) => {
        setLocationStatus("error");
        setLocationMessage(
          error.code === 1
            ? "Sijainnin käyttö estettiin. Salli paikannus selaimen asetuksissa."
            : error.code === 2
              ? "Sijaintia ei voitu määrittää."
              : error.code === 3
                ? "Sijainnin haku aikakatkaistiin. Yritä uudelleen."
                : "Sijaintia ei voitu hakea.",
        );
      },
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 10 * 1000,
      },
    );
  };

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

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) closeDialog();
    },
    [closeDialog],
  );

  const openExplanation = (
    name: Exclude<DialogName, null>,
  ) => {
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
    const nextPoints = (
      nextHorizon === "today" ? adjustedToday : adjustedTomorrow
    )[mode];
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
  const useCostEmptyMessage = !selectedMunicipality
    ? "Valitse kunta ja verkkoyhtiö"
    : !selectedOperatorId
      ? "Valitse verkkoyhtiö"
      : !selectedTransferTariff?.priceAvailable
        ? "Siirtohinta ei ole saatavilla"
        : "Valitse saatavilla oleva aikaväli";
  const useCostLabel = selectedTransferTariff
    ? "ARVIOITU KUSTANNUS SÄHKÖ + SIIRTO + VERO"
    : "ARVIOITU KUSTANNUS SPOT-HINNALLA";
  const viewControls = (
    <div className="price-chart__controls">
      <div className="view-control-group">
        <ToggleGroup
          aria-label="Hintatarkkuus"
          className="view-control-options"
          value={[mode]}
          onValueChange={(values) => {
            const nextMode = values[0] as PriceMode | undefined;
            if (nextMode) changeMode(nextMode);
          }}
        >
          {(Object.keys(modeLabels) as PriceMode[]).map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              variant="outline"
              size="sm"
              className="view-toggle"
            >
              {modeLabels[option]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="view-control-group">
        <ToggleGroup
          aria-label="Tarkastelujakso"
          className="view-control-options"
          value={[horizon]}
          onValueChange={(values) => {
            const nextHorizon = values[0] as Horizon | undefined;
            if (nextHorizon) changeHorizon(nextHorizon);
          }}
        >
          {(Object.keys(horizonLabels) as Horizon[]).map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              variant="outline"
              size="sm"
              className={cn(
                "view-toggle",
                option === "tomorrow" && "view-toggle--horizon",
              )}
            >
              {horizonLabels[option]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );

  return (
    <main className="site-shell min-h-screen">
      <header className="site-header sticky top-0 z-30 border-b bg-background/95 backdrop-blur-xl">
        <div className="site-header__inner mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:gap-5 sm:px-6 lg:px-8">
          <a
            href="#main-content"
            className="group inline-flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <Image
              src="/icon.ico"
              alt=""
              width={32}
              height={32}
              className="size-8"
              aria-hidden="true"
              unoptimized
            />
            <span className="site-brand-text">
              <span className="block text-sm font-semibold tracking-tight text-foreground">
                Sähköhetki
              </span>
              <span className="block text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
                Pörssisähkön hinta
              </span>
            </span>
          </a>
          <div className="site-header__tools flex min-w-0 items-center gap-1 sm:gap-2">
            <div
              className="current-value flex min-w-0 items-center gap-2"
              aria-label={`${isCurrentSelection ? "Nykyinen" : "Valittu"} ${priceMargin > 0 ? "hinta marginaali mukaan lukien" : "spot-hinta"} ${selectedPrice === null ? "ei saatavilla" : `${formatPrice(selectedPrice)} snt/kWh`}, aikaväli ${selectedPoint?.label ?? "ei saatavilla"}`}
            >
              <span className="current-value__context flex min-w-0 items-baseline gap-2">
                <span className="current-value__label text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-primary">
                  {isCurrentSelection ? "Nyt" : "Valittu"}
                </span>
                <span className="current-value__time truncate font-mono text-xs text-muted-foreground">
                  {selectedPoint?.label ?? "Ei saatavilla"}
                </span>
              </span>
              <span className="current-value__price shrink-0 font-mono text-sm font-semibold text-foreground">
                {selectedPrice === null ? "—" : formatPrice(selectedPrice)}
              </span>
              <span className="current-value__unit shrink-0 text-[0.65rem] text-muted-foreground">
                snt/kWh
              </span>
            </div>
            <nav
              aria-label="Lisätietoja"
              className="flex items-center gap-0.5 sm:gap-1"
            >
              <Button
                type="button"
                variant="ghost"
                size="lg"
                aria-label="Miten laskemme?"
                className="site-nav-button min-h-9 px-2 sm:px-3"
                onClick={() => openExplanation("formula")}
              >
                <Icon icon={Info} data-icon="inline-start" />
                <span aria-hidden="true" className="hidden sm:inline">
                  Miten laskemme?
                </span>
                <span className="sr-only sm:hidden">Miten laskemme?</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                aria-label="Tietolähde"
                className="site-nav-button min-h-9 px-2 sm:px-3"
                onClick={() => openExplanation("source")}
              >
                <Icon icon={FileText} data-icon="inline-start" />
                <span aria-hidden="true" className="hidden sm:inline">
                  Tietolähde
                </span>
                <span className="sr-only sm:hidden">Tietolähde</span>
              </Button>
              <Button
                type="button"
                variant={priceMargin > 0 ? "secondary" : "ghost"}
                size="lg"
                aria-label="Lisää marginaali"
                aria-describedby={
                  priceMargin > 0 ? "price-margin-status" : undefined
                }
                className="site-nav-button min-h-9 px-2 sm:px-3"
                onClick={() => openExplanation("settings")}
              >
                <Icon icon={Settings} data-icon="inline-start" />
                <span aria-hidden="true" className="hidden sm:inline">
                  Lisää marginaali
                </span>
                <span className="sr-only sm:hidden">Lisää marginaali</span>
              </Button>
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
        className="page-content mx-auto flex max-w-7xl flex-col gap-7 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8"
      >
        <section
          aria-labelledby="selected-heading"
        >
          <Card className="hero-panel">
            <CardHeader className="price-hero__top flex flex-wrap items-center justify-between gap-x-6 gap-y-4 p-5 sm:p-6">
              <h1 id="selected-heading" className="sr-only">
                {heading}
              </h1>
              <div className="min-w-0">
                {selectedPoint ? (
                  <time
                    className="price-hero__selected-date mb-2 block font-mono text-xs font-medium tracking-wide text-muted-foreground"
                    dateTime={selectedPoint.startAt}
                  >
                    {formatSelectedDate(selectedPoint.startAt)}
                  </time>
                ) : null}
                <div className="price-hero__interval flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <span className="price-hero__clock-dot" aria-hidden="true" />
                  <span>Valittu aikaväli:</span>
                  {isCurrentSelection ? (
                    <Badge
                      variant="outline"
                      className="price-hero__current-badge"
                      aria-label="Nykyinen aikaväli"
                    >
                      Nyt
                    </Badge>
                  ) : null}
                  <span className="price-hero__interval-value border border-border bg-muted px-2 py-1 font-mono text-foreground">
                    {selectedPoint?.label ?? "Ei saatavilla"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className="hero-price font-mono text-5xl font-semibold tracking-tight text-foreground sm:text-6xl"
                    data-testid="selected-price"
                  >
                    {selectedPrice === null ? "—" : formatPrice(selectedPrice)}
                  </span>
                  <span className="font-mono text-base text-muted-foreground">
                    snt / kWh
                  </span>
                  {priceMargin > 0 ? (
                    <Badge
                      variant="secondary"
                      className="font-mono text-xs"
                    >
                      + {formatPrice(priceMargin)} snt marginaali
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="price-hero__actions flex flex-wrap items-center justify-start gap-3 lg:justify-end">
                {level ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "level-badge",
                      `level-badge--${selectedPoint?.level ?? "unavailable"}`,
                    )}
                  >
                    {level.label} hinta
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="level-badge level-badge--unavailable">
                    Hintataso ei ole saatavilla
                  </Badge>
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
            </CardHeader>

            {selectedPoint && spectrumPosition !== null ? (
              <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
                <div
                  className="spectrum-widget"
                  aria-label="Valitun hinnan sijainti hintatasoasteikolla"
                  role="img"
                >
                  <div className="spectrum-track relative mt-3 h-2">
                    <span
                      className="spectrum-marker absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                      data-testid="price-spectrum-marker"
                      style={{
                        left: `${Math.min(100, Math.max(0, spectrumPosition))}%`,
                      }}
                    >
                      <span aria-hidden="true" className="spectrum-marker__tick" />
                    </span>
                  </div>
                  <div className="spectrum-labels mt-3 flex justify-between gap-3 text-[0.68rem] text-muted-foreground">
                    <span>
                      ≤ {formatPrice(PRICE_LEVEL_CUTOFFS.cheapMaxCents)} snt/kWh
                      (Edullinen)
                    </span>
                    <span className="hidden text-center sm:inline">
                      &gt; {formatPrice(PRICE_LEVEL_CUTOFFS.cheapMaxCents)}–≤{" "}
                      {formatPrice(PRICE_LEVEL_CUTOFFS.normalMaxCents)} snt/kWh
                      (Normaali)
                    </span>
                    <span>
                      &gt; {formatPrice(PRICE_LEVEL_CUTOFFS.normalMaxCents)} snt/kWh
                      (Korkea)
                    </span>
                  </div>
                </div>
              </CardContent>
            ) : null}
          </Card>
        </section>

        {unavailableMessage && !isTomorrowUnavailable ? (
          <Alert
            role="status"
            className="unavailable-panel p-5 text-sm leading-7"
          >
            <Icon icon={Info} className="mt-1 shrink-0" />
            <AlertDescription>{unavailableMessage}</AlertDescription>
          </Alert>
        ) : null}

        {data.status === "ready" ? (
          <PriceChart
            points={isTomorrowUnavailable ? [] : activePoints}
            selectedId={selectedId}
            onSelect={setSelectedId}
            showCarriedForwardMarker={mode === "quarterHour"}
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
            className="uses-section flex min-w-0 flex-col gap-5"
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Kymmenen arjen sähkönkäyttökohdetta
                </p>
                <h2
                  id="uses-heading"
                  className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground"
                >
                  Mitä sähkönkäyttö maksaa?
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="mt-4 min-h-11"
                  onClick={() => openExplanation("settings")}
                >
                  <Icon icon={Settings} data-icon="inline-start" />
                  Lisää siirto + sähkövero
                </Button>
              </div>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Arvio perustuu valittuun spot-hintaan
                {priceMargin > 0 ? " ja asetettuun myyjän marginaaliin" : ""}.
                Kun verkkoyhtiö on valittu, mukaan lasketaan siirtomaksu ja
                kotitalouden sähkövero. Kuukausittainen perusmaksu näytetään
                erikseen.
                {priceMargin > 0
                  ? ` Marginaali on ${formatPrice(priceMargin)} snt/kWh.`
                  : " Lisää myyjän marginaali hinta-asetuksista, jos haluat sen mukaan arvioon."}
              </p>
            </div>
            <div className="appliance-grid">
              {data.uses.map((use) => {
                const estimate = getTransferUseEstimate(
                  use,
                  selectedPoint,
                  selectedTransferTariff,
                  transferData.electricityTax.centsPerKwhVatIncluded,
                );
                return (
                  <ApplianceCard
                    key={use.id}
                    use={use}
                    estimate={estimate}
                    costLabel={useCostLabel}
                    emptyMessage={useCostEmptyMessage}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        <footer className="site-footer pt-6 text-sm leading-7 text-muted-foreground">
          <Separator className="mb-6" />
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="font-medium text-foreground">
                Sähköhetki näyttää ENTSO-E:n markkinahinnasta muodostetun
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
              <span>Tiedot haettu: {formatFetchedAt(data.fetchedAt)}</span>
              <a
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                href={data.source.pricesUrl}
                target="_blank"
                rel="noreferrer"
              >
                {data.source.name}
                <Icon icon={ArrowUpRight} className="size-4" />
              </a>
              <a
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                href={data.source.documentationUrl}
                target="_blank"
                rel="noreferrer"
              >
                API-dokumentaatio
                <Icon icon={ArrowUpRight} className="size-4" />
              </a>
            </div>
          </div>
        </footer>
      </div>

      <ExplanationDialog
        id="formula-dialog"
        title="Miten kustannusarvio lasketaan?"
        open={openDialog === "formula"}
        onOpenChange={handleDialogOpenChange}
      >
        <p>
          Arvio perustuu valittuun spot-hintaan, valitun verkkoyhtiön
          siirtomaksuun, kotitalouden sähköveroon ja kunkin ennalta määritellyn
          käyttötavan kulutukseen. Spot- ja siirtohinnat sisältävät Suomen
          yleisen 25,5 %:n arvonlisäveron.
        </p>
        <p className="border border-border bg-muted px-4 py-3 font-mono text-sm text-foreground">
          kulutus (kWh) × (spot + marginaali + siirto + sähkövero) (snt/kWh) =
          kustannus (snt)
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
          Kuukausittaista perusmaksua ei kohdisteta yksittäiseen käyttöön,
          vaan se näytetään valitun tariffin tiedoissa.{" "}
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
        onOpenChange={handleDialogOpenChange}
      >
        <p>
          Sähköhetki käyttää ENTSO-E:n uusimpia Suomen tarjousalueen
          spot-hintoja 15 minuutin tarkkuudella. Näytetty hinta sisältää
          Suomen yleisen 25,5 %:n arvonlisäveron.{" "}
          {priceMargin > 0
            ? "Näytettyihin hintoihin on lisätty " +
              formatPrice(priceMargin) +
              " snt/kWh marginaali."
            : "ENTSO-E:n markkinahinta muunnetaan senttiä/kWh-yksikköön ja verolliseksi hinnaksi."}{" "}
          Palvelin tarkistaa lähteen tiedot ja muodostaa niiden perusteella
          näkymään tuntikeskiarvot sekä 15 minuutin hinnat.
        </p>
        <p>
          Siirtohinnat luetaan tämän näkymän CSV-snapshotista kunnittain.
          Verkkoyhtiö valitaan erikseen silloin, kun kunnassa on useampi
          vaihtoehto. Sähkövero perustuu Verohallinnon voimassa olevaan
          verotaulukkoon.
        </p>
        <p>
          Tiedot haetaan ja säilytetään palvelimella noin 12 tuntia. Sivu ei hae
          hintoja uudelleen selaimessa. Puuttuvan hinnan tilalla käytetään 15
          minuutin näkymässä viimeisintä saatavilla olevaa hintaa, ja se
          merkitään kaaviossa viivoituksella.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <a
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            href={data.source.pricesUrl}
            target="_blank"
            rel="noreferrer"
          >
            ENTSO-E
            <Icon icon={ArrowUpRight} className="size-4" />
          </a>
          <a
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            href={data.source.documentationUrl}
            target="_blank"
            rel="noreferrer"
          >
            API-dokumentaatio
            <Icon icon={ArrowUpRight} className="size-4" />
          </a>
        </div>
        <a
          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          href={data.transferData.electricityTax.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Verohallinnon sähköveron verotaulukko
          <Icon icon={ArrowUpRight} className="size-4" />
        </a>
      </ExplanationDialog>

      <ExplanationDialog
        id="settings-dialog"
        title="Lisää marginaali"
        open={openDialog === "settings"}
        onOpenChange={handleDialogOpenChange}
        closeButtonLabel="Sulje lisää marginaali"
      >
        <form className="flex flex-col gap-5" onSubmit={applyMargin}>
          <p>
            Lisää sähköyhtiösi snt/kWh-marginaali, niin se lasketaan mukaan
            jokaiseen markkinahintaan ja kustannusarvioon.
          </p>
          <FieldGroup>
            <Field data-invalid={marginError ? "true" : undefined}>
              <FieldLabel
                htmlFor="price-margin"
              >
                Sähköyhtiön marginaali
              </FieldLabel>
              <div className="flex items-center gap-3 border border-input bg-background px-4 py-3 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50">
                <Input
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
                  className="min-w-0 flex-1 border-0 bg-transparent font-mono text-xl outline-none focus-visible:ring-0"
                  onChange={(event) => {
                    setMarginInput(event.target.value);
                    if (marginError) setMarginError(null);
                  }}
                />
                <span className="font-mono text-sm text-muted-foreground">
                  snt/kWh
                </span>
              </div>
              <FieldDescription id="price-margin-help">
                Käytä desimaalierottimena pilkkua tai pistettä. Nolla palauttaa
                pelkän markkinahinnan.
              </FieldDescription>
              {marginError ? (
                <FieldError id="price-margin-error">{marginError}</FieldError>
              ) : null}
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" className="min-h-11">
              Käytä marginaalia
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11"
              onClick={resetMargin}
            >
              Palauta spot-hintaan
            </Button>
          </div>
        </form>
        <TransferCostPanel
          data={transferData}
          selectedMunicipalityCode={selectedMunicipalityCode}
          selectedOperatorId={selectedOperatorId}
          selectedMunicipality={selectedMunicipality}
          selectedTariff={selectedTransferTariff}
          onMunicipalityChange={changeMunicipality}
          onOperatorChange={changeOperator}
          onLocate={locateMunicipality}
          locationStatus={locationStatus}
          locationMessage={locationMessage}
        />
      </ExplanationDialog>
    </main>
  );
}
