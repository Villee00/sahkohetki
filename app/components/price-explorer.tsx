"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useIsPresent,
  usePresenceData,
} from "motion/react";
import { ApplianceCard } from "./appliance-card";
import { ExplanationDialog } from "./explanation-dialog";
import { Icon } from "./ui-icon";
import { PriceChart } from "./price-chart";
import { SiteHeader } from "./site-header";
import { TransferCostPanel } from "./transfer-cost-panel";
import {
  applyPriceMargin,
  calculateUseCostWithTransfer,
} from "../../lib/price-domain";
import { getHelsinkiDateBounds, getHelsinkiDateKey } from "../../lib/time";
import { PRICE_LEVEL_CUTOFFS, PRICE_SCALE_BOUNDS } from "../../lib/price-types";
import type {
  TransferCostMunicipality,
  TransferCostTariff,
} from "../../lib/transfer-api";
import type { EverydayUse } from "@/lib/appliances";
import type {
  CostEstimate,
  ExplorerData,
  HorizonPoints,
  PriceLevel,
  PricePoint,
} from "@/lib/price-types";

type PriceMode = "hourly" | "quarterHour";
type Horizon = "today" | "tomorrow";
type DialogName = "formula" | "source" | "settings" | null;
type LocationStatus = "idle" | "locating" | "success" | "error";

