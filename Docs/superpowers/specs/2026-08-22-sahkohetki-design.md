# Sahkohetki electricity cost explorer design

**Date:** 22 August 2026  
**Status:** Approved direction; appliance assumptions are provisional

## Goal

Build a Finnish-first public page that helps a household decide whether an everyday electricity use is inexpensive enough at a selected current or upcoming spot-price interval. The page presents an educational spot-energy estimate, not an exact household bill.

The central interaction is: select a price interval, then see the same selected price applied transparently to nine fixed everyday uses.

## Product decisions

- The source of truth is `https://api.porssisahko.net/v2/latest-prices.json`.
- Price retrieval and the calculation dataset are server-owned. The server fetches the source with roughly 12-hour revalidation and passes a validated snapshot to the page.
- The browser never fetches the price API, accepts manually entered prices, or substitutes a stale/demo value when source data is unavailable.
- Source values remain canonical at 15-minute resolution. The default view is hourly; an hour is available only when all four quarter-hour values exist, and its value is their arithmetic average.
- “Next 24 hours” is an elapsed-time horizon from the current Finnish interval. “Tomorrow” follows the Finnish calendar date and can contain 23, 24, or 25 local clock hours.
- Price level is relative to the available points in the active chart horizon: lower third is cheap, middle third is normal, and upper third is high. The UI does not use the mockup’s absolute 5/14 c/kWh thresholds.
- All prices are shown as cents per kWh and are treated as VAT-inclusive because that is what the selected source returns. Network charges, supplier margins, electricity tax, and fixed fees stay outside the headline estimate.
- The site is Finnish only, has no account or non-essential cookie requirement, and must support phone and desktop layouts, keyboard selection, visible focus, and assistive technology.

## Architecture

The page uses one server boundary and one interactive client boundary:

```text
request
  -> app/page.tsx (server component)
  -> server price loader (12-hour revalidated source fetch)
  -> price domain module (validation, horizons, hourly derivation, levels, costs)
  -> serialized ExplorerData
  -> PriceExplorer (client component)
  -> selection, mode, horizon, and modal state
```

The server domain module produces both chart modes and the cost estimates needed by each selectable point. The client only changes which already-verified point is active and renders the supplied values. This keeps source access, missing-data decisions, and calculation assumptions on the server while preserving instant keyboard and pointer interaction.

The data boundary is intentionally explicit:

```ts
type ChartPoint = {
  id: string;
  startAt: string;
  endAt: string;
  label: string;
  priceCentsPerKwh: number | null;
  available: boolean;
  unavailableReason?: "missing-quarter" | "source-gap";
  level?: "cheap" | "normal" | "high";
  estimates?: Record<EverydayUseId, CostEstimate>;
};

type ExplorerData = {
  fetchedAt: string | null;
  source: { name: string; pricesUrl: string; apiUrl: string };
  currentQuarterId: string | null;
  currentHourId: string | null;
  next24Hours: { hourly: ChartPoint[]; quarterHour: ChartPoint[] };
  tomorrow: { hourly: ChartPoint[]; quarterHour: ChartPoint[] };
  uses: EverydayUse[];
  status: "ready" | "unavailable";
  message?: string;
};
```

Timestamps are kept as ISO instants for computation. Finnish labels are produced with `Europe/Helsinki` explicitly, so the browser’s own timezone cannot change the meaning of an interval. Hour derivation groups four real quarter-hour instants and preserves separate repeated clock hours around the autumn daylight-saving transition.

## Server-side units

`lib/appliances.ts` owns the nine fixed uses and their explanatory metadata. Each entry contains an id, Finnish name, standard-use definition, provisional average consumption in kWh, and the assumption note shown in the explanation UI.

`lib/price-domain.ts` is a pure domain module. Its public functions validate source records, normalize timestamps, derive hourly points, build the two horizons, classify relative price levels, and calculate the cost table. It has no network, React, or browser dependencies.

`lib/price-source.ts` is the server-only adapter for Pörssisähkö.net. It applies the framework’s supported revalidation mechanism, validates the response shape and finite numeric values, records the server fetch timestamp, and returns an unavailable result when the source cannot be verified. It never generates fallback prices.

