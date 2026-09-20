# Sähköhetki transfer-cost API v1

The public transfer-cost endpoint is available from the site origin:

```text
GET https://sahkohetki.fi/api/v1/transfer-costs
```

It is read-only and does not require an account or API key. Native clients
can use it to populate the website's “Siirto + sähkövero” selector and cost
details. The website uses the same server-side projection directly instead
of calling this route over HTTP.

## Response

The response is JSON with HTTP status `200`:

```json
{
  "pricing": {
    "currency": "EUR",
    "vatIncluded": true,
    "energyUnit": "cents-per-kwh",
    "fixedFeeUnit": "euros-per-month"
  },
  "electricityTax": {
    "taxClass": "I",
    "centsPerKwhVatIncluded": 2.917875,
    "effectiveFrom": "2026-04-01",
    "sourceUrl": "https://www.vero.fi/yritykset-ja-yhteisot/verot-ja-maksut/valmisteverotus/sahkovero/verotaulukot/"
  },
  "municipalities": [
    {
      "municipalityCode": "240",
      "city": "Kemi",
      "designation": "kaupunki",
      "operators": [
        {
          "id": "240:Kemin Energia ja Vesi Oy",
          "operatorName": "Kemin Energia ja Vesi Oy",
          "monthlyFixedFeeEur": 10.1,
          "transferEnergyChargeCentsPerKwh": 3.73,
          "combinedVariableChargeCentsPerKwh": 6.647875,
          "priceAvailable": true,
          "tariffName": "Yleissiirto / general-transfer",
          "tariffStatus": "matched",
          "tariffSnapshotCreatedAt": "2026-05-04",
          "tariffSourceUrl": "https://example.com/tariff",
          "notes": ""
        }
      ]
    }
  ]
}
```

Energy charges are VAT-inclusive cents per kWh. Fixed fees are VAT-inclusive
euros per month. `combinedVariableChargeCentsPerKwh` is the transfer energy
charge plus the Finnish household electricity-tax class-I rate. It does not
include supplier margins or consumption-dependent fees beyond these two
components.

The catalog is a curated 2026 general-transfer comparison snapshot, normally
using a 3 × 25 A connection basis. Transfer prices are operator- and
connection-specific; the municipality is a selector for the available
operator candidates, not a guarantee that every address in the municipality
uses every listed operator.

Operators without a price in the snapshot remain in the response:

```json
{
  "priceAvailable": false,
  "monthlyFixedFeeEur": null,
  "transferEnergyChargeCentsPerKwh": null,
  "combinedVariableChargeCentsPerKwh": null,
  "tariffStatus": "not_in_snapshot",
  "notes": "Hinta ei ole saatavilla tässä aineistossa."
}
```

Municipalities and operators are returned in Finnish alphabetical order.

## Caching and errors

Successful responses use:

```text
Cache-Control: public, max-age=3600, stale-while-revalidate=86400
```

If the bundled snapshot cannot be read or projected, the endpoint returns
HTTP `500` with `Cache-Control: no-store`:

```json
{
  "error": {
    "code": "internal_error",
    "message": "Transfer cost data is currently unavailable."
  }
}
```

The endpoint does not emit wildcard CORS headers. Native HTTP clients do not
need CORS; browser clients should call it from the site origin.
