import type { MarketPriceInterval } from "./entsoe-prices";
import { buildForecastSeries } from "./forecast-domain";
import type {
  CurrentElectricityState,
  ElectricityForecastResult,
  ForecastObservation,
  ForecastSourceMetadata,
} from "./forecast-types";
import type { HistoryLoadResult } from "./history-types";
import type { QuarterPrice } from "./price-types";
import { EXPLORER_SOURCE } from "./price-types";
import {
  getHelsinkiDateBounds,
  getHelsinkiDateKey,
  getNextHelsinkiDateKey,
} from "./time";

const QUARTER_MILLISECONDS = 15 * 60 * 1000;
const HOUR_MILLISECONDS = 60 * 60 * 1000;
const MOCK_HISTORY_MONTH_COUNT = 14;

export const MOCK_DATA_SOURCE = {
  ...EXPLORER_SOURCE,
  name: "Synteettinen esimerkkidata",
} as const;

export const MOCK_FORECAST_SOURCE: ForecastSourceMetadata = {
  name: "Synteettinen esimerkkidata",
  homepageUrl: "https://data.fingrid.fi/en",
  apiUrl: "https://data.fingrid.fi/api/data",
  datasets: {
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
  },
  capacityDescription:
    "Wind and solar capacity values are Fingrid forecast-model estimates, not a guarantee of available electricity.",
};

export type MockMunicipalityLocation = {
  municipalityCode: string;
  municipalityName: string;
};

export function isMockDataEnabled(): boolean {
  return (
    process.env.SAHKO_MOCK_DATA === "1" ||
    process.env.SAHKO_MOCK_DATA === "true" ||
    process.env.MOCK_DATA === "1" ||
    process.env.MOCK_DATA === "true" ||
    process.env.MOCK === "1" ||
    process.env.MOCK === "true" ||
    process.env.NEXT_PUBLIC_MOCK_DATA === "1" ||
    process.env.ENTSOE_TOKEN === "mock"
  );
}

