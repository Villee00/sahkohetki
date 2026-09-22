import "server-only";

import { unstable_cache } from "next/cache";
import { buildForecastSeries } from "./forecast-domain";
import type {
  CurrentElectricityState,
  ElectricityForecastResult,
  ElectricityShortageLevel,
  ForecastObservation,
  ForecastSnapshot,
  ForecastSourceMetadata,
  ForecastUnavailableReason,
  PowerMeasurement,
} from "./forecast-types";

const API_URL = "https://data.fingrid.fi/api/data";
const HOUR_MILLISECONDS = 60 * 60 * 1_000;
const SOURCE_CACHE_SECONDS = 3 * 60;
const MAX_STALE_MILLISECONDS = 30 * 60 * 1_000;
const MAX_CURRENT_AGE_MILLISECONDS = 10 * 60 * 1_000;
const PAGE_SIZE = 20_000;

export const FINGRID_DATASET_IDS = {
  consumptionForecast: 166,
  productionForecast: 241,
  windForecast: 245,
  solarForecast: 248,
  solarCapacityModel: 267,
  windCapacityModel: 268,
  currentProduction: 192,
  currentConsumption: 193,
  currentNetImportExport: 194,
  electricityShortageStatus: 336,
} as const;

export const FINGRID_FORECAST_SOURCE: ForecastSourceMetadata = {
  name: "Fingrid Open Data",
  homepageUrl: "https://data.fingrid.fi/en",
  apiUrl: API_URL,
  datasets: { ...FINGRID_DATASET_IDS },
  capacityDescription:
    "Wind and solar capacity values are Fingrid forecast-model estimates, not a guarantee of available electricity.",
};

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type FingridSourceUnavailableReason =
  | "configuration"
  | "request"
  | "schema";

export type FingridSourceResult =
  | {
      status: "ready";
      observations: ForecastObservation[];
      current: CurrentElectricityState;
    }
  | {
      status: "unavailable";
      reason: FingridSourceUnavailableReason;
      message: string;
    };

type CachedFingridSnapshot = Extract<FingridSourceResult, { status: "ready" }> & {
  fetchedAt: string;
};

type ParsedRow = {
  datasetId: number;
  startMilliseconds: number;
  endMilliseconds: number;
  value: number;
};

type CurrentCandidate = {
  value: number;
  observedAtMilliseconds: number;
};

class FingridRefreshError extends Error {
  readonly reason: FingridSourceUnavailableReason;

  constructor(reason: FingridSourceUnavailableReason, message: string) {
    super(message);
    this.name = "FingridRefreshError";
    this.reason = reason;
  }
}

const CONFIGURATION_MESSAGE =
  "Sähköennustetta ei voida hakea, koska Fingrid API -avain puuttuu.";
const REQUEST_MESSAGE = "Fingridin sähköennustetta ei saatu haettua juuri nyt.";
const SCHEMA_MESSAGE = "Fingridin sähköennusteen muotoa ei voitu varmistaa.";
const EXPIRED_MESSAGE = "Viimeisin onnistunut sähköennuste on liian vanha näytettäväksi.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim().length === 0) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestampMilliseconds(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return null;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function canonicalTimestamp(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function parseRow(value: unknown): ParsedRow | null {
  if (!isRecord(value)) return null;

  const datasetId = finiteNumber(value.datasetId);
  const startMilliseconds = timestampMilliseconds(value.startTime);
  const endMilliseconds = timestampMilliseconds(value.endTime);
  const rowValue = finiteNumber(value.value);
  if (
    datasetId === null ||
    !Number.isInteger(datasetId) ||
    startMilliseconds === null ||
    endMilliseconds === null ||
    endMilliseconds < startMilliseconds ||
    rowValue === null
  ) {
    return null;
  }

  return { datasetId, startMilliseconds, endMilliseconds, value: rowValue };
}

