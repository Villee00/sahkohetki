# Sahkohetki Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build the Finnish-first Sahkohetki spot-price explorer described in the approved design, including server-owned price data, accessible interval selection, and nine provisional everyday-use estimates.

**Architecture:** Keep price-source access and all derived calculation data on the server. A pure TypeScript domain layer will validate quarter-hour source values, derive hourly values and Finnish horizons, classify relative levels, and precompute cost estimates; an explicitly interactive client component will only select and render the serialized dataset. The page will use a custom accessible bar chart so each interval is keyboard-selectable without a canvas dependency.

**Tech Stack:** Next.js 16.3.2 App Router, React 19.2.8, TypeScript 5, CSS with the existing Tailwind 4 import plus project-specific styles, Vitest for pure-domain tests.

**Spec:** Docs/superpowers/specs/2026-08-22-sahkohetki-design.md

## Global Constraints

- The source URL is https://web-api.tp.entsoe.eu/api; the server uses ENTSOE_TOKEN and the Finnish bidding-zone EIC 10YFI-1--------U.
- Source retrieval is server-only and cached/revalidated for 43,200 seconds; the page is dynamically rendered so a later server request can use a newer cached source snapshot.
- No fallback, stale substitution, invented price, browser-side API request, or manual price input is allowed.
- Quarter-hour values are canonical; hourly values require exactly four valid quarter-hour values and use their arithmetic average.
- All Finnish labels use the Europe/Helsinki timezone, including DST transition days with 23, 24, or 25 local hours.
- Price levels use stable absolute 5/14 c/kWh thresholds so a narrow active horizon cannot make a low price appear high.
- Displayed prices are VAT-inclusive cents per kWh; the ENTSO-E adapter adds Finland's general 25.5% VAT. Network charges, supplier margins, electricity tax, and fixed fees are excluded.
- The nine provisional consumption values are the values approved from Docs/MOCKUP.html and must remain centralized and replaceable.
- The site is Finnish only, responsive, keyboard-accessible, focus-visible, and readable with assistive technology.
- Run a focused test after each domain slice, typecheck regularly, and run the full test/lint/build/browser verification before the final commit.

---

### Task 1: Establish the test seam and provisional everyday-use catalog

**Files:**
- Modify: package.json
- Modify: package-lock.json
- Create: vitest.config.ts
- Create: lib/appliances.ts
- Test: lib/appliances.test.ts

**Interfaces:**
- Produces EverydayUseId, EverydayUse, EVERYDAY_USES, and getEverydayUse(id).
- Each catalog entry contains id, name, standardUse, consumptionKwh, assumption, and reviewedOn.
- The catalog order is the nine-item order in the approved design and has exactly nine entries.

- [ ] Step 1: Add the test runner and scripts

Install Vitest and add the scripts below to package.json:

~~~json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
~~~

Create vitest.config.ts:

~~~ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
~~~

Run: npm install --save-dev vitest

Expected: package.json and package-lock.json add Vitest and the new scripts remain valid JSON.

- [ ] Step 2: Write the failing catalog test

Create lib/appliances.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import { EVERYDAY_USES, getEverydayUse } from "./appliances";

describe("everyday use catalog", () => {
  it("contains the nine approved standard uses in order", () => {
    expect(EVERYDAY_USES.map((use) => use.id)).toEqual([
      "coffee",
      "kettle",
      "oven",
      "washing",
      "dryer",
      "dishwasher",
      "sauna",
      "television",
      "computer",
    ]);
    expect(EVERYDAY_USES).toHaveLength(9);
  });

  it("keeps the provisional values and definitions together", () => {
    expect(getEverydayUse("coffee")).toMatchObject({
      name: "Kahvinkeitin",
      standardUse: "Yksi suodatettava pannullinen",
      consumptionKwh: 0.12,
      reviewedOn: "2026-08-22",
    });
    expect(getEverydayUse("sauna")).toMatchObject({
      consumptionKwh: 8,
      assumption: expect.stringContaining("mockup"),
    });
  });
});
~~~

Run: npm test -- lib/appliances.test.ts

Expected: FAIL because lib/appliances.ts does not exist yet.

- [ ] Step 3: Implement the minimal catalog

Create lib/appliances.ts with this public shape:

~~~ts
export const EVERYDAY_USE_IDS = [
  "coffee",
  "kettle",
  "oven",
  "washing",
  "dryer",
  "dishwasher",
  "sauna",
  "television",
  "computer",
] as const;