const PRICE_MARGIN_STORAGE_KEY = "sahkohetki.price-margin";
const TRANSFER_SELECTION_STORAGE_KEY = "sahkohetki.transfer-selection";

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
    label: "Normaali",
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
  tariff: TransferCostTariff | null,
  electricityTaxCentsPerKwh: number,
): CostEstimate | null {
  if (!point || !point.available || point.priceCentsPerKwh === null) {
    return null;
  }

  if (!tariff) return point.estimates?.[use.id] ?? null;
  if (
    !tariff.priceAvailable ||
    tariff.transferEnergyChargeCentsPerKwh === null
  ) {
    return null;
  }

  const estimate = calculateUseCostWithTransfer(
    use.consumptionKwh,
    point.priceCentsPerKwh,
    tariff.transferEnergyChargeCentsPerKwh,
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
      municipalityCode: (parsed as { municipalityCode: string })
        .municipalityCode,
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

type HeroMotionDirection = -1 | 0 | 1;

const heroValueVariants = {
  enter: (direction: HeroMotionDirection) => ({
    opacity: 0,
    y: direction > 0 ? "0.45em" : direction < 0 ? "-0.45em" : 0,
  }),
  center: { opacity: 1, y: 0 },
  exit: (direction: HeroMotionDirection) => ({
    opacity: 0,
    y: direction > 0 ? "-0.35em" : direction < 0 ? "0.35em" : 0,
  }),
};

const HeroTransitionValue = forwardRef<HTMLSpanElement, { children: ReactNode }>(
  function HeroTransitionValue({ children }, ref) {
    const isPresent = useIsPresent();
    const direction =
      (usePresenceData() as HeroMotionDirection | undefined) ?? 0;

    return (
      <motion.span
        ref={ref}
        aria-hidden={isPresent ? undefined : true}
        custom={direction}
        variants={heroValueVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.16, ease: "easeOut" }}
        style={{ gridArea: "1 / 1" }}
      >
        {children}
      </motion.span>
    );
  },
);

HeroTransitionValue.displayName = "HeroTransitionValue";

function HeroValueTransition({
  value,
  itemKey,
  className,
  direction = 0,
}: {
  value: string;
  itemKey: string;
  className: string;
  direction?: HeroMotionDirection;
}) {
  return (
    <span className={`price-hero__animated-slot ${className}`}>
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <HeroTransitionValue key={itemKey}>{value}</HeroTransitionValue>
      </AnimatePresence>
    </span>
  );
}

function HeroPriceTransition({
  value,
  itemKey,
  className,
}: {
  value: number | null;
  itemKey: string;
  className: string;
}) {
  const [transition, setTransition] = useState<{
    itemKey: string;
    value: number | null;
    direction: HeroMotionDirection;
  }>({ itemKey, value, direction: 0 });

  if (transition.itemKey !== itemKey || transition.value !== value) {
    setTransition({
      itemKey,
      value,
      direction:
        transition.value === null ||
        value === null ||
        value === transition.value
          ? 0
          : value > transition.value
            ? 1
            : -1,
    });
  }

  return (
    <HeroValueTransition
      itemKey={`${itemKey}:${value ?? "unavailable"}`}
      className={className}
      value={value === null ? "—" : formatPrice(value)}
      direction={transition.direction}
    />
  );
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
  const [isMobilePriceFloating, setIsMobilePriceFloating] = useState(false);
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
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const openDialogRef = useRef<DialogName>(null);
  const headerInnerRef = useRef<HTMLDivElement | null>(null);
  const selectedPriceContentRef = useRef<HTMLDivElement | null>(null);
  const transferData = data.transferData;
  const selectedMunicipality = useMemo<TransferCostMunicipality | null>(
    () =>
      transferData.municipalities.find(
        (municipality) =>
          municipality.municipalityCode === selectedMunicipalityCode,
      ) ?? null,
    [selectedMunicipalityCode, transferData.municipalities],
  );
  const selectedTransferTariff = useMemo<TransferCostTariff | null>(
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
    const updateFloatingPrice = () => {
      const priceContentTop =
        selectedPriceContentRef.current?.getBoundingClientRect().top;
      const headerBottom =
        headerInnerRef.current?.getBoundingClientRect().bottom;
      if (priceContentTop === undefined || headerBottom === undefined) return;

      setIsMobilePriceFloating(priceContentTop <= headerBottom);
    };

    updateFloatingPrice();
    window.addEventListener("scroll", updateFloatingPrice, { passive: true });
    window.addEventListener("resize", updateFloatingPrice);
    return () => {
      window.removeEventListener("scroll", updateFloatingPrice);
      window.removeEventListener("resize", updateFloatingPrice);
    };
  }, [horizon, isTomorrowUnavailable, mode, priceMargin, selectedPoint]);

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
      municipality?.operators.length === 1 ? municipality.operators[0].id : "",
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
    openDialogRef.current = null;
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
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
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
  }, [closeDialog]);

  const openExplanation = (
    name: Exclude<DialogName, null>,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    openerRef.current = event.currentTarget;
    openDialogRef.current = name;
    if (name === "settings") {
      setMarginInput(formatMarginInput(priceMargin));
      setMarginError(null);
    }
    setOpenDialog(name);
  };

  const handleDialogExitComplete = useCallback(() => {
    if (openDialogRef.current !== null) return;
    openerRef.current?.focus();
    openerRef.current = null;
  }, []);

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
    const preferredId =
      nextHorizon === "today"
        ? mode === "hourly"
          ? data.currentHourId
          : data.currentQuarterId
        : null;
    setHorizon(nextHorizon);
    setSelectedId((currentId) =>
      getSelectionForPoints(nextPoints, currentId, preferredId),
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
              {mode === option ? (
                <motion.span
                  aria-hidden="true"
                  className="view-toggle__active-indicator"
                  layoutId="price-mode-active"
                  transition={{ duration: 0.18, ease: "easeOut" }}
                />
              ) : null}
              <span className="view-toggle__label">{modeLabels[option]}</span>
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
              {horizon === option ? (
                <motion.span
                  aria-hidden="true"
                  className="view-toggle__active-indicator"
                  layoutId="horizon-active"
                  transition={{ duration: 0.18, ease: "easeOut" }}
                />
              ) : null}
              <span className="view-toggle__label">
                {horizonLabels[option]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const dialogConfigs: Record<
    Exclude<DialogName, null>,
    {
      id: string;
      title: string;
      closeButtonLabel?: string;
      children: ReactNode;
    }
  > = {
    formula: {
      id: "formula-dialog",
      title: "Miten kustannusarvio lasketaan?",
      children: (
        <>
          <p>
            Arvio perustuu valittuun spot-hintaan, valitun verkkoyhtiön
            siirtomaksuun, kotitalouden sähköveroon ja kunkin ennalta
            määritellyn käyttötavan kulutukseen. Spot- ja siirtohinnat
            sisältävät Suomen yleisen 25,5 %:n arvonlisäveron.
          </p>
          <p className="rounded-2xl border border-sky-300/20 bg-sky-300/10 px-4 py-3 font-mono text-sm text-sky-100">
            kulutus (kWh) × (spot + marginaali + siirto + sähkövero) (snt/kWh)
            = kustannus (snt)
          </p>
          <p>
            Esimerkiksi kahvinkeittimen vertailukulutus on {""}
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
        </>
      ),
    },
    source: {
      id: "source-dialog",
      title: "Mistä hintatiedot tulevat?",
      children: (
        <>
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
            Tiedot haetaan ja säilytetään palvelimella noin 12 tuntia. Sivu ei
            hae hintoja uudelleen selaimessa. Puuttuvan hinnan tilalla
            käytetään 15 minuutin näkymässä viimeisintä saatavilla olevaa
            hintaa, ja se merkitään kaaviossa viivoituksella.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <a
              className="inline-flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
              href={data.source.pricesUrl}
              target="_blank"
              rel="noreferrer"
            >
              ENTSO-E
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
          <a
            className="inline-flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            href={data.transferData.electricityTax.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Verohallinnon sähköveron verotaulukko
            <Icon name="arrow-up-right" className="h-4 w-4" />
          </a>
        </>
      ),
    },
    settings: {
      id: "settings-dialog",
      title: "Lisää marginaali",
      closeButtonLabel: "Sulje lisää marginaali",
      children: (
        <>
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
                <span className="font-mono text-sm text-slate-400">
                  snt/kWh
                </span>
              </div>
              <p
                id="price-margin-help"
                className="mt-2 text-xs leading-5 text-slate-500"
              >
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
        </>
      ),
    },
  };
  const activeDialogConfig = openDialog
    ? dialogConfigs[openDialog]
    : null;

  return (
    <MotionConfig reducedMotion="user">
      <main className="site-shell min-h-screen bg-slate-950 text-slate-100">
        <SiteHeader
          activeRoute="price"
          brandHref="#main-content"
          innerRef={headerInnerRef}
          floatingContent={
            <AnimatePresence initial={false}>
              {isMobilePriceFloating ? (
                <motion.div
                  key="mobile-selected-price"
                  className="mobile-price-float"
                  role="status"
                  aria-live="polite"
                  aria-label={
                    (isCurrentSelection ? "Nykyinen" : "Valittu") +
                    " " +
                    (priceMargin > 0
                      ? "hinta marginaali mukaan lukien"
                      : "spot-hinta") +
                    " " +
                    (selectedPrice === null
                      ? "ei saatavilla"
                      : formatPrice(selectedPrice) + " snt/kWh") +
                    ", aikaväli " +
                    (selectedPoint?.label ?? "ei saatavilla")
                  }
                  initial={{ opacity: 0, y: "-0.3rem" }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: "-0.3rem" }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                >
                  <span className="mobile-price-float__context">
                    <span className="mobile-price-float__label">
                      {isCurrentSelection ? "Nyt" : "Valittu"}
                    </span>
                    <HeroValueTransition
                      itemKey={selectedPoint?.id ?? "unavailable"}
                      className="mobile-price-float__time"
                      value={selectedPoint?.label ?? "Ei saatavilla"}
                    />
                  </span>
                  <span className="mobile-price-float__value">
                    <HeroPriceTransition
                      itemKey={selectedPoint?.id ?? "unavailable"}
                      className="mobile-price-float__number"
                      value={selectedPrice}
                    />
                    <span className="mobile-price-float__unit"> snt/kWh</span>
                  </span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          }
        >
          <div
            className="current-value flex shrink-0 items-center gap-2"
            aria-label={
              (isCurrentSelection ? "Nykyinen" : "Valittu") +
              " " +
              (priceMargin > 0
                ? "hinta marginaali mukaan lukien"
                : "spot-hinta") +
              " " +
              (selectedPrice === null
                ? "ei saatavilla"
                : formatPrice(selectedPrice) + " snt/kWh") +
              ", aikaväli " +
              (selectedPoint?.label ?? "ei saatavilla")
            }
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
            className="ml-auto flex items-center gap-0.5 sm:gap-1"
          >
            <button
              type="button"
              aria-label="Miten laskemme?"
              className="site-nav-button inline-flex min-h-9 items-center gap-2 rounded-xl px-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 sm:px-3"
              onClick={(event) => openExplanation("formula", event)}
            >
              <Icon name="info" className="h-4 w-4" />
              <span aria-hidden="true" className="hidden lg:inline">
                Miten laskemme?
              </span>
              <span className="sr-only lg:hidden">Miten laskemme?</span>
            </button>
            <button
              type="button"
              aria-label="Tietolähde"
              className="site-nav-button inline-flex min-h-9 items-center gap-2 rounded-xl px-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 sm:px-3"
              onClick={(event) => openExplanation("source", event)}
            >
              <Icon name="source" className="h-4 w-4" />
              <span aria-hidden="true" className="hidden lg:inline">
                Tietolähde
              </span>
              <span className="sr-only lg:hidden">Tietolähde</span>
            </button>
            <button
              type="button"
              aria-label="Lisää marginaali"
              aria-describedby={
                priceMargin > 0 ? "price-margin-status" : undefined
              }
              className={`site-nav-button inline-flex min-h-9 items-center gap-2 rounded-xl px-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 sm:px-3 ${priceMargin > 0 ? "site-nav-button--active" : ""}`}
              onClick={(event) => openExplanation("settings", event)}
            >
              <Icon name="settings" className="h-4 w-4" />
              <span aria-hidden="true" className="hidden lg:inline">
                Lisää marginaali
              </span>
              <span className="sr-only lg:hidden">Lisää marginaali</span>
            </button>
            {priceMargin > 0 ? (
              <span id="price-margin-status" className="sr-only">
                Marginaali {formatPrice(priceMargin)} snt/kWh käytössä
              </span>
            ) : null}
          </nav>
        </SiteHeader>

      <div
        id="main-content"
        tabIndex={-1}
        className="page-content mx-auto max-w-7xl space-y-7 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8"
      >
        <section
          aria-labelledby="selected-heading"
          className="hero-panel overflow-hidden rounded-3xl border border-slate-700/70 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/30 sm:p-6"
        >
          <h1 id="selected-heading" className="sr-only">
            {heading}
          </h1>
          <div
            ref={selectedPriceContentRef}
            className="price-hero__top flex flex-wrap items-center justify-between gap-x-6 gap-y-4"
          >
            <div className="min-w-0">
              {selectedPoint ? (
                <time
                  className="price-hero__selected-date mb-2 block font-mono text-xs font-medium tracking-wide text-slate-500"
                  dateTime={selectedPoint.startAt}
                >
                  {formatSelectedDate(selectedPoint.startAt)}
                </time>
              ) : null}
              <div
                className="price-hero__time-readout"
                role="group"
                aria-label={`${isCurrentSelection ? "Nykyinen" : "Valittu"} aikaväli ${selectedPoint?.label ?? "ei saatavilla"}`}
              >
                <span className="price-hero__time-state">
                  <span className="price-hero__clock-dot" aria-hidden="true" />
                  {isCurrentSelection ? "NYT" : "VALITTU"}
                </span>
                <span className="price-hero__time-divider" aria-hidden="true">
                  ·
                </span>
                <HeroValueTransition
                  itemKey={selectedPoint?.id ?? "unavailable"}
                  className="price-hero__interval-value font-mono"
                  value={selectedPoint?.label ?? "Ei saatavilla"}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <HeroPriceTransition
                  itemKey={selectedPoint?.id ?? "unavailable"}
                  className="hero-price font-mono text-5xl font-semibold tracking-tight text-white sm:text-6xl"
                  value={selectedPrice}
                />
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
            className="uses-section space-y-3 sm:space-y-5"
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0">
                <p className="uses-section__eyebrow text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
                  Kymmenen arjen sähkönkäyttökohdetta
                </p>
                <h2
                  id="uses-heading"
                  className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl"
                >
                  Mitä sähkönkäyttö maksaa?
                </h2>
                <p className="uses-section__mobile-context mt-2 text-sm text-slate-400">
                  Valittu aikaväli {selectedPoint.label} ·{" "}
                  {selectedTransferTariff?.priceAvailable
                    ? priceMargin > 0
                      ? "Sähkö + marginaali + siirto + vero"
                      : "Sähkö + siirto + vero"
                    : selectedOperatorId
                      ? "Siirtohinta ei saatavilla"
                      : priceMargin > 0
                        ? "Spot-hinta + marginaali"
                        : "Spot-hinta"}
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-300/35 bg-sky-300/10 px-4 text-sm font-semibold text-sky-100 transition hover:border-sky-300/65 hover:bg-sky-300/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 sm:mt-4"
                  onClick={(event) => openExplanation("settings", event)}
                >
                  <Icon name="settings" className="h-4 w-4" />
                  {selectedOperatorId
                    ? "Muokkaa siirtoa + sähköveroa"
                    : "Lisää siirto + sähkövero"}
                </button>
              </div>
              <p className="uses-section__long-explanation max-w-md text-sm leading-6 text-slate-400">
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

        <footer className="site-footer border-t border-slate-800 pt-6 text-sm leading-7 text-slate-500">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="font-medium text-slate-300">
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

      <AnimatePresence
        initial={false}
        mode="wait"
        onExitComplete={handleDialogExitComplete}
      >
        {activeDialogConfig ? (
          <ExplanationDialog
            key={openDialog}
            id={activeDialogConfig.id}
            title={activeDialogConfig.title}
            onClose={closeDialog}
            dialogRef={dialogRef}
            closeButtonRef={closeButtonRef}
            closeButtonLabel={activeDialogConfig.closeButtonLabel}
          >
            {activeDialogConfig.children}
          </ExplanationDialog>
        ) : null}
      </AnimatePresence>
    </main>
    </MotionConfig>
  );
}
