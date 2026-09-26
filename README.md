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

Create `.env.local` before starting the app and add the server-only API keys you
want to use:

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
- `/api/v1/prices` — normalized price data
- `/api/v1/electricity-forecast` — normalized forecast and current system data

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

## Checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