export type EverydayUseId = (typeof EVERYDAY_USE_IDS)[number];

export type EverydayUse = {
  id: EverydayUseId;
  name: string;
  standardUse: string;
  consumptionKwh: number;
  assumption: string;
  reviewedOn: string;
};

export const EVERYDAY_USES: readonly EverydayUse[] = [
  {
    id: "coffee",
    name: "Kahvinkeitin",
    standardUse: "Yksi suodatettava pannullinen",
    consumptionKwh: 0.12,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "kettle",
    name: "Vedenkeitin",
    standardUse: "Yksi litra vettä kiehuvaksi",
    consumptionKwh: 0.11,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "oven",
    name: "Uuni",
    standardUse: "Yksi tunti tyypillistä ruoanlaittoa 200 °C:ssa",
    consumptionKwh: 1.5,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "washing",
    name: "Pyykinpesukone",
    standardUse: "Yksi normaali 60 °C pesuohjelma",
    consumptionKwh: 0.8,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "dryer",
    name: "Kuivausrumpu",
    standardUse: "Yksi kuivaussykli",
    consumptionKwh: 1.5,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "dishwasher",
    name: "Astianpesukone",
    standardUse: "Yksi Eco-pesuohjelma",
    consumptionKwh: 1,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "sauna",
    name: "Sauna",
    standardUse: "Yksi saunakerta, lämmitys ja kylpy",
    consumptionKwh: 8,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "television",
    name: "Televisio",
    standardUse: "Yksi tunti 55 tuuman LED-televisiolla",
    consumptionKwh: 0.08,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "computer",
    name: "Tietokone",
    standardUse: "Yksi tunti pöytätietokoneella",
    consumptionKwh: 0.15,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
];

export function getEverydayUse(id: EverydayUseId) {
  return EVERYDAY_USES.find((use) => use.id === id);
}
~~~

Fill the entries with 0.12, 0.11, 1.5, 0.8, 1.5, 1, 8, 0.08, and 0.15 kWh respectively. Set every assumption to a Finnish-readable note that the value is provisional and based on the provided mockup, and set every reviewedOn to 2026-08-22.

- [ ] Step 4: Run the focused test and typecheck

Run: npm test -- lib/appliances.test.ts

Expected: PASS with two tests.

Run: npm run typecheck

Expected: PASS with exit code 0.

- [ ] Step 5: Commit the catalog seam

Run:

~~~sh
git add package.json package-lock.json vitest.config.ts lib/appliances.ts lib/appliances.test.ts
git commit -m "feat: add provisional everyday use catalog"
~~~

### Task 2: Implement source normalization, interval math, levels, and cost calculation

**Files:**
- Create: lib/price-types.ts
- Create: lib/price-domain.ts
- Test: lib/price-domain.test.ts

**Interfaces:**
- `QuarterPrice` is the normalized server-adapter output consumed by the pure domain module. ENTSO-E XML parsing belongs to Task 4.
- calculateUseCost(consumptionKwh, priceCentsPerKwh) returns CostEstimate.
- deriveHourlyPoint(quarters, hourStartAt) returns an available or unavailable PricePoint.
- classifyPriceLevels(points) returns points with cheap, normal, or high levels assigned only to available points.
- findCheapestPoint(points) returns the first cheapest available point or undefined.

- [ ] Step 1: Write the failing normalization and calculation tests

Create lib/price-domain.test.ts with independent normalized `QuarterPrice` literals. The source adapter owns ENTSO-E XML validation, while these tests cover interval math and calculation behavior:

~~~ts
import { describe, expect, it } from "vitest";
import {
  calculateUseCost,
  classifyPriceLevels,
  deriveHourlyPoint,
  findCheapestPoint,
} from "./price-domain";
import type { QuarterPrice } from "./price-types";

const completeHour: QuarterPrice[] = [
  { id: "q1", priceCentsPerKwh: 10, startAt: "2026-08-22T10:00:00.000Z", endAt: "2026-08-22T10:15:00.000Z" },
  { id: "q2", priceCentsPerKwh: 12, startAt: "2026-08-22T10:15:00.000Z", endAt: "2026-08-22T10:30:00.000Z" },
  { id: "q3", priceCentsPerKwh: 14, startAt: "2026-08-22T10:30:00.000Z", endAt: "2026-08-22T10:45:00.000Z" },
  { id: "q4", priceCentsPerKwh: 16, startAt: "2026-08-22T10:45:00.000Z", endAt: "2026-08-22T11:00:00.000Z" },
];

describe("price domain", () => {
  it("averages all four quarters and marks a missing quarter unavailable", () => {
    expect(deriveHourlyPoint(completeHour, "2026-08-22T10:00:00.000Z")).toMatchObject({
      available: true,
      priceCentsPerKwh: 13,
    });
    expect(
      deriveHourlyPoint(completeHour.slice(0, 3), "2026-08-22T10:00:00.000Z"),
    ).toMatchObject({ available: false, unavailableReason: "missing-quarter" });
  });

  it("keeps negative prices and rounds only the displayed values", () => {
    expect(calculateUseCost(0.12, -1.5)).toEqual({
      cents: -0.18,
      euros: -0.0018,
      centsLabel: "-0.18",
      eurosLabel: "-0.00",
    });
    expect(calculateUseCost(0.12, 10)).toMatchObject({
      cents: 1.2,
      euros: 0.012,
      centsLabel: "1.20",
      eurosLabel: "0.01",
    });
  });

  it("classifies values by their active-horizon rank and finds the first minimum", () => {
    const points = [2, 4, 6, 8, 10, 12].map((price, index) => ({
      id: String(index),
      startAt: new Date(Date.UTC(2026, 7, 22, index)).toISOString(),
      endAt: new Date(Date.UTC(2026, 7, 22, index + 1)).toISOString(),
      label: String(index) + ":00",
      priceCentsPerKwh: price,
      available: true,
    }));
    const classified = classifyPriceLevels(points);
    expect(classified.map((point) => point.level)).toEqual([
      "cheap",
      "cheap",
      "normal",
      "normal",
      "high",
      "high",
    ]);
    expect(findCheapestPoint(classified)?.id).toBe("0");
  });
});
~~~

Run: npm test -- lib/price-domain.test.ts

Expected: FAIL because lib/price-domain.ts and lib/price-types.ts do not exist.

- [ ] Step 2: Define the public domain types

Create lib/price-types.ts:

~~~ts
import type { EverydayUseId } from "./appliances";

export type PriceLevel = "cheap" | "normal" | "high";

export type QuarterPrice = {
  id: string;
  startAt: string;
  endAt: string;
  priceCentsPerKwh: number;
};

export type CostEstimate = {
  cents: number;
  euros: number;
  centsLabel: string;
  eurosLabel: string;
};

export type PricePoint = {
  id: string;
  startAt: string;
  endAt: string;
  label: string;
  priceCentsPerKwh: number | null;
  available: boolean;
  unavailableReason?: "missing-quarter" | "source-gap";
  level?: PriceLevel;
  estimates?: Record<EverydayUseId, CostEstimate>;
};
~~~

- [ ] Step 3: Implement the minimal pure functions

Create lib/price-domain.ts. Consume only normalized `QuarterPrice` records from the server adapter; ENTSO-E XML parsing and schema validation are specified in Task 4. The pure domain module must not know about the transport format. Sort source records by startAt and use a stable id based on the start instant.

Use this calculation implementation:

~~~ts
export function calculateUseCost(
  consumptionKwh: number,
  priceCentsPerKwh: number,
): CostEstimate {
  const cents = consumptionKwh * priceCentsPerKwh;
  const euros = cents / 100;
  return {
    cents,
    euros,
    centsLabel: cents.toFixed(2),
    eurosLabel: euros.toFixed(2),
  };
}
~~~

For hourly derivation, look up the four expected quarter starts at hourStartAt, plus 15, 30, and 45 minutes. Return an unavailable point when any is absent; otherwise average the four full-precision prices. For levels, mark prices up to 5 c/kWh cheap, prices above 5 and up to 14 c/kWh normal, and prices above 14 c/kWh high. Preserve source order and select the first minimum.

- [ ] Step 4: Run the focused tests and typecheck

Run: npm test -- lib/price-domain.test.ts

Expected: PASS with five tests.

Run: npm run typecheck

Expected: PASS with exit code 0.

- [ ] Step 5: Commit the pure calculation seam

Run:

~~~sh
git add lib/price-types.ts lib/price-domain.ts lib/price-domain.test.ts
git commit -m "feat: add spot price domain calculations"
~~~

### Task 3: Add Finnish timezone horizons and the server-owned ExplorerData builder

**Files:**
- Create: lib/time.ts
- Test: lib/time.test.ts
- Modify: lib/price-types.ts
- Modify: lib/price-domain.ts
- Test: lib/explorer-data.test.ts

**Interfaces:**
- getHelsinkiDateKey(instant) returns a YYYY-MM-DD string.
- getHelsinkiDateBounds(dateKey) returns UTC ISO startAt and endAt for that Finnish calendar date.
- formatIntervalLabel(startAt, endAt) returns a Finnish-readable interval label with an offset suffix when a DST transition makes the local times ambiguous.
- buildExplorerData({ quarterPrices, now, fetchedAt }) returns the complete serializable ExplorerData shape from the design.

- [ ] Step 1: Write the failing timezone and horizon tests

Create lib/time.test.ts:

~~~ts
import { describe, expect, it } from "vitest";
import {
  formatIntervalLabel,
  getHelsinkiDateBounds,
  getHelsinkiDateKey,
} from "./time";

describe("Europe/Helsinki time helpers", () => {
  it("formats UTC instants in Finnish local time", () => {
    expect(getHelsinkiDateKey(new Date("2026-08-22T21:30:00.000Z"))).toBe("2026-08-23");
    expect(formatIntervalLabel("2026-08-22T21:30:00.000Z", "2026-08-22T22:30:00.000Z")).toContain("00:30");
  });

  it("keeps the spring and autumn Finnish dates at 23 and 25 elapsed hours", () => {
    const spring = getHelsinkiDateBounds("2026-03-29");
    const autumn = getHelsinkiDateBounds("2026-10-25");
    expect(Date.parse(spring.endAt) - Date.parse(spring.startAt)).toBe(23 * 60 * 60 * 1000);
    expect(Date.parse(autumn.endAt) - Date.parse(autumn.startAt)).toBe(25 * 60 * 60 * 1000);
  });
});
~~~

Create lib/explorer-data.test.ts with this complete fixed source fixture and assertions:

~~~ts
import { describe, expect, it } from "vitest";
import { buildExplorerData } from "./price-domain";
import type { QuarterPrice } from "./price-types";

const sourceFixture: QuarterPrice[] = Array.from({ length: 240 }, (_, index) => {
  const startMs = Date.parse("2026-08-22T00:00:00.000Z") + index * 15 * 60 * 1000;
  return {
    id: String(startMs),
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(startMs + 15 * 60 * 1000).toISOString(),
    priceCentsPerKwh: 4 + (index % 8),
  };
});

describe("ExplorerData horizons", () => {
  it("builds the current 24-hour and following Finnish calendar-day views", () => {
    const data = buildExplorerData({
      quarterPrices: sourceFixture,
      now: new Date("2026-08-22T12:07:00.000Z"),
      fetchedAt: "2026-08-22T12:10:00.000Z",
    });
    expect(data.next24Hours.quarterHour).toHaveLength(96);
    expect(data.tomorrow.quarterHour.length).toBeGreaterThanOrEqual(92);
    expect(data.next24Hours.hourly.every((point) => point.estimates)).toBe(true);
  });

  it("exposes a source gap and makes its containing hour unavailable", () => {
    const missingStart = "2026-08-22T13:15:00.000Z";
    const data = buildExplorerData({
      quarterPrices: sourceFixture.filter((point) => point.startAt !== missingStart),
      now: new Date("2026-08-22T12:07:00.000Z"),
      fetchedAt: "2026-08-22T12:10:00.000Z",
    });
    expect(
      data.next24Hours.quarterHour.find((point) => point.startAt === missingStart),
    ).toMatchObject({ available: false, unavailableReason: "source-gap" });
    expect(
      data.next24Hours.hourly.find((point) => point.startAt === "2026-08-22T13:00:00.000Z"),
    ).toMatchObject({ available: false, unavailableReason: "missing-quarter" });
  });
});
~~~

Use fixed now values rather than the real clock.

Run: npm test -- lib/time.test.ts lib/explorer-data.test.ts

Expected: FAIL because the time helpers and ExplorerData builder do not exist.

- [ ] Step 2: Implement DST-safe Finnish time helpers

Create lib/time.ts. Use Intl.DateTimeFormat with the Europe/Helsinki timezone for display and date parts. Convert a Finnish local midnight to an instant by applying the offset returned by timeZoneName shortOffset to a UTC guess, then compute the next local midnight from the next calendar date. Generate quarter starts by stepping real UTC milliseconds between the bounds, not by adding hours to local clock labels.

The helpers must never use the browser timezone, split an ISO string to get a Finnish date, or make a fixed 24-hour assumption for tomorrow.

- [ ] Step 3: Build horizons and estimates

Extend lib/price-types.ts with:

~~~ts
export type HorizonPoints = {
  hourly: PricePoint[];
  quarterHour: PricePoint[];
};

export type ExplorerData = {
  fetchedAt: string | null;
  source: { name: string; pricesUrl: string; apiUrl: string; documentationUrl: string };
  currentQuarterId: string | null;
  currentHourId: string | null;
  next24Hours: HorizonPoints;
  tomorrow: HorizonPoints;
  uses: readonly import("./appliances").EverydayUse[];
  status: "ready" | "unavailable";
  message?: string;
};
~~~

Implement buildExplorerData in lib/price-domain.ts:

1. Floor now to the current 15-minute instant.
2. Build exactly 96 quarter slots from current quarter through the next 24 elapsed hours.
3. Build tomorrow from Finnish local midnight to the following Finnish local midnight; this naturally yields 92, 96, or 100 quarter slots around DST.
4. Represent absent slots as unavailable PricePoint values with unavailableReason source-gap.
5. Derive hourly points from complete UTC-aligned groups of four quarter slots; an incomplete group is unavailableReason missing-quarter.
6. Classify levels separately for each horizon and mode using only available points in that active set.
7. Attach a full CostEstimate record for each available point using every entry in EVERYDAY_USES.
8. Set currentQuarterId to the current quarter id only when that point is available; set currentHourId to the containing full hour id only when that point is available.

- [ ] Step 4: Run focused tests and typecheck

Run: npm test -- lib/time.test.ts lib/price-domain.test.ts lib/explorer-data.test.ts

Expected: PASS, including 23-hour and 25-hour Finnish calendar-day assertions.

Run: npm run typecheck

Expected: PASS with exit code 0.

- [ ] Step 5: Commit the horizon/data-builder seam

Run:

~~~sh
git add lib/time.ts lib/time.test.ts lib/price-types.ts lib/price-domain.ts lib/explorer-data.test.ts
git commit -m "feat: build Finnish price horizons"
~~~

### Task 4: Add the revalidated ENTSO-E server adapter

**Files:**
- Create: lib/price-source.ts
- Test: lib/price-source.test.ts

**Interfaces:**
- fetchLatestPrices(fetchImpl?) is an injectable external-boundary function returning either a validated source payload or an unavailable result.
- getExplorerData(now?) is the server-only page data loader; it returns ready ExplorerData from the cached source or an unavailable ExplorerData result.

- [ ] Step 1: Write boundary tests with fetch doubles

Create lib/price-source.test.ts with a valid A44 XML fixture containing the Finnish bidding-zone EIC, EUR/MWh units, a PT15M period, and sparse point positions. Cover successful normalization to VAT-inclusive c/kWh, all required query parameters, missing-token short-circuiting, HTTP/XML/schema failures, rejected requests, unsupported resolutions, and the unavailable ExplorerData shape.

Run: npm test -- lib/price-source.test.ts

Expected: FAIL because lib/price-source.ts does not exist.

- [ ] Step 2: Implement the fetch adapter

Implement fetchLatestPrices with the ENTSO-E API URL, Finnish bidding-zone EIC, A44 document type, A01 day-ahead market, Helsinki calendar-day window, and `securityToken=process.env.ENTSOE_TOKEN`. Keep `cache: "no-store"` on the low-level request so the outer server cache owns the 43,200-second freshness policy. Parse and validate the XML response, accept only Finnish EUR/MWh PT15M data, and convert it to VAT-inclusive cents per kWh using Finland's general 25.5% VAT rate. Return an explicit unavailable result for every failure path; never reuse a prior result.

- [ ] Step 3: Add the server cache and page loader

Wrap a zero-argument loader with Next.js unstable_cache:

~~~ts
const getCachedSourceSnapshot = unstable_cache(
  async () => {
    const result = await fetchLatestPrices();
    return {
      ...result,
      fetchedAt: result.status === "ready" ? new Date().toISOString() : null,
    };
  },
  ["sahkohetki-entsoe-latest-prices"],
  { revalidate: 43200 },
);
~~~

getExplorerData(now = new Date()) must call the cached snapshot, build the ready dataset with buildExplorerData, and produce a Finnish unavailable dataset with the catalog and source links when the snapshot is unavailable. Keep this module server-only by importing it only from app/page.tsx; do not add a route handler or a browser API client.

- [ ] Step 4: Run focused tests and checks

Run: npm test -- lib/price-source.test.ts lib/price-domain.test.ts

Expected: PASS with the fetch boundary covered by injected doubles.

Run: npm run typecheck

Expected: PASS with exit code 0.

- [ ] Step 5: Commit the source adapter

Run:

~~~sh
git add lib/price-source.ts lib/price-source.test.ts
git commit -m "feat: add cached server price source"
~~~

### Task 5: Build the server page and accessible interactive explorer

**Files:**
- Modify: app/page.tsx
- Modify: app/layout.tsx
- Create: app/components/icon.tsx
- Create: app/components/price-explorer.tsx
- Create: app/components/price-chart.tsx
- Create: app/components/appliance-card.tsx
- Create: app/components/explanation-dialog.tsx
- Test: app/components/price-chart.test.tsx

**Interfaces:**
- Home is an async server component that calls getExplorerData and renders PriceExplorer.
- PriceExplorer({ data: ExplorerData }) owns mode, horizon, selection, and dialog state.
- PriceChart({ points, selectedId, onSelect }) renders every interval as a real button with aria-pressed, accessible label, and visible focus.
- ApplianceCard({ use, estimate, cheapestPoint }) renders the selected cost and saving comparison without recomputing price data in the browser.

- [ ] Step 1: Create the failing page contract test

Install the React test packages and add a render-level test. Run npm install --save-dev @testing-library/react @testing-library/user-event jsdom, add the jsdom environment directive to the TSX test file, and test the public PriceChart seam with these complete imports, fixture, and assertions:

~~~tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { PriceChart } from "./price-chart";

const point = {
  id: "quarter-1015",
  startAt: "2026-08-22T10:15:00.000Z",
  endAt: "2026-08-22T10:30:00.000Z",
  label: "10:15–10:30",
  priceCentsPerKwh: 4.5,
  available: true,
  level: "cheap" as const,
};

it("lets a keyboard-accessible chart button select an available interval", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<PriceChart points={[point]} selectedId={point.id} onSelect={onSelect} />);
  const button = screen.getByRole("button", { name: /10:15/ });
  expect(button.getAttribute("aria-pressed")).toBe("true");
  await user.click(button);
  expect(onSelect).toHaveBeenCalledWith(point.id);
});
~~~

