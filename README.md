# Sähköhetki

Sähköhetki shows Finland's day-ahead electricity prices and a 72-hour view of
forecast electricity production, consumption, wind, solar, and the calculated
domestic balance.

## Getting started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Mock Environment (No API Keys Required)

For agent sessions, local development, or UI work without external API keys:

```bash
npm run dev:mock
```

You can also build or preview with mock data:

```bash
npm run build:mock
npm run start:mock
```

Mock mode serves clearly labeled synthetic prices for today, tomorrow, recent history, 72-hour electricity forecast, and mock geolocation without calling external APIs (ENTSO-E, Fingrid, or Nominatim).

Unit tests use fixed fixtures and mocked network requests, so `npm test` does not require `.env` or external credentials.

The local `.env` file is gitignored, so it is present only in checkouts where you created it. Next.js loads it when running the app; Vitest runs outside the Next.js runtime and does not load it automatically.

### Running With Live API Keys

To run against real external APIs, create `.env.local` or `.env` (see `.env.example`) and add the server-only API keys you want to use:

```dotenv
ENTSOE_TOKEN=
FINGRID_API_KEY=
```

- `ENTSOE_TOKEN` loads Finnish day-ahead prices from ENTSO-E.
- `FINGRID_API_KEY` loads Fingrid's production, consumption, wind, solar, and
  power-system data. The key is sent only by the server and is never included in
  the browser response.

## Pages and APIs

- `/` — day-ahead electricity prices
- `/ennuste` — 72-hour electricity production and consumption forecast
- `/historia` — historical electricity prices
- `/api/v1/prices` — normalized price data
- `/api/v1/electricity-forecast` — normalized forecast and current system data
- `/api/v1/transfer-costs` — electricity transmission tariffs
- `/api/municipality-by-location` — reverse geocoding for Finnish municipalities

The forecast API contract is documented in
[`Docs/api/v1-electricity-forecast.md`](Docs/api/v1-electricity-forecast.md).
The Fingrid dataset selection and limitations are recorded in
[`Docs/research/2026-09-22-fingrid-api.md`](Docs/research/2026-09-22-fingrid-api.md).

Both data integrations degrade to an explicit unavailable state when their key
is missing, so the app can still be developed without credentials.

After adding `FINGRID_API_KEY`, restart the server and check
`/api/v1/electricity-forecast` with real data before release. Confirm that it
returns `status: "ready"`, production and consumption fill expected hours, and
the measured net-import direction agrees with Fingrid. The public download
client informed the query and response handling, but the authenticated
`/api/data` operation still needs this live-key check.

## Guidelines for Agents & New Endpoints

When implementing any **new API endpoint** or connecting to any **new external service**:
- Always add a mock response in `lib/mock-data.ts`.
- Check `isMockDataEnabled()` before calling third-party APIs.
- When `isMockDataEnabled()` is active, return mock data without making network requests.
- Add test coverage for both mock mode (`SAHKO_MOCK_DATA=1`) and standard mode (`SAHKO_MOCK_DATA=0`).

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