export function getMockMunicipalityLocation(
  latitude: number,
  longitude: number,
): MockMunicipalityLocation | null {
  // Approximate Finland bounding box: latitude [59.5, 70.1], longitude [19.0, 31.6]
  if (
    latitude < 59.5 ||
    latitude > 70.1 ||
    longitude < 19.0 ||
    longitude > 31.6
  ) {
    return null;
  }

  if (latitude >= 64.5) {
    return { municipalityCode: "564", municipalityName: "Oulu" };
  }
  if (latitude >= 62.5) {
    return { municipalityCode: "179", municipalityName: "Jyväskylä" };
  }
  if (latitude >= 61.2) {
    return { municipalityCode: "837", municipalityName: "Tampere" };
  }
  if (longitude < 23.0) {
    return { municipalityCode: "853", municipalityName: "Turku" };
  }
  if (longitude > 27.5) {
    return { municipalityCode: "405", municipalityName: "Lappeenranta" };
  }
  return { municipalityCode: "091", municipalityName: "Helsinki" };
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(monthKey: string, months: number): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

function mockQuarterPrice(
  startMilliseconds: number,
  dayStart: number,
  index: number,
): QuarterPrice {
  const hour = Math.floor((startMilliseconds - dayStart) / HOUR_MILLISECONDS);
  const eveningPeak = hour >= 17 && hour <= 20 ? 5 : 0;
  const nightDiscount = hour >= 3 && hour <= 5 ? -6 : 0;
  const dailyWave = 3.5 * Math.sin(((hour - 14) / 24) * Math.PI * 2);
  const priceCentsPerKwh = Number(
    (
      7 +
      dailyWave +
      eveningPeak +
      nightDiscount +
      (index % 4) * 0.08
    ).toFixed(2),
  );

  return {
    id: String(startMilliseconds),
    startAt: new Date(startMilliseconds).toISOString(),
    endAt: new Date(startMilliseconds + QUARTER_MILLISECONDS).toISOString(),
    priceCentsPerKwh,
  };
}

export function getMockQuarterPrices(now: Date): QuarterPrice[] {
  const todayDateKey = getHelsinkiDateKey(now);
  const dateKeys = [todayDateKey, getNextHelsinkiDateKey(todayDateKey)];

  return dateKeys.flatMap((dateKey) => {
    const bounds = getHelsinkiDateBounds(dateKey);
    const dayStart = Date.parse(bounds.startAt);
    const dayEnd = Date.parse(bounds.endAt);
    const prices: QuarterPrice[] = [];
    for (
      let startMilliseconds = dayStart, index = 0;
      startMilliseconds < dayEnd;
      startMilliseconds += QUARTER_MILLISECONDS, index += 1
    ) {
      prices.push(mockQuarterPrice(startMilliseconds, dayStart, index));
    }
    return prices;
  });
}

function mockHistoricalPrice(
  dateKey: string,
  startMilliseconds: number,
  dayStart: number,
  historyStartDateKey: string,
): number {
  const hour = Math.floor((startMilliseconds - dayStart) / HOUR_MILLISECONDS);
  const dayIndex = Math.floor(
    (Date.parse(`${dateKey}T00:00:00.000Z`) -
      Date.parse(`${historyStartDateKey}T00:00:00.000Z`)) /
      (24 * HOUR_MILLISECONDS),
  );
  const eveningPeak = hour >= 17 && hour <= 20 ? 30 : 0;
  const overnightDip = hour >= 4 && hour <= 6 ? -20 : 0;
  const seasonalWave = 22 * Math.sin((dayIndex / 37) * Math.PI * 2);
  const dailyWave = 38 * Math.cos(((hour - 19) / 24) * Math.PI * 2);
  const weekdayOffset =
    new Date(`${dateKey}T00:00:00.000Z`).getUTCDay() === 0 ? -8 : 0;

  return Number(
    (
      43 +
      seasonalWave +
      dailyWave +
      eveningPeak +
      overnightDip +
      weekdayOffset
    ).toFixed(1),
  );
}

export function getMockHistoricalLoad(now: Date): HistoryLoadResult {
  const todayDateKey = getHelsinkiDateKey(now);
  const throughDateKey = addDays(todayDateKey, -1);
  const startMonth = addMonths(
    todayDateKey.slice(0, 7),
    -(MOCK_HISTORY_MONTH_COUNT - 1),
  );
  const startDateKey = `${startMonth}-01`;
  const requestedRange = { startDateKey, endDateKey: throughDateKey };
  const fetchedAt = now.toISOString();
  const intervals: MarketPriceInterval[] = [];

  for (
    let dateKey = startDateKey;
    dateKey <= throughDateKey;
    dateKey = addDays(dateKey, 1)
  ) {
    const bounds = getHelsinkiDateBounds(dateKey);
    const dayStart = Date.parse(bounds.startAt);
    const dayEnd = Date.parse(bounds.endAt);
    for (
      let startMilliseconds = dayStart;
      startMilliseconds < dayEnd;
      startMilliseconds += HOUR_MILLISECONDS
    ) {
      const startAt = new Date(startMilliseconds).toISOString();
      const endAt = new Date(
        startMilliseconds + HOUR_MILLISECONDS,
      ).toISOString();
      intervals.push({
        id: `demo:${startAt}`,
        startAt,
        endAt,
        resolutionMinutes: 60,
        priceEurPerMwh: mockHistoricalPrice(
          dateKey,
          startMilliseconds,
          dayStart,
          startDateKey,
        ),
        documentId: `demo-${dateKey.slice(0, 7)}`,
        documentRevision: 1,
        documentCreatedAt: fetchedAt,
        seriesId: `demo-${dateKey}`,
        processType: "A01",
        contractType: "A01",
        carriedForward: false,
      });
    }
  }

  return {
    status: "ready",
    intervals,
    fetchedAt,
    requestedRange,
    availableRange: requestedRange,
    missingRanges: [],
  };
}

export function getMockElectricityForecast(
  now: Date,
): ElectricityForecastResult {
  const nowMilliseconds = now.getTime();
  const horizonStartMilliseconds =
    Math.floor(nowMilliseconds / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  const horizonEndMilliseconds =
    horizonStartMilliseconds + 72 * HOUR_MILLISECONDS;

  const observations: ForecastObservation[] = [];
  for (
    let startMs = horizonStartMilliseconds;
    startMs < horizonEndMilliseconds;
    startMs += QUARTER_MILLISECONDS
  ) {
    const endMs = startMs + QUARTER_MILLISECONDS;
    const startAt = new Date(startMs).toISOString();
    const endAt = new Date(endMs).toISOString();
    const hour = Math.floor(
      (startMs - horizonStartMilliseconds) / HOUR_MILLISECONDS,
    );
    const dayHour = (new Date(startMs).getUTCHours() + 2) % 24;

    const diurnalCurve = Math.sin(((dayHour - 6) / 24) * Math.PI * 2);
    const prodMw = Math.round(9200 + 1400 * diurnalCurve);
    const consMw = Math.round(8800 + 1600 * diurnalCurve);
    const windMw = Math.round(
      2800 + 1100 * Math.cos((hour / 18) * Math.PI * 2),
    );
    const solarPeak = Math.max(0, Math.sin(((dayHour - 6) / 14) * Math.PI));
    const solarMw =
      dayHour >= 6 && dayHour <= 20 ? Math.round(650 * solarPeak) : 0;

    observations.push(
      { series: "production", startAt, endAt, valueMw: prodMw },
      { series: "consumption", startAt, endAt, valueMw: consMw },
      { series: "wind", startAt, endAt, valueMw: windMw },
      { series: "solar", startAt, endAt, valueMw: solarMw },
      { series: "windCapacity", startAt, endAt, valueMw: 7200 },
      { series: "solarCapacity", startAt, endAt, valueMw: 1200 },
    );
  }

  const current: CurrentElectricityState = {
    production: { valueMw: 9500, observedAt: now.toISOString() },
    consumption: { valueMw: 9100, observedAt: now.toISOString() },
    netImport: { valueMw: -400, observedAt: now.toISOString() },
    shortageStatus: { code: 0, level: "normal", observedAt: now.toISOString() },
  };

  return {
    status: "ready",
    generatedAt: now.toISOString(),
    freshness: {
      state: "fresh",
      fetchedAt: now.toISOString(),
      ageSeconds: 0,
    },
    ...buildForecastSeries(observations, now),
    current,
    source: MOCK_FORECAST_SOURCE,
  };
}