Run npm test -- app/components/price-chart.test.tsx and confirm it fails before the component exists.

- [ ] Step 2: Implement the server page and serialized client boundary

Update app/page.tsx:

~~~tsx
import { PriceExplorer } from "@/app/components/price-explorer";
import { getExplorerData } from "@/lib/price-source";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getExplorerData();
  return <PriceExplorer data={data} />;
}
~~~

Keep all source data and estimates in the server-provided data prop. The client component must not import lib/price-source.ts or call fetch.

- [ ] Step 3: Implement selection, modes, horizons, and dialogs

In price-explorer.tsx:

- initialize hourly mode and next24 horizon;
- choose currentHourId/currentQuarterId when available, otherwise the first available point, otherwise no selection;
- switch between hourly and quarter-hour point arrays without changing the source dataset;
- switch between next24Hours and tomorrow and preserve the selection only if its id exists in the new view;
- update hero, range marker, appliance estimates, and cheapest comparison from the selected point;
- wire the formula and source buttons to labelled dialogs;
- close dialogs by close button, Escape, and backdrop; restore focus to the opener;
- render explicit Finnish unavailable messages when data.status is unavailable, when no point is selected, or when tomorrow has no available data.

Use useMemo for derived active points, selected point, and cheapest point. Use useEffect only for dialog keyboard and focus behavior.

