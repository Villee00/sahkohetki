# Sähköhetki

## Getting Started

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Set `ENTSOE_TOKEN` in `.env` before starting the app so the server can load
Finnish day-ahead prices from ENTSO-E.

The home page lives in `app/page.tsx` and updates automatically while the dev server is running.

## Checks

```bash
npm run lint
npm run build
```
