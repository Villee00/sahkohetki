import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLatestPrices, getExplorerData } from "./price-source";

vi.mock("next/cache", () => ({
  unstable_cache: (loader: () => Promise<unknown>) => loader,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Pörssisähkö.net source adapter", () => {
  it("returns source records from a successful response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          prices: [
            {
              price: 4.5,
              startDate: "2026-08-22T10:00:00.000Z",
              endDate: "2026-08-22T10:15:00.000Z",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await fetchLatestPrices(fetchImpl);
    expect(result.status).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.porssisahko.net/v2/latest-prices.json",
      { cache: "no-store" },
    );
  });

  it("returns an explicit unavailable result for HTTP or JSON failures", async () => {
    await expect(
      fetchLatestPrices(vi.fn().mockResolvedValue(new Response("down", { status: 503 }))),
    ).resolves.toMatchObject({ status: "unavailable" });
    await expect(
      fetchLatestPrices(vi.fn().mockResolvedValue(new Response("{", { status: 200 }))),
    ).resolves.toMatchObject({ status: "unavailable" });
  });

  it("fails closed for rejected fetches and invalid source schemas", async () => {
    await expect(
      fetchLatestPrices(vi.fn().mockRejectedValue(new Error("network down"))),
    ).resolves.toMatchObject({ status: "unavailable" });
    await expect(
      fetchLatestPrices(
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ prices: [{ price: "4.5" }] }), { status: 200 }),
        ),
      ),
    ).resolves.toMatchObject({ status: "unavailable" });
  });

  it("returns a Finnish unavailable dataset when the cached source is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("down", { status: 503 })),
    );

    const result = await getExplorerData(new Date("2026-08-22T10:00:00.000Z"));

    expect(result).toMatchObject({
      status: "unavailable",
      fetchedAt: null,
      source: {
        name: "Pörssisähkö.net",
        pricesUrl: "https://porssisahko.net/",
        apiUrl: "https://api.porssisahko.net/v2/latest-prices.json",
        documentationUrl: "https://porssisahko.net/api",
      },
      currentQuarterId: null,
      currentHourId: null,
      next24Hours: { hourly: [], quarterHour: [] },
      tomorrow: { hourly: [], quarterHour: [] },
    });
    expect(result.message).toMatch(/saatavilla|varmistaa/i);
    expect(result.uses).toHaveLength(9);
  });
});