- [ ] Step 4: Implement the bar chart and cards

In price-chart.tsx, render a horizontally scrollable chart with one button per point. Use aria-label text such as: Valitse aikaväli 10:15–10:30, hinta 4,50 senttiä kilowattitunnilta. Add aria-pressed, a disabled state for unavailable points, and a text summary below the bars so values are understandable without color or hover.

In appliance-card.tsx, show Finnish name, standard-use definition, kWh assumption, selected cost in cents/euros, and either the saving amount plus cheapest interval or Paras ajankohta. Use supplied CostEstimate strings; do not recalculate in JSX.

- [ ] Step 5: Update Finnish metadata and run the focused component test

Update app/layout.tsx:

~~~tsx
export const metadata: Metadata = {
  title: "Sahkohetki – sähkön hinta arjessa",
  description: "Katso pörssisähkön hinta ja yhdeksän arjen käytön kustannusarvio.",
};
~~~

Set the html lang to fi and keep the existing body wrapper. Run the focused component test.

Expected: PASS; selecting a chart button changes the selected interval text and the associated cards.

- [ ] Step 6: Commit the interactive page

Run:

~~~sh
git add app/page.tsx app/layout.tsx app/components
git commit -m "feat: add interactive price explorer"
~~~

### Task 6: Apply the mockup visual system and responsive accessibility styling