`app/page.tsx` loads the snapshot and renders the interactive explorer. It is responsible for the initial server-rendered state and metadata, not for client-side data fetching.

## Client UI

`app/components/price-explorer.tsx` is the only stateful page boundary. Its state consists of:

- hourly versus quarter-hour mode;
- next-24-hours versus tomorrow horizon;
- the selected available point in that view;
- whether the formula or data explanation is open.

The visual order follows the mockup while keeping the first decision visible:

1. sticky compact header with the Sahkohetki identity and explanation controls;
2. selected interval hero with time range, VAT-inclusive price, relative level, cheapest available jump, and a min-to-max spectrum marker;
3. chart toolbar and an accessible bar chart whose bars are real buttons, not canvas-only hit targets;
4. nine cost cards using the selected point and linking the saving comparison to the cheapest point in the active horizon;
5. footer with server fetch time, source attribution, API documentation link, and excluded-charge note.

The formula and source details are modal dialogs with a labelled dialog, close button, Escape handling, focus return, and content that remains readable without relying on color. Unavailable intervals are visibly disabled and have explanatory text; missing next-day data gets an information panel instead of an empty or stale chart.

The visual system keeps the supplied dark glass-panel direction but makes the signature element the price spectrum: a quiet slate-blue field, a bright selected interval, and one clear emerald/amber/rose classification language shared by hero, chart, and cards. Numeric prices use a monospace utility face, while body copy uses a system sans stack so the page remains self-contained and fast.

## Error and freshness behavior

- A network failure, non-success response, malformed payload, or non-finite price produces `status: "unavailable"` and an explicit Finnish explanation.
- A missing current or future quarter is represented as unavailable; no prior price is copied into the gap.
- An hourly point with fewer than four required quarter-hour records is unavailable and cannot be selected.
- If tomorrow’s local-date prices have not been published, the tomorrow control remains understandable and the page explains that Finnish next-day prices are not available yet.
- A newer server snapshot is visible only on a later server-rendered page request, matching the server-owned refresh decision. An already-open page is not silently pushed or reloaded.

## Provisional appliance assumptions

These values are explicitly provisional and are based on the supplied mockup. They are intentionally kept in one catalog so corrected values can be substituted later without changing the price or UI code. The review date for each assumption is 22 August 2026; the source/assumption text in the UI will say that external verification is still pending.

| Everyday use | Standard use | Provisional average |
| --- | --- | ---: |
| Kahvinkeitin | One filtered pot | 0.12 kWh |
| Vedenkeitin | Bring one litre of water to a boil | 0.11 kWh |
| Uuni | One hour of typical cooking at 200 °C | 1.50 kWh |
| Pyykinpesukone | One normal 60 °C cycle | 0.80 kWh |
| Kuivausrumpu | One drying cycle | 1.50 kWh |
| Astianpesukone | One Eco cycle | 1.00 kWh |
| Sauna | One session, including heating and bathing | 8.00 kWh |
| Televisio | One hour with a 55-inch LED TV | 0.08 kWh |
| Tietokone | One hour of desktop computer use | 0.15 kWh |

The calculation is always:

```text
estimated use cost (cents) = average consumption (kWh) × selected price (c/kWh)
estimated use cost (€) = estimated use cost (cents) ÷ 100
```

Full precision is retained internally and the displayed cents amount is rounded to two decimal places. Negative source prices therefore produce negative estimates rather than being clamped to zero.

## Testing and verification

The primary seam is the pure price-domain interface. Focused tests will cover:

- VAT-inclusive price normalization and invalid source records;
- exact four-quarter hourly averaging;
- missing-quarter hourly unavailability;
- elapsed 24-hour filtering and Finnish calendar-day filtering;
- daylight-saving transition labels and repeated local clock hours;
- relative level classification against the active available horizon;
- negative prices and the cents/euro cost formula;
- deterministic cheapest-point selection.

The page will also be checked with the repository lint/build/type checks and a rendered browser pass at desktop and mobile widths. The final review will compare the implementation diff against this design and the original requirements.

## Out of scope

This slice does not add household billing, contract-specific tariffs, user-edited appliance values, historical or forecast analytics, notifications, appliance control, accounts, saved preferences, personalization, or additional everyday uses.
