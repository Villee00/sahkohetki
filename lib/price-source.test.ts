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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Pörssisähkö.net source adapter", () => {
  it("declares the source adapter as server-only", () => {
    expect(serverOnlyBoundary.imported).toBe(true);
  });

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

  it("normalizes the source's one-millisecond-short quarter end", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          prices: [
            {
              price: 4.5,
              startDate: "2026-08-22T10:00:00.000Z",
              endDate: "2026-08-22T10:14:59.999Z",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await fetchLatestPrices(fetchImpl);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.message);
    expect(result.prices[0].endAt).toBe("2026-08-22T10:15:00.000Z");
  });

  it("fills today's missing Finnish midnight hour from the point endpoint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T12:30:00.000Z"));

    const midnightPrices = [
      {
        price: 14.794,
        startDate: "2026-08-21T21:00:00.000Z",
        endDate: "2026-08-21T21:15:00.000Z",
      },
      {
        price: 11.624,
        startDate: "2026-08-21T21:15:00.000Z",
        endDate: "2026-08-21T21:30:00.000Z",
      },
      {
        price: 10.08,
        startDate: "2026-08-21T21:30:00.000Z",
        endDate: "2026-08-21T21:45:00.000Z",
      },
      {
        price: 9.407,
        startDate: "2026-08-21T21:45:00.000Z",
        endDate: "2026-08-21T22:00:00.000Z",
      },
    ];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.porssisahko.net/v2/latest-prices.json") {
        return new Response(
          JSON.stringify({
            prices: [
              {
                price: 10,
                startDate: "2026-08-21T22:00:00.000Z",
                endDate: "2026-08-21T22:15:00.000Z",
              },
            ],
          }),
          { status: 200 },
        );
      }

      const date = new URL(url).searchParams.get("date");
      const matchingPrice = midnightPrices.find(
        (price) => price.startDate === date,
      );
      return new Response(JSON.stringify({ price: matchingPrice?.price }), {
        status: matchingPrice ? 200 : 404,
      });
    });
    const result = await fetchLatestPrices(fetchImpl);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error(result.message);
    expect(result.prices).toEqual(
      expect.arrayContaining(
        midnightPrices.map((price) => ({
          id: String(Date.parse(price.startDate)),
          startAt: price.startDate,
          endAt: price.endDate,
          priceCentsPerKwh: price.price,
        })),
      ),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(5);
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
      today: { hourly: [], quarterHour: [] },
      tomorrow: { hourly: [], quarterHour: [] },
    });
    expect(result.message).toMatch(/saatavilla|varmistaa/i);
    expect(result.uses).toHaveLength(10);
  });
});