**Files:**
- Modify: app/globals.css
- Modify: app/components/price-explorer.tsx
- Modify: app/components/price-chart.tsx
- Modify: app/components/appliance-card.tsx
- Modify: app/components/explanation-dialog.tsx

**Interfaces:**
- No new data interfaces. Styling consumes only the public component props from Task 5.

- [ ] Step 1: Add project tokens and layout primitives

In app/globals.css, retain the existing Tailwind import and add:

~~~css
:root {
  --ink-950: #07111e;
  --ink-900: #0d1a2b;
  --ink-800: #14243a;
  --line: rgba(148, 163, 184, 0.18);
  --sky: #38bdf8;
  --cheap: #34d399;
  --normal: #fbbf24;
  --high: #fb7185;
}
~~~

Style the page as a deep slate background with a subtle radial energy glow, translucent panels, restrained corner radii, monospace price values, and a max-width layout matching the mockup. Keep the spectrum marker as the single signature accent.

- [ ] Step 2: Style all required states

Add responsive rules for one-column phones, two-column tablet cards, and three-column desktop cards. Include visible focus rings, reduced-motion behavior, disabled unavailable bars with a clear hatch or opacity treatment, text labels for every price level, dialog scroll containment, mobile chart scrolling, and a no-data panel with sufficient contrast.

