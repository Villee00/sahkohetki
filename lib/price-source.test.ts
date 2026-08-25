import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLatestPrices, getExplorerData } from "./price-source";

const serverOnlyBoundary = vi.hoisted(() => ({
  imported: false,
  cacheKey: [] as string[],
}));

vi.mock("server-only", () => {
  serverOnlyBoundary.imported = true;
  return {};
});

vi.mock("next/cache", () => ({
  unstable_cache: (
    loader: () => Promise<unknown>,
    keyParts: string[],
  ) => {
    serverOnlyBoundary.cacheKey = keyParts;
    return loader;
  },
}));

const ENTSOE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Publication_MarketDocument xmlns="urn:iec62325.351:tc57wg16:451-3:publicationdocument:7:3">
  <type>A44</type>
  <TimeSeries>
    <in_Domain.mRID codingScheme="A01">10YFI-1--------U</in_Domain.mRID>
    <out_Domain.mRID codingScheme="A01">10YFI-1--------U</out_Domain.mRID>
    <currency_Unit.name>EUR</currency_Unit.name>
    <price_Measure_Unit.name>MWH</price_Measure_Unit.name>
    <Period>
      <timeInterval>
        <start>2026-08-23T21:00Z</start>
        <end>2026-08-23T22:00Z</end>
      </timeInterval>
      <resolution>PT15M</resolution>
      <Point>
        <position>1</position>
        <price.amount>25</price.amount>
      </Point>
      <Point>
        <position>2</position>
        <price.amount>-5.5</price.amount>
      </Point>
      <Point>
        <position>4</position>
        <price.amount>140</price.amount>
      </Point>
    </Period>
  </TimeSeries>