function setLatestCandidate(
  candidates: Map<number, CurrentCandidate>,
  row: ParsedRow,
): void {
  const observedAtMilliseconds = Math.max(
    row.startMilliseconds,
    row.endMilliseconds,
  );
  const previous = candidates.get(row.datasetId);
  if (!previous || previous.observedAtMilliseconds < observedAtMilliseconds) {
    candidates.set(row.datasetId, {
      value: row.value,
      observedAtMilliseconds,
    });
  }
}

function measurementFromCandidate(
  candidate: CurrentCandidate | undefined,
  nowMilliseconds: number,
  normalizeValue: (value: number) => number = (value) => value,
): PowerMeasurement | null {
  if (!candidate) return null;
  const age = nowMilliseconds - candidate.observedAtMilliseconds;
  if (age < 0 || age > MAX_CURRENT_AGE_MILLISECONDS) return null;
  return {
    valueMw: normalizeValue(candidate.value),
    observedAt: canonicalTimestamp(candidate.observedAtMilliseconds),
  };
}

function shortageLevel(value: number): ElectricityShortageLevel | null {
  switch (value) {
    case 0:
      return "normal";
    case 1:
      return "shortage-possible";
    case 2:
      return "high-risk";
    case 3:
      return "shortage";
    default:
      return null;
  }
}

function currentStateFromCandidates(
  candidates: Map<number, CurrentCandidate>,
  nowMilliseconds: number,
): CurrentElectricityState {
  const statusCandidate = candidates.get(
    FINGRID_DATASET_IDS.electricityShortageStatus,
  );
  const level = statusCandidate ? shortageLevel(statusCandidate.value) : null;
  const statusAge = statusCandidate
    ? nowMilliseconds - statusCandidate.observedAtMilliseconds
    : Number.POSITIVE_INFINITY;

  return {
    production: measurementFromCandidate(
      candidates.get(FINGRID_DATASET_IDS.currentProduction),
      nowMilliseconds,
    ),
    consumption: measurementFromCandidate(
      candidates.get(FINGRID_DATASET_IDS.currentConsumption),
      nowMilliseconds,
    ),
    netImport: measurementFromCandidate(
      candidates.get(FINGRID_DATASET_IDS.currentNetImportExport),
      nowMilliseconds,
      (sourceValue) => -sourceValue,
    ),
    shortageStatus:
      statusCandidate &&
      level !== null &&
      statusAge >= 0 &&
      statusAge <= MAX_CURRENT_AGE_MILLISECONDS
        ? {
            code: statusCandidate.value as 0 | 1 | 2 | 3,
            level,
            observedAt: canonicalTimestamp(
              statusCandidate.observedAtMilliseconds,
            ),
          }
        : null,
  };
}

function sanitizeCurrentState(
  current: CurrentElectricityState,
  nowMilliseconds: number,
): CurrentElectricityState {
  const freshMeasurement = (
    measurement: PowerMeasurement | null,
  ): PowerMeasurement | null => {
    if (!measurement) return null;
    const observedAtMilliseconds = timestampMilliseconds(measurement.observedAt);
    if (observedAtMilliseconds === null) return null;
    const age = nowMilliseconds - observedAtMilliseconds;
    return age >= 0 && age <= MAX_CURRENT_AGE_MILLISECONDS
      ? measurement
      : null;
  };

  const statusObservedAt = current.shortageStatus
    ? timestampMilliseconds(current.shortageStatus.observedAt)
    : null;
  const statusAge =
    statusObservedAt === null
      ? Number.POSITIVE_INFINITY
      : nowMilliseconds - statusObservedAt;

  return {
    production: freshMeasurement(current.production),
    consumption: freshMeasurement(current.consumption),
    netImport: freshMeasurement(current.netImport),
    shortageStatus:
      current.shortageStatus &&
      statusAge >= 0 &&
      statusAge <= MAX_CURRENT_AGE_MILLISECONDS
        ? current.shortageStatus
        : null,
  };
}