- [ ] Step 3: Render-check and iterate

Start the app with npm run dev, inspect the page at a desktop width and a narrow mobile width, and verify:

- the hero, chart, nine cards, footer, formula dialog, data dialog, and unavailable state have the intended hierarchy;
- keyboard Tab reaches all controls in a sensible order;
- Enter and Space select chart intervals;
- Escape closes dialogs and focus returns to the opener;
- the page still communicates price level when color is unavailable.

- [ ] Step 4: Commit the visual pass

Run:

~~~sh
git add app/globals.css app/components
git commit -m "style: apply Sahkohetki visual system"
~~~

### Task 7: Full verification, requirements audit, and handoff

**Files:**
- Modify: README.md only if the final test/typecheck commands need documenting.
- Inspect: all files changed by Tasks 1–6.

- [ ] Step 1: Run the complete automated checks

Run each command separately and read its full output:

~~~sh
npm run typecheck
npm test
npm run lint
npm run build
~~~

Expected: every command exits with code 0; Vitest reports zero failed tests; ESLint reports zero errors; Next build completes.

- [ ] Step 2: Audit the implementation against the spec

Check each requirement directly in the running page and source:

- the server request is the only API call and uses 43,200-second cache revalidation;
- invalid or missing data never becomes a fallback number;
- hourly mode averages four quarters and exposes missing-hour gaps;
- next24 is 96 quarter slots and tomorrow follows Finnish local-day duration;
- level labels use stable 5 and 14 c/kWh cutoffs;
- estimates use the nine centralized provisional values and negative prices remain negative;
- source links, VAT note, fetch timestamp, excluded charges, formula, and assumption notes are visible;
- all controls are keyboard and assistive-technology friendly.

- [ ] Step 3: Capture the final diff and status

Run:

~~~sh
git status --short
git log --oneline --decorate -8
git diff d8fb5bc...HEAD --stat
~~~

Confirm only intended application, test, package, design, and plan files are included. Preserve the user-provided untracked Docs source files unless explicitly asked to commit them.

- [ ] Step 4: Commit any final verification-only documentation change

If README.md was updated in Step 1, run:

~~~sh
git add README.md
git commit -m "docs: document project verification commands"
~~~

Otherwise leave the verified code commits unchanged.
