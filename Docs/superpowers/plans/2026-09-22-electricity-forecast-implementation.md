# Sähköennuste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved 72-hour Sähköennuste page and reusable public
forecast endpoint backed by Fingrid Open Data.

**Architecture:** Keep Fingrid credentials and source validation server-side.
A pure forecast domain produces one normalized snapshot consumed by both the
page and the public API; the client owns only selected-hour interaction.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, repository-native
SVG/CSS, Vitest, Testing Library.

**Spec:** `Docs/superpowers/specs/2026-09-22-electricity-forecast-design.md`

## Global constraints

- Use `FINGRID_API_KEY` only on the server and send it as `x-api-key`.
- Fetch datasets 166, 241, 245, 248, 267, 268, 192, 193, 194, and 336 in one
  aggregated request.
- Preserve 15-minute source values and require four core quarters per hour.
- Never interpolate missing core values or invent an adequacy score.
- Use `Europe/Helsinki` for all user-facing dates, including DST transitions.
- Do not add a chart dependency or alter price-page behavior beyond shared
  route navigation.
- Keep the page Finnish-only, responsive, keyboard accessible, and compatible
  with reduced motion.

## Review focus

- A partial forecast must render real gaps without shifting adjacent times.
- Stale forecast data must never make old current measurements appear live.
- Dataset 194's sign must be normalized to positive import.
- Capacity estimates at zero, missing, or below forecast output must not crash
  or be silently clamped.
- DST changes must preserve 72 elapsed hours and unambiguous Finnish labels.

---

### Task 1: Forecast contract and pure domain

**Files:**
- Create: `lib/forecast-types.ts`
- Create: `lib/forecast-domain.ts`
- Test: `lib/forecast-domain.test.ts`

**Interfaces:**
- Produces `ForecastObservation`, `ForecastInterval`, `ForecastSnapshot`,
  `buildForecastSeries(observations, now)`, and `aggregateForecastHours`.
- Later tasks consume these types without reimplementing time or balance rules.

- [ ] Write failing tests for interval alignment, balance, coverage, missing
  quarters, optional renewable data, zero capacity, over-100% utilization,
  and DST labels.
- [ ] Run `npm test -- lib/forecast-domain.test.ts` and verify RED.
- [ ] Implement the minimal pure domain and types.
- [ ] Run the focused test, full `npm test`, and `npm run typecheck` GREEN.
- [ ] Commit as `feat: add electricity forecast domain`.

### Task 2: Fingrid source adapter and freshness

**Files:**
- Create: `lib/fingrid-source.ts`
- Test: `lib/fingrid-source.test.ts`

**Interfaces:**
- Consumes the Task 1 observation and snapshot types.
- Produces `fetchFingridObservations(fetchImpl, now)` and
  `getElectricityForecast(now)` with ready/unavailable results.

- [ ] Write failing tests for URL/header construction, complete parsing,
  import-sign normalization, missing key, HTTP failure, malformed rows,
  partial data, stale snapshots, and expired snapshots.
- [ ] Run the focused tests and verify RED.
- [ ] Implement one aggregated server-only request and three-minute cache.
- [ ] Run focused tests, full `npm test`, and typecheck GREEN.
- [ ] Commit as `feat: add Fingrid forecast source`.

### Task 3: Public electricity forecast API

**Files:**
- Create: `lib/forecast-api.ts`
- Create: `app/api/v1/electricity-forecast/route.ts`
- Test: `lib/forecast-api.test.ts`
- Test: `app/api/v1/electricity-forecast/route.test.ts`
- Create: `Docs/api/v1-electricity-forecast.md`

**Interfaces:**
- Consumes the Task 2 forecast result.
- Produces the documented `ElectricityForecastApiResponse` and versioned GET
  route with the existing JSON error envelope.

- [ ] Write failing mapper and route tests for complete, partial, stale, 503,
  500, and cache-control responses.
- [ ] Run focused tests and verify RED.
- [ ] Implement the DTO mapper, route, and API documentation.
- [ ] Run focused tests, full `npm test`, and typecheck GREEN.
- [ ] Commit as `feat: expose electricity forecast API`.

### Task 4: Shared route navigation

**Files:**
- Create: `app/components/site-header.tsx`
- Create: `app/components/site-header.test.tsx`
- Modify: `app/components/price-explorer.tsx`
- Modify: `app/components/price-explorer.test.tsx`

**Interfaces:**
- Produces `SiteHeader` with active route, context slot, and utility-actions
  slot. Both pages consume the same brand and route navigation.

- [ ] Write failing tests for route links, active state, slots, mobile labels,
  and unchanged price-page actions.
- [ ] Run focused tests and verify RED.
- [ ] Extract the header and integrate it into the price page.
- [ ] Run focused tests, full `npm test`, and typecheck GREEN.
- [ ] Commit as `refactor: share site navigation`.

### Task 5: Forecast page and charts

**Files:**
- Create: `app/ennuste/page.tsx`
- Create: `app/components/forecast-explorer.tsx`
- Create: `app/components/forecast-chart.tsx`
- Create: `app/components/forecast-explorer.test.tsx`
- Create: `app/components/forecast-chart.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes one serialized `ForecastSnapshot` from the server page.
- Produces the approved hero, balance horizon, selected-hour ledger, renewable
  charts, current-state row, table fallback, and Finnish degraded states.

- [ ] Write failing component tests for initial selection, surplus/deficit
  copy, hour navigation, partial gaps, missing capacity, stale/unavailable
  states, table fallback, and accessible names.
- [ ] Run focused tests and verify RED.
- [ ] Implement the page and approved visual system without a chart library.
- [ ] Run focused tests, full `npm test`, typecheck, and lint GREEN.
- [ ] Commit as `feat: add electricity forecast page`.

### Task 6: Metadata, research, and release verification

**Files:**
- Modify: `app/sitemap.ts`
- Modify: `README.md`
- Create: `Docs/research/2026-09-22-fingrid-api.md`
- Test: relevant metadata/sitemap tests if behavior needs a new seam

**Interfaces:**
- Completes deployment setup and documents the source assumptions.

- [ ] Add `/ennuste` metadata/canonical coverage and sitemap behavior tests
  where practical, then verify RED.
- [ ] Add sitemap entry, environment setup, API/research links, and copy the
  approved Fingrid research into this repository.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- [ ] Inspect desktop and mobile renders, keyboard flow, reduced motion, and
  missing-key behavior; fix defects test-first.
- [ ] Commit as `docs: complete electricity forecast integration`.
