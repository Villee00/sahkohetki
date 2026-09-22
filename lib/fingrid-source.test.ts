import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchFingridObservations,
  FINGRID_DATASET_IDS,
  getElectricityForecast,
} from "./fingrid-source";

const serverBoundary = vi.hoisted(() => ({
  imported: false,
  cacheKey: [] as string[],
  cacheRevalidate: undefined as number | undefined,
  entries: new Map<string, { cachedAt: number; value: unknown }>(),
}));

vi.mock("server-only", () => {
  serverBoundary.imported = true;
  return {};
});

vi.mock("next/cache", () => ({
  unstable_cache: <T>(
    loader: () => Promise<T>,
    keyParts: string[],
    options?: { revalidate?: number },
  ) => {
    serverBoundary.cacheKey = keyParts;
    serverBoundary.cacheRevalidate = options?.revalidate;
    return async () => {
      const key = keyParts.join("|");
      const cached = serverBoundary.entries.get(key);
      if (
        cached &&
        (options?.revalidate === undefined ||
          Date.now() - cached.cachedAt < options.revalidate * 1_000)
      ) {
        return cached.value as T;
      }

      const value = await loader();
      serverBoundary.entries.set(key, { cachedAt: Date.now(), value });
      return value;
    };
  },
}));

type FingridRow = {
  datasetId: number | string;
  startTime: string;
  endTime: string;
  value: number | string;
  modifiedAt?: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function row(
  datasetId: number,
  startTime: string,
  value: number,
  durationMinutes = 15,
): FingridRow {
  return {
    datasetId,
    startTime,
    endTime: new Date(
      Date.parse(startTime) + durationMinutes * 60 * 1_000,
    ).toISOString(),
    value,
    modifiedAt: "2026-09-22T12:00:30.000Z",
  };
}

function instantRow(
  datasetId: number,
  observedAt: string,
  value: number,
): FingridRow {
  return {
    datasetId,
    startTime: observedAt,
    endTime: observedAt,
    value,
    modifiedAt: observedAt,
  };
}

const COMPLETE_ROWS: FingridRow[] = [
  row(241, "2026-09-22T12:00:00.000Z", 9_000),
  row(166, "2026-09-22T12:00:00.000Z", 10_000),
  row(245, "2026-09-22T12:00:00.000Z", 2_500),
  row(248, "2026-09-22T12:00:00.000Z", 700),
  row(268, "2026-09-22T12:00:00.000Z", 8_000, 60),
  row(267, "2026-09-22T12:00:00.000Z", 1_400, 60),
  instantRow(192, "2026-09-22T11:58:00.000Z", 8_850),
  instantRow(193, "2026-09-22T11:58:00.000Z", 10_100),
  instantRow(194, "2026-09-22T11:58:00.000Z", -1_250),
  instantRow(336, "2026-09-22T11:57:00.000Z", 1),
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  serverBoundary.entries.clear();
});

