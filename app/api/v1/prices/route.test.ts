import { afterEach, describe, expect, it, vi } from "vitest";
import type { PriceApiResponse } from "../../../../lib/price-api";
import { getPriceApiData } from "../../../../lib/price-source";
import { GET } from "./route";

vi.mock("../../../../lib/price-source", () => ({
  getPriceApiData: vi.fn(),
}));

const getPriceApiDataMock = vi.mocked(getPriceApiData);

const readyResponse: PriceApiResponse = {
  status: "complete",
  timezone: "Europe/Helsinki",
  horizon: {
    name: "today",
    date: "2026-08-22",
    startAt: "2026-08-21T21:00:00.000Z",
    endAt: "2026-08-22T21:00:00.000Z",
  },
  fetchedAt: "2026-08-22T12:10:00.000Z",
  pricing: {
    unit: "cents-per-kwh",
    currency: "EUR",
    vatIncluded: true,
    vatRate: 0.255,
  },
  current: { quarterHour: null, hour: null },
  intervals: { quarterHour: [], hourly: [] },
  missing: [],
  source: {
    name: "ENTSO-E",
    pricesUrl: "https://transparency.entsoe.eu/",
    apiUrl: "https://web-api.tp.entsoe.eu/api",
    documentationUrl:
      "https://transparency.entsoe.eu/content/static_content/download?path=%2FStatic+content%2Fweb+api%2FRestfulAPI_IG.pdf",
  },
};

afterEach(() => vi.resetAllMocks());

describe("GET /api/v1/prices", () => {
  it("defaults to today and returns the shared API projection", async () => {
    getPriceApiDataMock.mockResolvedValue({
      status: "ready",
      data: readyResponse,
    });

    const response = await GET(
      new Request("http://localhost/api/v1/prices"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(readyResponse);
    expect(getPriceApiDataMock).toHaveBeenCalledWith(
      "today",
      expect.any(Date),
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("passes the tomorrow horizon to the shared service", async () => {
    const tomorrowResponse = {
      ...readyResponse,
      horizon: { ...readyResponse.horizon, name: "tomorrow" as const },
    };
    getPriceApiDataMock.mockResolvedValue({
      status: "ready",
      data: tomorrowResponse,
    });

    const response = await GET(
      new Request("http://localhost/api/v1/prices?horizon=tomorrow"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(tomorrowResponse);
    expect(getPriceApiDataMock).toHaveBeenCalledWith(
      "tomorrow",
      expect.any(Date),
    );
  });

  it("rejects unsupported horizons with a stable JSON error", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/prices?horizon=next-24h"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "invalid_horizon",
        message: "The horizon must be today or tomorrow.",
      },
    });
    expect(getPriceApiDataMock).not.toHaveBeenCalled();
  });

  it("returns a non-cacheable source error without leaking diagnostics", async () => {
    getPriceApiDataMock.mockResolvedValue({
      status: "unavailable",
      message: "ENTSOE_TOKEN=secret-value",
    });

    const response = await GET(
      new Request("http://localhost/api/v1/prices"),
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "source_unavailable",
        message: "Price data is currently unavailable.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret-value");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a generic 500 error when the shared service throws unexpectedly", async () => {
    getPriceApiDataMock.mockRejectedValue(new Error("unexpected failure"));

    const response = await GET(
      new Request("http://localhost/api/v1/prices"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "internal_error",
        message: "The price service failed unexpectedly.",
      },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