</Publication_MarketDocument>`;

const ENTSOE_A03_XML = ENTSOE_XML.replace(
  "    <Period>",
  "    <Period>\n      <curveType>A03</curveType>",
);

const ENTSOE_DISJOINT_XML = ENTSOE_XML.replace(
  "  </TimeSeries>",
  `    <Period>
      <timeInterval>
        <start>2026-08-23T22:30Z</start>
        <end>2026-08-23T23:00Z</end>
      </timeInterval>
      <resolution>PT15M</resolution>
      <Point>
        <position>1</position>
        <price.amount>10</price.amount>
      </Point>
      <Point>
        <position>2</position>
        <price.amount>20</price.amount>
      </Point>
    </Period>
  </TimeSeries>`,
);

function response(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/xml" },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ENTSO-E source adapter", () => {
  it("declares the source adapter as server-only", () => {
    expect(serverOnlyBoundary.imported).toBe(true);
  });

  it("uses a cache namespace for VAT-inclusive ENTSO-E prices", () => {
    expect(serverOnlyBoundary.cacheKey).toEqual([
      "sahkohetki-entsoe-latest-prices-vat-inclusive-v1",
    ]);
  });

  it("requests Finnish day-ahead prices and converts EUR/MWh to VAT-inclusive cents per kWh", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "test-token");
    const fetchImpl = vi.fn().mockResolvedValue(response(ENTSOE_XML));

    const result = await fetchLatestPrices(
      fetchImpl,
      new Date("2026-08-24T12:30:00.000Z"),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.message);
    expect(result.prices).toHaveLength(4);
    expect(result.prices[0]).toMatchObject({
      id: String(Date.parse("2026-08-23T21:00:00.000Z")),
      startAt: "2026-08-23T21:00:00.000Z",
      endAt: "2026-08-23T21:15:00.000Z",
    });
    expect(result.prices[0].priceCentsPerKwh).toBeCloseTo(3.1375, 10);
    expect(result.prices[1]).toMatchObject({
      id: String(Date.parse("2026-08-23T21:15:00.000Z")),
      startAt: "2026-08-23T21:15:00.000Z",
      endAt: "2026-08-23T21:30:00.000Z",
    });
    expect(result.prices[1].priceCentsPerKwh).toBeCloseTo(-0.69025, 10);
    expect(result.prices[2]).toMatchObject({
      id: String(Date.parse("2026-08-23T21:30:00.000Z")),
      startAt: "2026-08-23T21:30:00.000Z",
      endAt: "2026-08-23T21:45:00.000Z",
    });
    expect(result.prices[2].priceCentsPerKwh).toBeCloseTo(-0.69025, 10);
    expect(result.prices[2]).toHaveProperty("carriedForward", true);
    expect(result.prices[3]).toMatchObject({
      id: String(Date.parse("2026-08-23T21:45:00.000Z")),
      startAt: "2026-08-23T21:45:00.000Z",
      endAt: "2026-08-23T22:00:00.000Z",
    });
    expect(result.prices[3].priceCentsPerKwh).toBeCloseTo(17.57, 10);

    const request = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(request.origin + request.pathname).toBe(
      "https://web-api.tp.entsoe.eu/api",
    );
    expect(request.searchParams.get("documentType")).toBe("A44");
    expect(request.searchParams.get("in_Domain")).toBe("10YFI-1--------U");
    expect(request.searchParams.get("out_Domain")).toBe("10YFI-1--------U");
    expect(request.searchParams.get("contract_MarketAgreement.type")).toBe("A01");
    expect(request.searchParams.get("securityToken")).toBe("test-token");
    expect(request.searchParams.get("periodStart")).toMatch(/^\d{12}$/);
    expect(request.searchParams.get("periodEnd")).toMatch(/^\d{12}$/);
    expect(fetchImpl).toHaveBeenCalledWith(request.toString(), {
      cache: "no-store",
    });
  });

  it("expands A03 blocks across the quarter-hours until the next position", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "test-token");
    const fetchImpl = vi.fn().mockResolvedValue(response(ENTSOE_A03_XML));

    const result = await fetchLatestPrices(
      fetchImpl,
      new Date("2026-08-24T12:30:00.000Z"),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.message);
    expect(result.prices).toHaveLength(4);
    expect(result.prices.map((price) => price.startAt)).toEqual([
      "2026-08-23T21:00:00.000Z",
      "2026-08-23T21:15:00.000Z",
      "2026-08-23T21:30:00.000Z",
      "2026-08-23T21:45:00.000Z",
    ]);
    expect(result.prices[0].priceCentsPerKwh).toBeCloseTo(3.1375, 10);
    expect(result.prices[1].priceCentsPerKwh).toBeCloseTo(-0.69025, 10);
    expect(result.prices[2].priceCentsPerKwh).toBeCloseTo(-0.69025, 10);
    expect(result.prices[3].priceCentsPerKwh).toBeCloseTo(17.57, 10);
  });

  it("carries the last price across a gap between published periods", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "test-token");
    const fetchImpl = vi.fn().mockResolvedValue(response(ENTSOE_DISJOINT_XML));

    const result = await fetchLatestPrices(
      fetchImpl,
      new Date("2026-08-24T12:30:00.000Z"),
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.message);
    expect(result.prices).toHaveLength(8);
    expect(result.prices[4].startAt).toBe("2026-08-23T22:00:00.000Z");
    expect(result.prices[5].startAt).toBe("2026-08-23T22:15:00.000Z");
    expect(result.prices[4].priceCentsPerKwh).toBeCloseTo(17.57, 10);
    expect(result.prices[5].priceCentsPerKwh).toBeCloseTo(17.57, 10);
    expect(result.prices[4]).toHaveProperty("carriedForward", true);
    expect(result.prices[5]).toHaveProperty("carriedForward", true);
    expect(result.prices[6]).not.toHaveProperty("carriedForward", true);
  });

  it("does not call ENTSO-E when the access token is missing", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "");
    const fetchImpl = vi.fn();

    await expect(
      fetchLatestPrices(fetchImpl, new Date("2026-08-24T12:30:00.000Z")),
    ).resolves.toMatchObject({ status: "unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns an unavailable result for HTTP, XML, or schema failures", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "test-token");

    await expect(
      fetchLatestPrices(
        vi.fn().mockResolvedValue(response("down", 503)),
        new Date("2026-08-24T12:30:00.000Z"),
      ),
    ).resolves.toMatchObject({ status: "unavailable" });

    await expect(
      fetchLatestPrices(
        vi.fn().mockResolvedValue(response("<broken")),
        new Date("2026-08-24T12:30:00.000Z"),
      ),
    ).resolves.toMatchObject({ status: "unavailable" });

    await expect(
      fetchLatestPrices(
        vi.fn().mockResolvedValue(
          response(
            `<Publication_MarketDocument><type>A44</type></Publication_MarketDocument>`,
          ),
        ),
        new Date("2026-08-24T12:30:00.000Z"),
      ),
    ).resolves.toMatchObject({ status: "unavailable" });
  });

  it("fails closed for rejected requests and unsupported price periods", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "test-token");
    const unsupportedResolution = ENTSOE_XML.replace("PT15M", "PT60M");

    await expect(
      fetchLatestPrices(
        vi.fn().mockRejectedValue(new Error("network down")),
        new Date("2026-08-24T12:30:00.000Z"),
      ),
    ).resolves.toMatchObject({ status: "unavailable" });

    await expect(
      fetchLatestPrices(
        vi.fn().mockResolvedValue(response(unsupportedResolution)),
        new Date("2026-08-24T12:30:00.000Z"),
      ),
    ).resolves.toMatchObject({ status: "unavailable" });
  });

  it("returns a Finnish unavailable dataset when the cached source is unavailable", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response("down", 503)),
    );

    const result = await getExplorerData(new Date("2026-08-24T10:00:00.000Z"));

    expect(result).toMatchObject({
      status: "unavailable",
      fetchedAt: null,
      source: {
        name: "ENTSO-E",
        pricesUrl: "https://transparency.entsoe.eu/",
        apiUrl: "https://web-api.tp.entsoe.eu/api",
        documentationUrl:
          "https://transparency.entsoe.eu/content/static_content/download?path=%2FStatic+content%2Fweb+api%2FRestfulAPI_IG.pdf",
      },
      currentQuarterId: null,
      currentHourId: null,
      today: { hourly: [], quarterHour: [] },
      tomorrow: { hourly: [], quarterHour: [] },
    });
    expect(result.message).toMatch(/saatavilla|varmistaa/i);
    expect(result.uses).toHaveLength(10);
  });
});
