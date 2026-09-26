import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("site discovery", () => {
  it("lists the current price, forecast, and history pages", () => {
    expect(sitemap()).toEqual([
      {
        url: "https://sahkohetki.fi",
        changeFrequency: "daily",
        priority: 1,
      },
      {
        url: "https://sahkohetki.fi/ennuste",
        changeFrequency: "hourly",
        priority: 0.9,
      },
      {
        url: "https://sahkohetki.fi/historia",
      },
    ]);
  });

  it("keeps the forecast page canonical URL explicit", () => {
    const forecastPage = readFileSync(
      `${process.cwd()}/app/ennuste/page.tsx`,
      "utf8",
    );

    expect(forecastPage).toContain('alternates: { canonical: "/ennuste" }');
  });
});
