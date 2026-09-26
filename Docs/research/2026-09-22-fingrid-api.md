# Fingrid Open Data API choices for the electricity forecast

**Retrieved:** 2026-09-22  
**Scope:** the Sähköhetki /ennuste page and
GET /api/v1/electricity-forecast implementation in this worktree  
**Source policy:** official Fingrid Open Data pages and the Fingrid developer
portal only

## Executive summary

The selected source set is a good fit for the feature's central question:
“how might Finnish production and consumption develop over the next 72
hours, and what are wind, solar, and the present system state doing?”

- Datasets **166** and **241** provide the total consumption and production
  forecasts that define the main chart.
- Datasets **245** and **248** provide wind and solar production forecasts for
  the next 72 hours.
- Datasets **267** and **268** provide the forecast-model capacity context for
  solar and wind. Fingrid explicitly says these are not official national
  capacity totals, so the UI must not label them as available capacity.
- Datasets **192**, **193**, and **194** provide the measured present state.
- Dataset **336** provides Fingrid's official electricity-shortage status.

Fingrid's API instructions document the base address as
https://data.fingrid.fi/api, require an API key in the x-api-key request
header, and limit a key to 10,000 requests per 24 hours and one request every
two seconds. See [Fingrid API instructions](https://data.fingrid.fi/en/instructions).
The adapter calls the operation URL https://data.fingrid.fi/api/data once
for all ten datasets and keeps the key server-side. A live-key request on
2026-09-26 confirmed that the `datasets` query must be one comma-separated
value: repeating the parameter returns HTTP 422, while the comma-separated
request returns HTTP 200 with a `{ data, pagination }` response and rows for
all ten requested dataset IDs. Dataset 194's import sign
is supported by a first-party data sample and related Fingrid border-flow
descriptions, as detailed below.

## Official API facts

### Authentication and endpoint

Fingrid says that API access requires registration and an API key. The key is
placed in the HTTP x-api-key header, not in the URL. The same page documents
https://data.fingrid.fi/api as the API address and links to the
[official Fingrid developer portal](https://developer-data.fingrid.fi/) for
technical API documentation. See
[API instructions](https://data.fingrid.fi/en/instructions).

The application therefore follows this boundary:

~~~text
browser -> Sähköhetki server route -> Fingrid API
                                      x-api-key: FINGRID_API_KEY
~~~

FINGRID_API_KEY is read only in lib/fingrid-source.ts; it is never sent to
the browser or included in the public Sähköhetki response. Fingrid also calls
out CORS requirements for browser use, which is another reason to keep this
credentialed request server-side ([API instructions](https://data.fingrid.fi/en/instructions)).

The implemented URL is:

~~~text
https://data.fingrid.fi/api/data
~~~

This is the operation URL currently used by the adapter, not a claim that the
public instructions page fully specifies every operation path. A no-key probe
to this official URL on the retrieval date returned HTTP 401 for a missing
subscription key. That confirms the endpoint is protected, but does not
validate the authenticated response schema.

### Rate limits and request strategy

Fingrid documents both limits per API key:

- at most **10,000 requests in 24 hours**;
- at most **one request every two seconds**.

The [Fingrid FAQ](https://data.fingrid.fi/en/faq) describes the corresponding
failure cases as HTTP 429 for the per-interval rate limit and HTTP 403 when
the daily quota is exhausted. Fingrid recommends waiting before retrying and
reducing request volume with larger time ranges and caching.

The adapter makes one aggregated request for all ten selected datasets and
uses a three-minute server cache. The live request confirmed that all ten IDs
can be returned together when `datasets` is comma-separated. Fingrid's download
UI also states that up to ten datasets can be selected together
([official download page](https://data.fingrid.fi/en/data?datasets=245&datasets=246&datasets=268&datasets=75)).

### Time zones and timestamps

Fingrid states that data timestamps are presented in **UTC** and explains that
Finland is UTC+2 in normal time and UTC+3 during daylight saving time on the
[Open Data about page](https://data.fingrid.fi/en/about). The implementation
therefore:

1. accepts only timestamp strings with an explicit UTC offset or Z;
2. canonicalizes internal instants to ISO UTC strings;
3. formats labels for Europe/Helsinki in the UI;
4. keeps the forecast horizon as 72 elapsed hours, including across a DST
   transition.

The Finnish API instructions additionally warn that individual time-series
values can be absent for technical reasons ([official API instructions](https://data.fingrid.fi/instructions)).

### Data quality and response caveats

Fingrid asks applications to handle API downtime defensively and does not
warrant that the information is complete or accurate ([API instructions](https://data.fingrid.fi/en/instructions)).
The [FAQ](https://data.fingrid.fi/en/faq) has a specific procedure for missing
individual values or ranges: report them to Fingrid so they can investigate.

The selected dataset pages also document historical resolution changes. This
matters if the feature is later extended from a live forecast to historical
backfills:

- dataset 166 was 5-minute data before 2024-04-21;
- dataset 241 was hourly before 2023-06-03;
- datasets 245 and 248 were hourly before 2023-05-31.

The current feature uses the present 15-minute forecast horizon and does not
silently interpolate historical or missing data. Production and consumption
are required for a usable balance point; missing wind, solar, or capacity
context remains null. The Sähköhetki hourly series is an aggregation layer: it
requires four complete 15-minute production and consumption intervals, then
uses arithmetic means. Supporting renewable or capacity values may remain
missing without invalidating an otherwise complete core hour.

### License and attribution

Fingrid's [Open Data about page](https://data.fingrid.fi/en/about) says that
Fingrid-produced datasets are licensed under **Creative Commons Attribution
4.0 International (CC BY 4.0)**. It requires appropriate credit, a link to
the license/original material where technically possible, preservation of
notices and disclaimers, and an indication when the material has been
modified. Fingrid provides this attribution text:

> Source Fingrid / data.fingrid.fi, license CC 4.0 BY

The Sähköhetki API and page should retain that attribution and link to the
source. The data is normalized and aggregated by Sähköhetki, so the published
output should make that modification clear.

## Dataset selection

The table records what Fingrid explicitly publishes and how the current
feature uses it. “Update cadence” means the cadence stated on the dataset page;
it is not a guarantee that every individual row will arrive exactly on that
schedule.

| ID | Official dataset | Official unit | Official data period | Official update/horizon | Why it is selected | Implementation note |
|---:|---|---|---|---|---|---|
| [166](https://data.fingrid.fi/en/datasets/166) | Electricity consumption forecast | MW | 15 min | Updated every 15 min; next 72 h | Main demand line and denominator for coverage | Core series; gaps are preserved |
| [241](https://data.fingrid.fi/en/datasets/241) | Electricity production prediction | MW | 15 min | Updated every 15 min | Main domestic-production line | Core series; returned horizon coverage needs live validation |
| [245](https://data.fingrid.fi/en/datasets/245) | Wind power generation forecast | MWh/h | 15 min | Updated every 15 min; next 72 h | Renewable contribution and wind outlook | Converted to average MW for a common display unit |
| [248](https://data.fingrid.fi/en/datasets/248) | Solar power generation forecast | MWh/h | 15 min | Updated every 15 min; next 72 h | Renewable contribution and solar outlook | Converted to average MW for a common display unit |
| [267](https://data.fingrid.fi/en/datasets/267) | Total production capacity used in the solar power forecast | MW | 1 h | Manually updated/estimate-based; no fixed cadence stated on the page | Context for how the solar forecast compares with the model's PV base | Not official available capacity; hourly context is aligned to 15-min points by application logic |
| [268](https://data.fingrid.fi/en/datasets/268) | Total production capacity used in the wind power forecast | MW | 1 h | Manually updated approximately weekly when capacity changes | Context for how the wind forecast compares with the model's wind base | Not official available capacity; using it with a forecast is a display proxy |
| [192](https://data.fingrid.fi/en/datasets/192) | Electricity production in Finland — real-time data | MW | 3 min | Updated every 3 min | Measured “Tilanne nyt” production | Current value is omitted by the app after 10 min of age |
| [193](https://data.fingrid.fi/en/datasets/193) | Electricity consumption in Finland — real-time data | MW | 3 min | Updated every 3 min | Measured “Tilanne nyt” consumption | Fingrid describes this as calculated from production and import/export |
| [194](https://data.fingrid.fi/en/datasets/194) | Net import/export of electricity — real-time data | MW | 3 min | Updated every 3 min | Explains the present balance's cross-border component | Numeric sign is normalized by the app; see sign section |
| [336](https://data.fingrid.fi/en/datasets/336) | Electricity shortage status | 0–3 | 3 min | Updated every 3 min | Official status alongside the calculated forecast balance | Codes are mapped directly to Fingrid's four labels |

The first four forecast pages provide the product's future-looking signal. The
two capacity pages are deliberately secondary context: their descriptions
say what capacity was used by Fingrid's forecast model, not how much power is
currently available to the Finnish system. The three real-time pages anchor
the page in the latest measured state, while dataset 336 is the only selected
shortage indicator that is an official Fingrid status rather than a score
invented by Sähköhetki.

### Forecast datasets 166, 241, 245, and 248

**166 — consumption forecast.** Fingrid describes this as Finland's
consumption forecast, based on historical consumption and weather forecasts,
with a 72-hour look-ahead, 15-minute average power, MW units, and a 15-minute
update cadence ([dataset 166](https://data.fingrid.fi/en/datasets/166)). This is
the demand series used to determine whether the forecast has a real core
point.

**241 — production prediction.** Fingrid says the calculation is based on
production plans reported by balance-responsible parties, and that it is
updated every 15 minutes. The dataset is MW at 15-minute periods
([dataset 241](https://data.fingrid.fi/en/datasets/241)). It is the total
production series paired with dataset 166. The public page does not, in the
text available here, guarantee the exact horizon returned for every request;
the adapter therefore validates the row timestamps and treats absent slots as
gaps.

**245 — wind forecast.** Fingrid publishes a 72-hour Finnish wind-generation
forecast, updated every 15 minutes. It uses wind-park measurements, weather
forecasts, turbine location/size/capacity, and the day-ahead price effect. The
unit is MWh/h and the data period is 15 minutes
([dataset 245](https://data.fingrid.fi/en/datasets/245)).

**248 — solar forecast.** Fingrid publishes a 72-hour solar-generation
forecast, updated every 15 minutes. It uses weather forecasts, estimates of
installed PV capacity/location, and measurements from large solar parks; the
page warns that small-scale PV location is a rough estimate. The unit is MWh/h
and the data period is 15 minutes
([dataset 248](https://data.fingrid.fi/en/datasets/248)).

The UI presents the two MWh/h series as average MW because MWh/h is
dimensionally equivalent to average MW over the stated interval. That is a
unit-label normalization made by Sähköhetki, not a change to the source data.
The live response must confirm that the value semantics match this
interpretation for the current API operation.

### Model-capacity datasets 267 and 268

**267 — solar model capacity.** Fingrid says the series includes grid-scale
and small-scale residential PV, uses Energy Authority statistics plus Fingrid
estimates, and can be compared with the solar forecast to calculate a
production rate. Fingrid explicitly says it must not be considered the
official amount of solar production capacity in Finland. It is MW at one-hour
periods ([dataset 267](https://data.fingrid.fi/en/datasets/267)).

**268 — wind model capacity.** Fingrid says the series is based on capacity
information and actual production measurements, is updated manually about
weekly when changes occur, and is updated retroactively according to achieved
production. Fingrid explicitly says it must not be considered the official
amount of Finnish wind production capacity. It is MW at one-hour periods
([dataset 268](https://data.fingrid.fi/en/datasets/268)).

The page can therefore show “forecast-model capacity” and an application-
calculated forecast-to-model comparison, but not “available capacity”,
“dispatchable capacity”, “reserve”, or “how much electricity is guaranteed to
be available”. For wind in particular, the official description discusses
comparison with actual wind production; applying the denominator to the wind
forecast is an Sähköhetki display choice and must be labeled as such.

### Current datasets 192, 193, and 194

**192 — production.** This is Finland's electricity production from real-time
measurements in Fingrid's operation control system. Fingrid states MW units,
three-minute periods, and three-minute updates
([dataset 192](https://data.fingrid.fi/en/datasets/192)).

**193 — consumption.** This is Finland's real-time consumption series. Fingrid
states that consumption is calculated from production and import/export, with
the production and import/export information based on real-time operation
control-system measurements. The dataset is MW at three-minute periods and is
updated every three minutes ([dataset 193](https://data.fingrid.fi/en/datasets/193)).

**194 — net import/export.** Fingrid describes this as net import to Finland
and net export from Finland, based on real-time operation-control-system
measurements, in MW at three-minute periods and updated every three minutes
([dataset 194](https://data.fingrid.fi/en/datasets/194)).

The public first-party download response inspected on 2026-09-22 showed
production (192) near 6,111 MW, consumption (193) near 8,459 MW, and net
import/export (194) near −2,343 MW over the same period. Those values are
consistent with a negative source value for net import and a positive app
value after negation. Fingrid's individual [FI–SE3 border-flow
dataset](https://data.fingrid.fi/en/datasets/32) explicitly uses positive for
export and negative for import. Applying that sign convention to dataset 194
is an inference supported by the sample; the dataset 194 text does not state
the numeric sign explicitly. Verify the authenticated source response once a
real API key is available.

These three values are shown separately from the forecast. They are not mixed
into the 72-hour production forecast or used to imply that future imports are
available.

### Dataset 336 — official shortage status

Fingrid defines dataset 336 as an electricity shortage status and explains
that a shortage occurs when production and imports are not enough to cover
consumption. The page gives the exact code mapping, 0–3 unit, three-minute
period, and three-minute update cadence ([dataset 336](https://data.fingrid.fi/en/datasets/336)):

| Source value | App label |
|---:|---|
| 0 | normal |
| 1 | electricity shortage possible |
| 2 | high risk of electricity shortage |
| 3 | electricity shortage |

The adapter preserves the code and maps it to these labels. Unknown codes are
treated as unavailable instead of being guessed.

## Request and response contract

### Current adapter request

The server adapter in lib/fingrid-source.ts currently constructs one request
covering the current containing hour plus the 72-hour horizon:

~~~text
GET https://data.fingrid.fi/api/data
  ?datasets=166
  &datasets=241
  &datasets=245
  &datasets=248
  &datasets=267
  &datasets=268
  &datasets=192
  &datasets=193
  &datasets=194
  &datasets=336
  &startTime=<UTC horizon start minus one hour>
  &endTime=<UTC horizon end>
  &format=json
  &oneRowPerTimePeriod=false
  &pageSize=20000
  &locale=en
x-api-key: <server-only FINGRID_API_KEY>
~~~

The ten IDs and the x-api-key boundary are deliberate. The request window
starts one hour early so the adapter can tolerate a latest-current row at the
edge of the forecast horizon; the pure domain layer then produces the current
containing hour through the next 72 elapsed hours. The cache and stale fallback
are Sähköhetki behavior, not Fingrid API guarantees.

### Adapter response assumptions

The adapter currently expects a JSON object with a data array whose rows look
like this:

~~~json
{
  "datasetId": 245,
  "startTime": "2026-09-22T12:00:00.000Z",
  "endTime": "2026-09-22T12:15:00.000Z",
  "value": 1250.4
}
~~~

That shape matches the JSON example style exposed by Fingrid dataset pages,
but the authenticated /api/data operation, row multiplicity, and exact
parameter names are an adapter contract until verified through the developer
portal or a real-key request. Malformed rows are ignored; a response with no
valid selected rows is unavailable.

The public Sähköhetki endpoint then exposes normalized 15-minute and hourly
series, current measurements, freshness, missing-data records, and source
metadata. See the local
[Sähköhetki API v1 contract](../api/v1-electricity-forecast.md).

## Sign and calculation choices

The following are application semantics, not additional Fingrid datasets.

### Dataset 194 sign normalization

The source description gives the semantic directions “net import to Finland”
and “net export from Finland” but the public dataset text does not state the
numeric sign in the material reviewed here. The local design/spec and adapter
currently normalize the value as:

~~~text
Sähköhetki netImportMw = - Fingrid dataset 194 value
~~~

Therefore a positive netImportMw in Sähköhetki means import to Finland and a
negative value means export from Finland. This keeps the UI language intuitive
and avoids displaying a source-sign detail in the main “Tilanne nyt” card.

**Validation required:** with a live key, inspect a known interval and compare
the numeric value with Fingrid's current UI/API metadata or an official
technical example before treating the inversion as confirmed. Until then,
this is explicitly an implementation assumption.

### Forecast balance and coverage

For each canonical interval the domain layer calculates:

~~~text
domesticBalanceMw = productionForecastMw - consumptionForecastMw
domesticCoveragePercent = productionForecastMw / consumptionForecastMw * 100
~~~

These are Sähköhetki calculations. A negative balance means that domestic
forecast production is below forecast consumption; it is a calculated deficit
or import need, not proof that cross-border imports or spare generation will be
available. The page must not turn this into an invented adequacy score.

### Renewable and capacity normalization

- Wind and solar source values are published as MWh/h; the app exposes them as
  average MW for consistent chart and ledger units.
- Dataset 267 and 268 are hourly while the main forecast is 15-minute. The
  domain layer accepts the hourly interval and applies its value to the
  contained quarter-hour slots, then averages complete quarters when producing
  hourly display points. This is an alignment choice, not a source statement.
- Forecast-to-capacity percentages are calculated only when both values exist
  and the capacity is positive. They are model-context percentages, not
  utilization of official available capacity. They may exceed 100% because
  the denominator is an estimate/model series rather than a guaranteed physical
  ceiling.

## Gaps, freshness, and failure handling

The implementation choices below are responses to Fingrid's official caveats:

- a missing production or consumption quarter remains a real gap;
- no interpolation is performed;
- missing renewable or capacity context only removes that supporting value;
- measured current values older than ten minutes are hidden;
- a successful source snapshot is cached for three minutes;
- after a refresh failure, a prior snapshot may be shown as stale for at most
  30 minutes;
- missing configuration, a failed/throttled request, or malformed data returns
  an unavailable state when no acceptable snapshot exists.

The ten-minute and thirty-minute thresholds, cache duration, aggregation rules,
and error envelope belong to Sähköhetki. Fingrid's sources only establish that
the service can be throttled, unavailable, incomplete, or missing individual
values ([API instructions](https://data.fingrid.fi/en/instructions),
[FAQ](https://data.fingrid.fi/en/faq)).

## What still needs a live-key validation

The authenticated `/api/data` request and its response envelope were
confirmed on 2026-09-26. These remaining data semantics and failure paths
still need controlled review:

1. **Horizon coverage:** verify that 166, 241, 245, and 248 return the expected
   future rows through the requested 72-hour window and that their interval
   boundaries are 15 minutes.
2. **MWh/h semantics:** verify that the wind and solar values are average
   power for the interval, so the display conversion to average MW is correct.
3. **Capacity alignment:** inspect the startTime/endTime semantics of 267
   and 268 before relying on repeating an hourly model value across quarters.
4. **Dataset 194 sign:** validate a known import/export interval and confirm
   the inversion described above.
5. **Current freshness:** confirm that 192–194 and 336 return recent rows and
   that the selected latest-row logic does not mistake a future-dated or
   revised interval for the current reading.
6. **Error behavior:** record the status/body for missing key, invalid key,
   throttling, and a deliberately narrow or empty range without exposing the
   key in logs.

If any of these checks contradict the adapter assumptions, update the adapter
and its tests before enabling the public feature. Do not weaken the UI's
distinction between forecast, measurement, calculated balance, and
forecast-model capacity.

## Official source index

- [Fingrid API instructions](https://data.fingrid.fi/en/instructions)
- [Fingrid Open Data about, timestamps, license, and attribution](https://data.fingrid.fi/en/about)
- [Fingrid API FAQ, missing data, 429, and 403 behavior](https://data.fingrid.fi/en/faq)
- [Fingrid developer portal](https://developer-data.fingrid.fi/)
- [Fingrid multi-dataset download page](https://data.fingrid.fi/en/data?datasets=245&datasets=246&datasets=268&datasets=75)
- [Dataset 166 — electricity consumption forecast](https://data.fingrid.fi/en/datasets/166)
- [Dataset 241 — electricity production prediction](https://data.fingrid.fi/en/datasets/241)
- [Dataset 245 — wind power generation forecast](https://data.fingrid.fi/en/datasets/245)
- [Dataset 248 — solar power generation forecast](https://data.fingrid.fi/en/datasets/248)
- [Dataset 267 — solar forecast-model capacity](https://data.fingrid.fi/en/datasets/267)
- [Dataset 268 — wind forecast-model capacity](https://data.fingrid.fi/en/datasets/268)
- [Dataset 192 — electricity production real-time data](https://data.fingrid.fi/en/datasets/192)
- [Dataset 193 — electricity consumption real-time data](https://data.fingrid.fi/en/datasets/193)
- [Dataset 194 — net import/export real-time data](https://data.fingrid.fi/en/datasets/194)
- [Dataset 336 — electricity shortage status](https://data.fingrid.fi/en/datasets/336)