function forecastSeriesForDataset(
  datasetId: number,
): ForecastObservation["series"] | null {
  switch (datasetId) {
    case FINGRID_DATASET_IDS.productionForecast:
      return "production";
    case FINGRID_DATASET_IDS.consumptionForecast:
      return "consumption";
    case FINGRID_DATASET_IDS.windForecast:
      return "wind";
    case FINGRID_DATASET_IDS.solarForecast:
      return "solar";
    case FINGRID_DATASET_IDS.windCapacityModel:
      return "windCapacity";
    case FINGRID_DATASET_IDS.solarCapacityModel:
      return "solarCapacity";
    default:
      return null;
  }
}

function buildRequestUrl(now: Date): string | null {
  const nowMilliseconds = now.getTime();
  if (!Number.isFinite(nowMilliseconds)) return null;
  const horizonStart =
    Math.floor(nowMilliseconds / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  const url = new URL(API_URL);
  for (const datasetId of Object.values(FINGRID_DATASET_IDS)) {
    url.searchParams.append("datasets", String(datasetId));
  }
  url.searchParams.set(
    "startTime",
    canonicalTimestamp(horizonStart - HOUR_MILLISECONDS),
  );
  url.searchParams.set(
    "endTime",
    canonicalTimestamp(horizonStart + 72 * HOUR_MILLISECONDS),
  );
  url.searchParams.set("format", "json");
  url.searchParams.set("oneRowPerTimePeriod", "false");
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  url.searchParams.set("locale", "en");
  return url.toString();
}

export async function fetchFingridObservations(
  fetchImpl: FetchImplementation = fetch,
  now = new Date(),
): Promise<FingridSourceResult> {
  const apiKey = process.env.FINGRID_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "unavailable",
      reason: "configuration",
      message: CONFIGURATION_MESSAGE,
    };
  }

  const requestUrl = buildRequestUrl(now);
  if (!requestUrl) {
    return {
      status: "unavailable",
      reason: "request",
      message: REQUEST_MESSAGE,
    };
  }

  let body: unknown;
  try {
    const response = await fetchImpl(requestUrl, {
      cache: "no-store",
      headers: { "x-api-key": apiKey },
    });
    if (!response.ok) {
      return {
        status: "unavailable",
        reason: "request",
        message: REQUEST_MESSAGE,
      };
    }
    body = await response.json();
  } catch {
    return {
      status: "unavailable",
      reason: "request",
      message: REQUEST_MESSAGE,
    };
  }

  if (!isRecord(body) || !Array.isArray(body.data)) {
    return {
      status: "unavailable",
      reason: "schema",
      message: SCHEMA_MESSAGE,
    };
  }

  const observations: ForecastObservation[] = [];
  const currentCandidates = new Map<number, CurrentCandidate>();
  let validRowCount = 0;

  for (const value of body.data) {
    const parsed = parseRow(value);
    if (!parsed) continue;

    const series = forecastSeriesForDataset(parsed.datasetId);
    if (series) {
      if (parsed.endMilliseconds <= parsed.startMilliseconds) continue;
      observations.push({
        series,
        startAt: canonicalTimestamp(parsed.startMilliseconds),
        endAt: canonicalTimestamp(parsed.endMilliseconds),
        valueMw: parsed.value,
      });
      validRowCount += 1;
      continue;
    }

    if (
      parsed.datasetId === FINGRID_DATASET_IDS.currentProduction ||
      parsed.datasetId === FINGRID_DATASET_IDS.currentConsumption ||
      parsed.datasetId === FINGRID_DATASET_IDS.currentNetImportExport ||
      parsed.datasetId === FINGRID_DATASET_IDS.electricityShortageStatus
    ) {
      setLatestCandidate(currentCandidates, parsed);
      validRowCount += 1;
    }
  }

  if (validRowCount === 0) {
    return {
      status: "unavailable",
      reason: "schema",
      message: SCHEMA_MESSAGE,
    };
  }

  return {
    status: "ready",
    observations,
    current: currentStateFromCandidates(currentCandidates, now.getTime()),
  };
}

