# Sähköhetki electricity-forecast API v1

The public forecast endpoint is available from the site origin:

```text
GET https://sahkohetki.fi/api/v1/electricity-forecast
```

It is read-only and has no query parameters. Callers do not need a Fingrid
API key: Sähköhetki keeps its source credential on the server. The website and
this endpoint use the same normalized source snapshot and calculation rules.

## What the response means

The response covers 72 elapsed hours beginning with the current containing
hour. Timestamps are ISO 8601 instants; `timezone` identifies the Finnish time
zone used by the website for labels. A daylight-saving transition therefore
does not change the 72-hour duration.

`quarterHour` is the canonical series. An hourly interval is complete only
when all four production and consumption quarters exist. Missing core values
are retained as `null` in their real slot and are also described in `missing`;
they are never interpolated. Missing wind, solar, or capacity context does not
invalidate an otherwise complete production-versus-consumption point.

The two calculated values are:

```text
domesticBalanceMw = productionMw - consumptionMw
domesticCoveragePercent = productionMw / consumptionMw * 100
```

A negative domestic balance describes a calculated domestic deficit or
import need. It does not claim that imports are available. `netImport` in the
current-state object is normalized so positive means import and negative means
export; this is the inverse of Fingrid dataset 194's source sign.

## Successful response

HTTP `200` returns a `complete` or `partial` response:

```json
{
  "status": "partial",
  "timezone": "Europe/Helsinki",
  "generatedAt": "2026-09-22T12:02:00.000Z",
  "freshness": {
    "state": "fresh",
    "fetchedAt": "2026-09-22T12:02:00.000Z",
    "ageSeconds": 0
  },
  "horizon": {
    "startAt": "2026-09-22T12:00:00.000Z",
    "endAt": "2026-09-25T12:00:00.000Z",
    "durationHours": 72
  },
  "units": {
    "power": "MW",
    "capacityUtilization": "percent"
  },
  "calculations": {
    "domesticBalance": "productionMw - consumptionMw",
    "domesticCoverage": "productionMw / consumptionMw * 100"
  },
  "capacityModel": {
    "kind": "forecast-model-estimate",
    "description": "Wind and solar capacity values are Fingrid forecast-model estimates, not a guarantee of available electricity."
  },
  "current": {
    "production": {
      "valueMw": 8850,
      "observedAt": "2026-09-22T11:58:00.000Z"
    },
    "consumption": {
      "valueMw": 10100,
      "observedAt": "2026-09-22T11:58:00.000Z"
    },
    "netImport": {
      "valueMw": 1250,
      "observedAt": "2026-09-22T11:58:00.000Z"
    },
    "shortageStatus": {
      "code": 0,
      "level": "normal",
      "observedAt": "2026-09-22T11:57:00.000Z"
    }
  },
  "intervals": {
    "quarterHour": [
      {
        "id": "2026-09-22T12:00:00.000Z",
        "granularity": "quarter-hour",
        "startAt": "2026-09-22T12:00:00.000Z",
        "endAt": "2026-09-22T12:15:00.000Z",
        "label": "15:00–15:15",
        "available": true,
        "productionMw": 9000,
        "consumptionMw": 10000,
        "domesticBalanceMw": -1000,
        "domesticBalanceKind": "domestic-deficit",
        "domesticCoveragePercent": 90,
        "windMw": 2500,
        "solarMw": 700,
        "windCapacityMw": 8000,
        "solarCapacityMw": 1400,
        "windCapacityUtilizationPercent": 31.25,
        "solarCapacityUtilizationPercent": 50
      }
    ],
    "hourly": []
  },
  "missing": [
    {
      "granularity": "quarter-hour",
      "startAt": "2026-09-22T12:15:00.000Z",
      "endAt": "2026-09-22T12:30:00.000Z",
      "missingSeries": ["production"]
    }
  ],
  "source": {
    "name": "Fingrid Open Data",
    "homepageUrl": "https://data.fingrid.fi/en",
    "apiUrl": "https://data.fingrid.fi/api/data",
    "datasets": {
      "consumptionForecast": 166,
      "productionForecast": 241,
      "windForecast": 245,
      "solarForecast": 248,
      "solarCapacityModel": 267,
      "windCapacityModel": 268,
      "currentProduction": 192,
      "currentConsumption": 193,
      "currentNetImportExport": 194,
      "electricityShortageStatus": 336
    },
    "capacityDescription": "Wind and solar capacity values are Fingrid forecast-model estimates, not a guarantee of available electricity."
  }
}
```

`freshness.state` is `stale` when a recent successful snapshot is used after a
source refresh fails. Such a snapshot is never used after 30 minutes. Current
measurements are independently set to `null` once they are over ten minutes
old. Shortage codes map directly to Fingrid's official states: `0` normal,
`1` shortage possible, `2` high risk, and `3` shortage.

Wind and solar capacity values are forecast-model estimates, not official
available capacity. Utilization is omitted when capacity is zero or missing
and may legitimately exceed 100 percent when forecast output is above the
model estimate.

## Caching and errors

Fresh successful responses use:

```text
Cache-Control: public, max-age=60, stale-while-revalidate=120
```

Already-stale successful responses and all errors use `Cache-Control:
no-store`. Source or configuration failures return HTTP `503`; unexpected
application failures return HTTP `500`:

```json
{
  "error": {
    "code": "source_unavailable",
    "message": "Electricity forecast data is currently unavailable."
  }
}
```

The endpoint does not expose the server's `FINGRID_API_KEY` and does not emit
wildcard CORS headers.

Source: Fingrid Open Data / [data.fingrid.fi](https://data.fingrid.fi/en),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
