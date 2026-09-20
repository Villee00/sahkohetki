# Sähköhetki price API v1

For transfer charges and household electricity tax, see the companion
[transfer-cost API](v1-transfer-costs.md).

The public spot-price endpoint is available from the site origin:

```text
GET https://sahkohetki.fi/api/v1/prices
```

The endpoint is read-only and does not require an account, API key, or
browser CORS permission. Native applications can call it directly. The
website and this endpoint use the same server-side price source and domain
rules.

## Request

The optional `horizon` query parameter accepts:

- `today` (default): the current calendar day in `Europe/Helsinki`;
- `tomorrow`: the following Finnish calendar day.

The endpoint does not accept arbitrary timestamps. A Finnish calendar day
can contain 23, 24, or 25 elapsed hours around daylight-saving transitions.

## Successful response

The response is JSON with HTTP status `200`:

```json
{
  "status": "complete",
  "timezone": "Europe/Helsinki",
  "horizon": {
    "name": "today",
    "date": "2026-08-22",
    "startAt": "2026-08-21T21:00:00.000Z",
    "endAt": "2026-08-22T21:00:00.000Z"
  },
  "fetchedAt": "2026-08-22T12:10:00.000Z",
  "pricing": {
    "unit": "cents-per-kwh",
    "currency": "EUR",
    "vatIncluded": true,
    "vatRate": 0.255
  },
  "current": {
    "quarterHour": {
      "id": "1787400900000",
      "startAt": "2026-08-22T12:15:00.000Z",
      "endAt": "2026-08-22T12:30:00.000Z",
      "priceCentsPerKwh": 7.42,
      "level": "normal",
      "carriedForward": false
    },
    "hour": null
  },
  "intervals": {
    "quarterHour": [
      {
        "id": "1787346000000",
        "startAt": "2026-08-21T21:00:00.000Z",
        "endAt": "2026-08-21T21:15:00.000Z",
        "priceCentsPerKwh": 5,
        "level": "cheap"
      }
    ],
    "hourly": [
      {
        "id": "1787346000000",
        "startAt": "2026-08-21T21:00:00.000Z",
        "endAt": "2026-08-21T22:00:00.000Z",
        "priceCentsPerKwh": 6.5,
        "level": "normal"
      }
    ]
  },
  "missing": [],
  "source": {
    "name": "ENTSO-E",
    "pricesUrl": "https://transparency.entsoe.eu/",
    "apiUrl": "https://web-api.tp.entsoe.eu/api",
    "documentationUrl": "https://transparency.entsoe.eu/content/static_content/download?path=%2FStatic+content%2Fweb+api%2FRestfulAPI_IG.pdf"
  }
}
```

`priceCentsPerKwh` is the verified Finnish day-ahead spot price with the
general 25.5% VAT included. Electricity tax, network transfer charges,
supplier margins, and fixed fees are not included. Negative prices remain
negative.

Quarter-hour values are canonical. Hourly values are arithmetic averages of
four complete quarter-hour values. `level` uses the site’s absolute bands:
`cheap` through 5 c/kWh, `normal` above 5 through 14 c/kWh, and `high` above
14 c/kWh. `carriedForward` is present only when the source carried a value
forward into that interval.

`status` is `partial` when any expected interval is unavailable or not yet
published. Unavailable intervals are omitted from the two interval arrays and
listed in `missing`:

```json
{
  "status": "partial",
  "missing": [
    {
      "granularity": "quarter-hour",
      "startAt": "2026-08-22T13:15:00.000Z",
      "endAt": "2026-08-22T13:30:00.000Z",
      "reason": "source-gap"
    },
    {
      "granularity": "hour",
      "startAt": "2026-08-22T13:00:00.000Z",
      "endAt": "2026-08-22T14:00:00.000Z",
      "reason": "incomplete-hour"
    }
  ]
}
```

The possible missing reasons are:

- `source-gap`: a missing quarter between available source values;
- `incomplete-hour`: an hour without all four quarter-hour values;
- `not-published`: the source has not published that part of the horizon.

The `current` values are the current Finnish quarter-hour and containing UTC
hour, independent of whether the requested horizon is `today` or `tomorrow`.
They are `null` when the corresponding interval is unavailable.

## Errors

All non-success responses use this envelope:

```json
{
  "error": {
    "code": "invalid_horizon",
    "message": "The horizon must be today or tomorrow."
  }
}
```

The documented statuses and codes are:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_horizon` | The query value is not `today` or `tomorrow`. |
| 503 | `source_unavailable` | ENTSO-E data is missing, rejected, or cannot be verified. |
| 500 | `internal_error` | An unexpected server error occurred. |

Error responses are not publicly cacheable. Successful responses advertise a
short client/CDN cache window while the server continues to use its existing
source snapshot cache:

```text
Cache-Control: public, max-age=60, stale-while-revalidate=300
```