describe("Fingrid forecast source", () => {
  it("is server-only and caches source snapshots for three minutes", () => {
    expect(serverBoundary.imported).toBe(true);
    expect(serverBoundary.cacheKey).toEqual([
      "sahkohetki-fingrid-electricity-forecast-v1",
    ]);
    expect(serverBoundary.cacheRevalidate).toBe(3 * 60);
  });

  it("requests all ten datasets once with the API key only in the header", async () => {
    vi.stubEnv("FINGRID_API_KEY", "test-key");
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: COMPLETE_ROWS }));

    const result = await fetchFingridObservations(
      fetchImpl,
      new Date("2026-09-22T12:02:00.000Z"),
    );

    expect(result.status).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [requestInput, requestInit] = fetchImpl.mock.calls[0];
    const requestUrl = new URL(String(requestInput));
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://data.fingrid.fi/api/data",
    );
    expect(requestUrl.searchParams.getAll("datasets")).toEqual(
      Object.values(FINGRID_DATASET_IDS).map(String),
    );
    expect(requestUrl.searchParams.get("startTime")).toBe(
      "2026-09-22T11:00:00.000Z",
    );
    expect(requestUrl.searchParams.get("endTime")).toBe(
      "2026-09-25T12:00:00.000Z",
    );
    expect(requestUrl.searchParams.get("oneRowPerTimePeriod")).toBe("false");
    expect(requestUrl.searchParams.get("pageSize")).toBe("20000");
    expect(requestUrl.searchParams.has("sortBy")).toBe(false);
    expect(requestUrl.searchParams.has("sortOrder")).toBe(false);
    expect(requestUrl.searchParams.has("apiKey")).toBe(false);
    expect(requestInit).toMatchObject({
      cache: "no-store",
      headers: { "x-api-key": "test-key" },
    });
  });

  it("parses forecasts, model capacities, current readings, and import sign", async () => {
    vi.stubEnv("FINGRID_API_KEY", "test-key");

    const result = await fetchFingridObservations(
      vi.fn().mockResolvedValue(jsonResponse({ data: COMPLETE_ROWS })),
      new Date("2026-09-22T12:02:00.000Z"),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.message);
    expect(result.observations).toEqual(
      expect.arrayContaining([
        {
          series: "production",
          startAt: "2026-09-22T12:00:00.000Z",
          endAt: "2026-09-22T12:15:00.000Z",
          valueMw: 9_000,
        },
        expect.objectContaining({ series: "consumption", valueMw: 10_000 }),
        expect.objectContaining({ series: "wind", valueMw: 2_500 }),
        expect.objectContaining({ series: "solar", valueMw: 700 }),
        expect.objectContaining({ series: "windCapacity", valueMw: 8_000 }),
        expect.objectContaining({ series: "solarCapacity", valueMw: 1_400 }),
      ]),
    );
    expect(result.current).toEqual({
      production: {
        valueMw: 8_850,
        observedAt: "2026-09-22T11:58:00.000Z",
      },
      consumption: {
        valueMw: 10_100,
        observedAt: "2026-09-22T11:58:00.000Z",
      },
      netImport: {
        valueMw: 1_250,
        observedAt: "2026-09-22T11:58:00.000Z",
      },
      shortageStatus: {
        code: 1,
        level: "shortage-possible",
        observedAt: "2026-09-22T11:57:00.000Z",
      },
    });
  });

  it("keeps valid partial data while discarding malformed rows", async () => {
    vi.stubEnv("FINGRID_API_KEY", "test-key");
    const malformedConsumption = {
      ...row(166, "2026-09-22T12:00:00.000Z", 10_000),
      value: "not-a-number",
    };

    const result = await fetchFingridObservations(
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            row(241, "2026-09-22T12:00:00.000Z", 9_000),
            malformedConsumption,
          ],
        }),
      ),
      new Date("2026-09-22T12:02:00.000Z"),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.message);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].series).toBe("production");
  });

  it("hides current values older than ten minutes without losing forecasts", async () => {
    vi.stubEnv("FINGRID_API_KEY", "test-key");
    const oldCurrentRows = COMPLETE_ROWS.map((sourceRow) =>
      [192, 193, 194, 336].includes(Number(sourceRow.datasetId))
        ? {
            ...sourceRow,
            startTime: "2026-09-22T11:40:00.000Z",
            endTime: "2026-09-22T11:40:00.000Z",
          }
        : sourceRow,
    );

    const result = await fetchFingridObservations(
      vi.fn().mockResolvedValue(jsonResponse({ data: oldCurrentRows })),
      new Date("2026-09-22T12:02:00.000Z"),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.message);
    expect(result.observations.length).toBeGreaterThan(0);
    expect(result.current).toEqual({
      production: null,
      consumption: null,
      netImport: null,
      shortageStatus: null,
    });
  });

  it("fails closed for missing configuration, HTTP errors, and malformed bodies", async () => {
    vi.stubEnv("FINGRID_API_KEY", "");
    const missingKeyFetch = vi.fn();
    await expect(
      fetchFingridObservations(
        missingKeyFetch,
        new Date("2026-09-22T12:02:00.000Z"),
      ),
    ).resolves.toMatchObject({ status: "unavailable", reason: "configuration" });
    expect(missingKeyFetch).not.toHaveBeenCalled();

    vi.stubEnv("FINGRID_API_KEY", "test-key");
    await expect(
      fetchFingridObservations(
        vi.fn().mockResolvedValue(jsonResponse({ message: "down" }, 503)),
        new Date("2026-09-22T12:02:00.000Z"),
      ),
    ).resolves.toMatchObject({ status: "unavailable", reason: "request" });
    await expect(
      fetchFingridObservations(
        vi.fn().mockRejectedValue(new Error("network down")),
        new Date("2026-09-22T12:02:00.000Z"),
      ),
    ).resolves.toMatchObject({ status: "unavailable", reason: "request" });
    await expect(
      fetchFingridObservations(
        vi.fn().mockResolvedValue(jsonResponse({ data: "wrong" })),
        new Date("2026-09-22T12:02:00.000Z"),
      ),
    ).resolves.toMatchObject({ status: "unavailable", reason: "schema" });
    await expect(
      fetchFingridObservations(
        vi.fn().mockResolvedValue(jsonResponse({ data: [{ nonsense: true }] })),
        new Date("2026-09-22T12:02:00.000Z"),
      ),
    ).resolves.toMatchObject({ status: "unavailable", reason: "schema" });
  });

  it("serves a failed refresh as stale for 30 minutes, then expires it", async () => {
    vi.stubEnv("FINGRID_API_KEY", "test-key");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:02:00.000Z"));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: COMPLETE_ROWS }))
      .mockResolvedValue(jsonResponse({ message: "down" }, 503));
    vi.stubGlobal("fetch", fetchImpl);

    const fresh = await getElectricityForecast(
      new Date("2026-09-22T12:02:00.000Z"),
    );
    expect(fresh).toMatchObject({
      status: "ready",
      freshness: { state: "fresh", ageSeconds: 0 },
      current: { netImport: { valueMw: 1_250 } },
    });

    vi.advanceTimersByTime(4 * 60 * 1_000);
    const stale = await getElectricityForecast(
      new Date("2026-09-22T12:06:00.000Z"),
    );
    expect(stale).toMatchObject({
      status: "ready",
      freshness: { state: "stale", ageSeconds: 4 * 60 },
    });

    vi.advanceTimersByTime(27 * 60 * 1_000);
    const expired = await getElectricityForecast(
      new Date("2026-09-22T12:33:00.000Z"),
    );
    expect(expired).toMatchObject({
      status: "unavailable",
      reason: "snapshot-expired",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
