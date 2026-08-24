import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLatestPrices, getExplorerData } from "./price-source";

const serverOnlyBoundary = vi.hoisted(() => ({ imported: false }));

vi.mock("server-only", () => {
  serverOnlyBoundary.imported = true;
  return {};
});

vi.mock("next/cache", () => ({
  unstable_cache: (loader: () => Promise<unknown>) => loader,
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

  it("requests Finnish day-ahead prices and converts EUR/MWh to cents per kWh", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "test-token");
    const fetchImpl = vi.fn().mockResolvedValue(response(ENTSOE_XML));

    const result = await fetchLatestPrices(
      fetchImpl,
      new Date("2026-08-24T12:30:00.000Z"),
    );

    expect(result).toEqual({
      status: "ready",
      prices: [
        {
          id: String(Date.parse("2026-08-23T21:00:00.000Z")),
          startAt: "2026-08-23T21:00:00.000Z",
          endAt: "2026-08-23T21:15:00.000Z",
          priceCentsPerKwh: 2.5,
        },
        {
          id: String(Date.parse("2026-08-23T21:15:00.000Z")),
          startAt: "2026-08-23T21:15:00.000Z",
          endAt: "2026-08-23T21:30:00.000Z",
          priceCentsPerKwh: -0.55,
        },
        {
          id: String(Date.parse("2026-08-23T21:45:00.000Z")),
          startAt: "2026-08-23T21:45:00.000Z",
          endAt: "2026-08-23T22:00:00.000Z",
          priceCentsPerKwh: 14,
        },
      ],
    });

    const request = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(request.origin + request.pathname).toBe(
      "https://web-api.tp.entsoe.eu/api",
    );
    expect(request.searchParams.get("documentType")).toBe("A44");
    expect(request.searchParams.get("in_Domain")).toBe("10YFI-1--------U");
    expect(request.searchParams.get("out_Domain")).toBe("10YFI-1--------U");
    expect(request.searchParams.get("securityToken")).toBe("test-token");
    expect(request.searchParams.get("periodStart")).toMatch(/^\d{12}$/);
    expect(request.searchParams.get("periodEnd")).toMatch(/^\d{12}$/);
    expect(fetchImpl).toHaveBeenCalledWith(request.toString(), {
      cache: "no-store",
    });
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
