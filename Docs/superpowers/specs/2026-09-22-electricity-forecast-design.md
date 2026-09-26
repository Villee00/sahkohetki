# Sähköennuste Design

## Goal

Add a Finnish-language `/ennuste` page that explains Finland's forecast
electricity production versus consumption for the next 72 hours. The page
must distinguish forecasts, current measurements, and calculated values, and
must not invent an available-capacity or shortage score.

## Product experience

The shared header exposes `Hinta` and `Sähköennuste` routes. The forecast page
opens with a plain-language summary for the selected hour and a dominant
72-hour balance chart. The chart compares total production and consumption,
uses the space between the lines to show a calculated domestic surplus or
deficit, and supports pointer, touch, and keyboard selection.

The selected-hour ledger shows production, consumption, balance, domestic
coverage, wind, and solar. A second section shows wind and solar forecasts
against Fingrid's forecast-model capacity estimates. A separate `Tilanne nyt`
section shows current measured production, consumption, net import/export, and
Fingrid's official electricity-shortage status.

The approved visual reference is the generated high-fidelity Sähköennuste
mockup from 22 September 2026. Keep the existing navy/glass Sähköhetki visual
language. Use cyan for production, violet for consumption, mint for wind, gold
for solar, and amber for a calculated domestic deficit. Do not use red for
ordinary import need.

## Data semantics

Use Fingrid datasets 166 and 241 for consumption and production forecasts,
245 and 248 for wind and solar forecasts, 267 and 268 for model-capacity
context, 192, 193, and 194 for current measurements, and 336 for official
electricity-shortage status.

All timestamps are ISO instants internally and are presented in
`Europe/Helsinki`. Wind and solar MWh/h values are normalized to average MW.
The canonical forecast resolution is 15 minutes. An hourly point requires
four complete production and consumption quarters and uses arithmetic means.
Supporting wind, solar, or capacity values may be absent without invalidating
an otherwise complete core point.

For each point:

```text
domestic balance MW = production forecast MW - consumption forecast MW
domestic coverage % = production forecast MW / consumption forecast MW * 100
```

A negative domestic balance may be described as a calculated import need, but
never as proof that imports are available. Dataset 194 is normalized so
positive values in Sähköhetki mean import, although Fingrid's source sign is
import negative and export positive. Dataset 336 maps exactly to normal,
shortage possible, high risk, and shortage.

## Architecture

A server-only Fingrid adapter performs one aggregated request with the API key
in the `x-api-key` header. A pure forecast domain validates and aligns source
observations, calculates derived values, and produces 15-minute and hourly
series. The page and the public API consume the same normalized snapshot.
Browser code never calls Fingrid.

Expose `GET /api/v1/electricity-forecast` without query parameters. It returns
the 72-hour horizon, current measurements, model-capacity context, canonical
and hourly intervals, freshness, missing-data records, and source metadata.
Successful snapshots revalidate every three minutes. A previous successful
snapshot may be shown for at most 30 minutes and is marked stale; individual
current measurements older than ten minutes are omitted.

The page server-renders the initial snapshot and does not poll in v1. Its
client boundary owns only selected-hour interaction and the displayed age.
The chart uses repository-native SVG and HTML rather than a new chart library.
An expandable hourly table makes the complete data available without relying
on the graphic.

## Failure behavior

- Missing production or consumption creates a real gap; never interpolate.
- Missing renewable or capacity context degrades only that supporting value.
- Missing or old current values do not remove a valid forecast.
- Missing configuration, upstream failure, throttling, or malformed source
  data returns an unavailable result when no acceptable snapshot exists.
- The page explains unavailable, partial, and stale states in Finnish.
- The public route returns `503 source_unavailable` or `500 internal_error`
  using the existing error-envelope convention.

## Accessibility and responsive behavior

The full 72-hour chart is visible on desktop. Mobile presents a horizontally
scrollable 24-hour viewport with day snap points. Previous and next controls
provide keyboard selection, the selected summary is announced with
`aria-live`, patterns and text supplement color, focus remains visible, and
reduced-motion preferences are respected.

## Out of scope

Border-by-border capacity, reserve-market signals, forecast confidence bands,
price correlation, seven-day forecasting, automatic polling, and a custom
green/amber/red adequacy score are not part of v1.
