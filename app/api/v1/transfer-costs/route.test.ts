import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransferCostApiResponse } from "../../../../lib/transfer-api";
import { getTransferCostApiData } from "../../../../lib/transfer-source";
import { GET } from "./route";

vi.mock("../../../../lib/transfer-source", () => ({
  getTransferCostApiData: vi.fn(),
}));

const getTransferCostApiDataMock = vi.mocked(getTransferCostApiData);

const responseBody: TransferCostApiResponse = {
  pricing: {
    currency: "EUR",
    vatIncluded: true,
    energyUnit: "cents-per-kwh",
    fixedFeeUnit: "euros-per-month",
  },
  electricityTax: {
    taxClass: "I",
    centsPerKwhVatIncluded: 2.917875,
    effectiveFrom: "2026-04-01",
    sourceUrl: "https://example.com/tax",
  },
  municipalities: [],
};

afterEach(() => vi.resetAllMocks());

describe("GET /api/v1/transfer-costs", () => {
  it("returns the shared transfer-cost response with public caching", async () => {
    getTransferCostApiDataMock.mockReturnValue(responseBody);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(responseBody);
    expect(getTransferCostApiDataMock).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=3600, stale-while-revalidate=86400",
    );
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns a generic non-cacheable error when the shared service fails", async () => {
    getTransferCostApiDataMock.mockImplementation(() => {
      throw new Error("CSV path leaked");
    });

    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "internal_error",
        message: "Transfer cost data is currently unavailable.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("CSV path leaked");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
