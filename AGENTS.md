<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Sähköhetki Agent Guidelines

## Mock Environment & Running Without API Keys
External services (such as the ENTSO-E Transparency Platform and OpenStreetMap Nominatim reverse geocoder) require registered API keys, authentication, or live network access. In test, evaluation, and AI agent environments, real external API keys are unavailable.

To run the project in mock mode:
- Use `npm run dev:mock` (or set `SAHKO_MOCK_DATA=1`).
- You can also build and start with `npm run build:mock` and `npm run start:mock`.
- The mock environment generates realistic, deterministic synthetic data for:
  - 15-minute day-ahead spot prices for today and tomorrow (`/`, `/api/v1/prices`)
  - 14 months of historical price data (`/historia`)
  - Reverse geocoding of coordinates within Finland (`/api/municipality-by-location`)
  - Local distribution system operator (DSO) transfer tariffs (`/api/v1/transfer-costs`)

## CRITICAL: Rule for Any New API Endpoints or External Services
Whenever you introduce a **new API endpoint** (under `app/api/...`) or integrate a **new external service/data source**:
1. **Always add a mock response** for the endpoint/service in `lib/mock-data.ts`.
2. Check `isMockDataEnabled()` before invoking external network requests or third-party APIs.
3. When `isMockDataEnabled()` returns `true`:
   - Return realistic mock responses immediately.
   - Do NOT make outbound network calls or rely on external credentials.
   - Maintain the same response schema, data shapes, and status codes (including realistic error cases for invalid inputs) as the live endpoint.
4. Always add automated tests verifying that:
   - The mock response works when `SAHKO_MOCK_DATA=1`.
   - The real/production implementation functions as expected when `SAHKO_MOCK_DATA=0`.