let latestSuccessfulSnapshot: CachedFingridSnapshot | undefined;

const getCachedFingridSnapshot = unstable_cache(
  async (): Promise<CachedFingridSnapshot> => {
    const fetchedAt = new Date();
    const result = await fetchFingridObservations(fetch, fetchedAt);
    if (result.status === "unavailable") {
      throw new FingridRefreshError(result.reason, result.message);
    }

    const snapshot: CachedFingridSnapshot = {
      ...result,
      fetchedAt: fetchedAt.toISOString(),
    };
    latestSuccessfulSnapshot = snapshot;
    return snapshot;
  },
  ["sahkohetki-fingrid-electricity-forecast-v1"],
  { revalidate: SOURCE_CACHE_SECONDS },
);

function unavailableResult(
  reason: ForecastUnavailableReason,
  message: string,
): ElectricityForecastResult {
  return { status: "unavailable", reason, message };
}

function mapUnavailableReason(
  reason: FingridSourceUnavailableReason,
): ForecastUnavailableReason {
  if (reason === "configuration") return "missing-configuration";
  if (reason === "schema") return "source-malformed";
  return "source-unavailable";
}

function buildSnapshot(
  sourceSnapshot: CachedFingridSnapshot,
  now: Date,
  freshnessState: "fresh" | "stale",
): ForecastSnapshot {
  const nowMilliseconds = now.getTime();
  const fetchedAtMilliseconds = Date.parse(sourceSnapshot.fetchedAt);
  const ageSeconds = Math.max(
    0,
    Math.floor((nowMilliseconds - fetchedAtMilliseconds) / 1_000),
  );

  return {
    status: "ready",
    generatedAt: now.toISOString(),
    freshness: {
      state: freshnessState,
      fetchedAt: sourceSnapshot.fetchedAt,
      ageSeconds,
    },
    ...buildForecastSeries(sourceSnapshot.observations, now),
    current: sanitizeCurrentState(sourceSnapshot.current, nowMilliseconds),
    source: {
      ...FINGRID_FORECAST_SOURCE,
      datasets: { ...FINGRID_FORECAST_SOURCE.datasets },
    },
  };
}

export async function getElectricityForecast(
  now = new Date(),
): Promise<ElectricityForecastResult> {
  const nowMilliseconds = now.getTime();
  if (!Number.isFinite(nowMilliseconds)) {
    return unavailableResult("source-unavailable", REQUEST_MESSAGE);
  }

  try {
    const snapshot = await getCachedFingridSnapshot();
    latestSuccessfulSnapshot = snapshot;
    const age = nowMilliseconds - Date.parse(snapshot.fetchedAt);
    if (age > MAX_STALE_MILLISECONDS) {
      return unavailableResult("snapshot-expired", EXPIRED_MESSAGE);
    }
    return buildSnapshot(
      snapshot,
      now,
      age > SOURCE_CACHE_SECONDS * 1_000 ? "stale" : "fresh",
    );
  } catch (error) {
    if (latestSuccessfulSnapshot) {
      const age =
        nowMilliseconds - Date.parse(latestSuccessfulSnapshot.fetchedAt);
      if (age >= 0 && age <= MAX_STALE_MILLISECONDS) {
        return buildSnapshot(latestSuccessfulSnapshot, now, "stale");
      }
      if (age > MAX_STALE_MILLISECONDS) {
        return unavailableResult("snapshot-expired", EXPIRED_MESSAGE);
      }
    }

    if (error instanceof FingridRefreshError) {
      return unavailableResult(
        mapUnavailableReason(error.reason),
        error.message,
      );
    }
    return unavailableResult("source-unavailable", REQUEST_MESSAGE);
  }
}
