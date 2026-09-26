import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchHistoryMonth,
  getHistoricalPrices,
  getHistoryPageData,
} from "./history-source";

const cacheBoundary = vi.hoisted(() => ({
  entries: new Map<string, unknown>(),
  definitions: [] as Array<{ key: string[]; revalidate?: number }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (
    loader: () => Promise<unknown>,
    key: string[],
    options?: { revalidate?: number },
  ) => {
    cacheBoundary.definitions.push({ key, revalidate: options?.revalidate });
    return async () => {
      const cacheKey = key.join("|");
      if (cacheBoundary.entries.has(cacheKey)) {
        return cacheBoundary.entries.get(cacheKey);
      }
      const value = await loader();
      cacheBoundary.entries.set(cacheKey, value);
      return value;
    };
  },
}));

function publicationXml(price = 20): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <Publication_MarketDocument>
    <mRID>history-document</mRID><revisionNumber>1</revisionNumber>
    <createdDateTime>2026-01-02T00:00:00Z</createdDateTime><type>A44</type>
    <process.processType>A01</process.processType>
    <TimeSeries><mRID>history-series</mRID>
      <contract_MarketAgreement.type>A01</contract_MarketAgreement.type>
      <in_Domain.mRID>10YFI-1--------U</in_Domain.mRID>
      <out_Domain.mRID>10YFI-1--------U</out_Domain.mRID>
      <currency_Unit.name>EUR</currency_Unit.name>
      <price_Measure_Unit.name>MWH</price_Measure_Unit.name>
      <Period><timeInterval><start>2026-01-01T00:00Z</start><end>2026-01-01T01:00Z</end></timeInterval>
        <resolution>PT60M</resolution><Point><position>1</position><price.amount>${price}</price.amount></Point>
      </Period>
    </TimeSeries>
  </Publication_MarketDocument>`;
}

function acknowledgement(text: string): string {
  return `<Acknowledgement_MarketDocument><Reason><code>999</code><text>${text}</text></Reason></Acknowledgement_MarketDocument>`;
}

function response(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/xml" },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  cacheBoundary.entries.clear();
  cacheBoundary.definitions.length = 0;
});

describe("historical ENTSO-E source", () => {
  it("requests one Finnish calendar month in UTC with the day-ahead contract", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "secret");
    const fetchImpl = vi.fn().mockResolvedValue(response(publicationXml()));

    const result = await fetchHistoryMonth("2026-01", fetchImpl);

    expect(result.status).toBe("ready");
    const request = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(request.searchParams.get("documentType")).toBe("A44");
    expect(request.searchParams.get("contract_MarketAgreement.type")).toBe("A01");
    expect(request.searchParams.get("in_Domain")).toBe("10YFI-1--------U");
    expect(request.searchParams.get("out_Domain")).toBe("10YFI-1--------U");
    expect(request.searchParams.get("periodStart")).toBe("202512312200");
    expect(request.searchParams.get("periodEnd")).toBe("202601312200");
    expect(request.searchParams.has("offset")).toBe(false);
    expect(request.searchParams.get("securityToken")).toBe("secret");
    expect(fetchImpl).toHaveBeenCalledWith(request.toString(), { cache: "no-store" });
  });

  it("uses offset pages after an oversized acknowledgement until no data remains", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "secret");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(acknowledgement("More than 200 matching documents")))
      .mockResolvedValueOnce(response(publicationXml()))
      .mockResolvedValueOnce(response(acknowledgement("No matching data found")));

    const result = await fetchHistoryMonth("2026-01", fetchImpl);

    expect(result.status).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(new URL(String(fetchImpl.mock.calls[1]?.[0])).searchParams.get("offset"))
      .toBe("0");
    expect(new URL(String(fetchImpl.mock.calls[2]?.[0])).searchParams.get("offset"))
      .toBe("200");
  });

  it("retains fetched offset pages when a later page fails", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "secret");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(acknowledgement("More than 200 matching documents")),
      )
      .mockResolvedValueOnce(response(publicationXml()))
      .mockResolvedValueOnce(response("limited", 429));

    const result = await fetchHistoryMonth("2026-01", fetchImpl);

    expect(result).toMatchObject({
      status: "partial",
      reason: "rate-limit",
      intervals: [expect.objectContaining({ priceEurPerMwh: 20 })],
    });
  });

  it("turns response-body read failures into a typed request failure", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "secret");
    const brokenResponse = {
      ok: true,
      status: 200,
      text: vi.fn().mockRejectedValue(new Error("stream failed")),
    } as unknown as Response;

    await expect(
      fetchHistoryMonth(
        "2026-01",
        vi.fn().mockResolvedValue(brokenResponse),
      ),
    ).resolves.toMatchObject({ status: "unavailable", reason: "request" });
  });

  it("classifies missing credentials, acknowledgements, and rate limits", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "");
    const unusedFetch = vi.fn();
    await expect(fetchHistoryMonth("2026-01", unusedFetch)).resolves.toMatchObject({
      status: "unavailable",
      reason: "configuration",
    });
    expect(unusedFetch).not.toHaveBeenCalled();

    vi.stubEnv("ENTSOE_TOKEN", "secret");
    await expect(
      fetchHistoryMonth(
        "2026-01",
        vi.fn().mockResolvedValue(response(acknowledgement("Rejected request"))),
      ),
    ).resolves.toMatchObject({ status: "unavailable", reason: "acknowledgement" });
    await expect(
      fetchHistoryMonth(
        "2026-01",
        vi.fn().mockResolvedValue(response("limited", 429)),
      ),
    ).resolves.toMatchObject({ status: "unavailable", reason: "rate-limit" });
  });

  it("uses 30-day closed-month caches and a six-hour current-month cache", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(publicationXml())));

    await getHistoricalPrices(new Date("2026-09-20T12:00:00.000Z"));

    expect(cacheBoundary.definitions).toHaveLength(14);
    expect(cacheBoundary.definitions).toContainEqual({
      key: ["sahkohetki-history-v1", "2026-09", "current"],
      revalidate: 6 * 60 * 60,
    });
    expect(cacheBoundary.definitions).toContainEqual({
      key: ["sahkohetki-history-v1", "2025-08", "closed"],
      revalidate: 30 * 24 * 60 * 60,
    });
  });

  it("returns partial data and names a failed month without hiding successful months", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "secret");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const request = new URL(String(input));
      return request.searchParams.get("periodStart") === "202602282200"
        ? response("limited", 429)
        : response(publicationXml());
    });

    const result = await getHistoricalPrices(
      new Date("2026-09-20T12:00:00.000Z"),
      fetchImpl,
    );

    expect(result.status).toBe("partial");
    if (result.status === "unavailable") throw new Error(result.message);
    expect(result.intervals).toHaveLength(1);
    expect(result.missingRanges).toContainEqual({
      startDateKey: "2026-03-01",
      endDateKey: "2026-03-31",
      reason: "rate-limit",
    });
  });

  it("marks sparse successful responses partial and reports complete-day availability", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "secret");
    const completeFinnishDay = publicationXml()
      .replace("2026-01-01T00:00Z", "2025-12-31T22:00Z")
      .replace("2026-01-01T01:00Z", "2026-01-01T22:00Z");

    const result = await getHistoricalPrices(
      new Date("2026-01-03T12:00:00.000Z"),
      vi.fn().mockImplementation(async () => response(completeFinnishDay)),
    );

    expect(result).toMatchObject({
      status: "partial",
      availableRange: {
        startDateKey: "2026-01-01",
        endDateKey: "2026-01-01",
      },
    });
    expect(result.missingRanges).toEqual([
      {
        startDateKey: "2024-12-01",
        endDateKey: "2025-12-31",
        reason: "no-data",
      },
      {
        startDateKey: "2026-01-02",
        endDateKey: "2026-01-02",
        reason: "no-data",
      },
    ]);
  });

  it("keeps incomplete pagination data out of page analytics", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "secret");
    const completeFinnishDay = publicationXml()
      .replace("2026-01-01T00:00Z", "2025-12-31T22:00Z")
      .replace("2026-01-01T01:00Z", "2026-01-01T22:00Z");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const offset = new URL(String(input)).searchParams.get("offset");
      if (offset === null) {
        return response(acknowledgement("More than 200 matching documents"));
      }
      return offset === "0"
        ? response(completeFinnishDay)
        : response("limited", 429);
    });

    const data = await getHistoryPageData(
      new Date("2026-01-03T12:00:00.000Z"),
      fetchImpl,
    );

    expect(data.status).toBe("partial");
    expect(data.periods.day).toEqual([]);
    expect(data.days.find((day) => day.dateKey === "2026-01-01")).toMatchObject(
      { complete: false, average: null },
    );
  });

  it("projects unavailable source state into an empty Finnish page payload", async () => {
    vi.stubEnv("ENTSOE_TOKEN", "");

    const data = await getHistoryPageData(
      new Date("2026-09-20T12:00:00.000Z"),
      vi.fn(),
    );

    expect(data).toMatchObject({
      status: "unavailable",
      fetchedAt: null,
      days: [],
      periods: { day: [], week: [], month: [] },
      requestedRange: {
        startDateKey: "2025-08-01",
        endDateKey: "2026-09-19",
      },
    });
    expect(data.message).toMatch(/käyttöoikeus/i);
  });

  it("serves synthetic recent history without credentials or network calls", async () => {
    vi.stubEnv("SAHKO_MOCK_DATA", "1");
    vi.stubEnv("ENTSOE_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const data = await getHistoryPageData(new Date("2026-09-20T12:00:00.000Z"));

    expect(data).toMatchObject({
      status: "ready",
      source: { name: "Synteettinen esimerkkidata" },
      requestedRange: {
        startDateKey: "2025-08-01",
        endDateKey: "2026-09-19",
      },
    });
    expect(data.days.length).toBeGreaterThan(300);
    expect(data.days.at(-1)).toMatchObject({ complete: true });
    expect(data.periods.month.length).toBeGreaterThan(10);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
