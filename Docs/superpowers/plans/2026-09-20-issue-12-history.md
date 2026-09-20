# Historical Electricity Prices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Finnish `/historia` page that turns at least twelve months of ENTSO-E day-ahead prices into accessible day, week, and month comparisons.

**Architecture:** A shared server-side parser preserves raw ENTSO-E intervals and metadata. A monthly cached loader builds a compact, precomputed history payload for an interactive client component, while the existing live explorer keeps its public data contract.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, fast-xml-parser, Vitest, Testing Library, CSS/Tailwind utilities.

**Spec:** GitHub issue #12 and the approved implementation plan in the conversation.

## Global Constraints

- Public route is `/historia`; UI and errors are Finnish.
- Preserve raw EUR/MWh separately from the VAT-inclusive household estimate.
- Support PT15M, PT60M, Finnish local dates, and 23/25-hour DST dates.
- No database, public HTTP API, migration, runtime dependency, supplier margin, transfer fee, or electricity tax.
- Use monthly server cache entries: 30 days for closed months and 6 hours for the current month.

## Review Focus

- A revised or duplicated ENTSO-E document must not double-count intervals.
- Missing or rate-limited months must produce explicit partial data, not false complete statistics.
- DST dates must be complete at their real 23/25-hour duration.
- Mixed 15/60-minute intervals must be duration-weighted.
- Keyboard and screen-reader users must receive every heatmap value and control state.

---

### Task 1: Shared ENTSO-E interval parser

**Files:** `lib/entsoe-prices.ts`, `lib/entsoe-prices.test.ts`, `lib/price-source.ts`, `lib/price-source.test.ts`

**Interfaces:** Produce `MarketPriceInterval`, typed parse outcomes, and an adapter that preserves the existing `QuarterPrice` behavior.

- [ ] Add failing PT15M/PT60M, sparse block, revision, duplicate, acknowledgement, and malformed-document tests.
- [ ] Implement the shared raw parser and current-price adapter.
- [ ] Run parser and current-source tests, then the full suite.
- [ ] Commit the parser extraction.

### Task 2: Historical analytics

**Files:** `lib/history-types.ts`, `lib/history-domain.ts`, `lib/history-domain.test.ts`

**Interfaces:** Produce `HistoryPeriodSummary` collections and compact `HistoryPageData` from canonical raw intervals.

- [ ] Add failing mixed-resolution, DST, completeness, prior-period, percentile, negative-price, and expensive-streak tests.
- [ ] Implement complete local-day normalization and day/week/month summaries.
- [ ] Run domain tests, then the full suite.
- [ ] Commit the historical domain.

### Task 3: Monthly historical source

**Files:** `lib/history-source.ts`, `lib/history-source.test.ts`

**Interfaces:** Produce `HistoryLoadResult` with ready/partial/unavailable status, monthly cache keys, missing ranges, timestamps, and failure reasons.

- [ ] Add failing query-window, offset, cache, missing-token, acknowledgement, 429, and partial-month tests.
- [ ] Implement server-only monthly retrieval and merge/deduplication.
- [ ] Run source tests, then the full suite.
- [ ] Commit the historical loader.

### Task 4: `/historia` experience and delivery

**Files:** `app/historia/page.tsx`, `app/components/history-explorer.tsx`, `app/components/history-explorer.test.tsx`, `app/globals.css`, `app/components/price-explorer.tsx`, `app/sitemap.ts`

**Interfaces:** Consume only compact `HistoryPageData`; expose no browser-facing raw interval API.

- [ ] Add failing interaction, accessibility, navigation, metadata, and sitemap tests.
- [ ] Implement the year heatmap, comparison panel, controls, partial/error states, and navigation.
- [ ] Apply the visual plan: ink `#07111e`, panel `#14243a`, sky `#38bdf8`, cheap `#34d399`, normal `#fbbf24`, high `#fb7185`; system sans for prose and system mono for price data; the year-grid is the single signature element.
- [ ] Verify desktop/mobile layout and focus behavior.
- [ ] Run tests, lint, typecheck, and production build.
- [ ] Review the complete branch, fix important findings test-first, push, and open a PR against `main` containing `Closes #12`.
