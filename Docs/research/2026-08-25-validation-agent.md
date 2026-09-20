# Validation audit: Finland-wide electricity-transfer dataset

**Status:** checkpoint / interim audit
**Date:** 25 August 2026
**Scope:** independent validation of [the feasibility note](2026-08-25-sahkon-siirtohinta-feasibility.md). No application code was changed.

## Interim verdict

The proposed dataset is feasible as a curated household distribution-tariff dataset, but the official postal-code DSO feed must not be joined directly to the 2026 comparison table by display name.

The 2026 comparison is a 77-row household snapshot. The live DSO lookup feed currently contains 117 names, including closed-network, high-voltage, legacy, test, and other non-household entries. A stable area/operator key plus an alias table is required. The comparison values are also a snapshot: at least Alajärvi and PKS have changed or differ from the current tariff page after the comparison was published.

## Evidence reviewed

- [Feasibility note](2026-08-25-sahkon-siirtohinta-feasibility.md)
- [Omakotiliitto announcement, 6 May 2026](https://www.sttinfo.fi/tiedote/72011769/sahkon-siirtomaksujen-rakenne-ja-hinta-vaativat-avoimuutta-kuluttajille-sanoo-omakotiliitto?lang=fi&publisherId=67340313)
- [Omakotiliitto 2026 tariff table PDF](https://www.sttinfo.fi/files/67340313/72011769/375325/fi)
- [Energy Authority responsibility-area map](https://energiavirasto.fi/verkonhaltijat-kartalla)
- [Energy Authority responsibility-area WFS](https://verkkotietopiste.fi/geoserver/vtp/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=vtp%3Aaction_area_WFS&outputFormat=application%2Fjson&propertyName=action_area_id%2Caction_area_name%2Corganization_name&maxFeatures=200)
- [Sähkönhinta.fi DSO lookup feed](https://ev-shv-prod-app-wa-consumerapi1.azurewebsites.net/api/getdsocollection)
- [Statistics Finland: Municipalities 2026](https://stat.fi/en/luokitukset/kunta/kunta_1_20260101)
- [Kuntaliitto: city and municipality counts](https://www.kuntaliitto.fi/kuntaliitto/tietotuotteet-ja-palvelut/kaupunkien-ja-kuntien-lukumaarat-ja-vaestotiedot)

## 1. Count of Finnish cities in 2026

The appropriate definition here is “municipalities that use the city designation”, not all municipalities.

- Statistics Finland’s 2026 municipality classification contains **308 municipalities** and states that there were **no municipal mergers as of 1 January 2026**: [Municipalities 2026](https://stat.fi/en/luokitukset/kunta/kunta_1_20260101).
- Kuntaliitto’s current count page says that **108 of the 308 municipalities used the city designation** in the preceding count: [Kuntaliitto, city and municipality counts](https://www.kuntaliitto.fi/kuntaliitto/tietotuotteet-ja-palvelut/kaupunkien-ja-kuntien-lukumaarat-ja-vaestotiedot). Its explanatory page states the number explicitly as 108: [Näin kunta toimii](https://www.kuntaliitto.fi/valtuutettu/nain-kunta-toimii).

**Working 2026 count: 108 cities.** This is a continuity inference from the official 108 count and Statistics Finland’s 2026 no-merger notice; the sources do not expose a separate 2026 “city designation” field in the municipality classification. The final dataset should therefore cite both sources and record the definition rather than presenting 108 as a directly enumerated DSO-derived fact.

The city count is not a DSO count. A city can have zero, one, or several DSO areas represented within its municipal boundary.

## 2. Why one city can map to more than one DSO

The Energy Authority’s map is based on licensed network responsibility areas, not municipal boundaries. It states that the map covers distribution-network holders and closed distribution-network holders; the Energy Authority assigns a geographic responsibility area in the network licence, and the responsibility areas together cover mainland Finland while not overlapping one another: [Energy Authority responsibility-area map](https://energiavirasto.fi/verkonhaltijat-kartalla).

The legal model is consistent with that geometry. The [Electricity Market Act 588/2013](https://finlex.fi/fi/laki/ajantasa/2013/20130588) assigns the responsibility area through the network licence and gives the DSO an area-specific distribution role. The official consumer FAQ also says that the location of the electricity-use site determines the DSO and that the DSO cannot be changed for that site: [Sähkönhinta.fi FAQ](https://www.sahkonhinta.fi/faq?q=mik%C3%A4onsiirtohintajamiksisit%C3%A4eivoikilpailuttaa).

Therefore, a city name is not a unique DSO key: a municipal polygon can intersect several non-overlapping licensed DSO polygons. Each individual connection still resolves to one DSO; the city-level relationship is one-to-many. The WFS snapshot supports treating area as the primary geography: it returned **98 action-area records and 81 distinct organization names** at the audit time. One organization can have several action areas, and the map includes closed-network areas that should not automatically become household tariff rows.

Recommended resolution order:

1. use a point/address or an official responsibility-area geometry when available;
2. use the postal-code feed only as a convenience lookup;
3. if only a city is known, return all candidate DSOs or require explicit operator selection;
4. preserve `action_area_id` and do not collapse the result to a city-name string.

## 3. What the standardized 3 × 25 A “Yleissiirto” values represent

The Omakotiliitto PDF is explicit about the comparison basis:

- it labels the columns as **2026 base fee €/month** and **2026 energy fee cents/kWh**;
- its footnote says the table follows the **Yleissiirto price, fuse size 3 × 25 A**;
- its footnote says the **energy fee is reported without electricity tax**;
- the announcement says the comparison covers all **77 Finnish distribution companies** and was compiled by KTI Kiinteistötieto: [announcement](https://www.sttinfo.fi/tiedote/72011769/sahkon-siirtomaksujen-rakenne-ja-hinta-vaativat-avoimuutta-kuluttajille-sanoo-omakotiliitto?lang=fi&publisherId=67340313), [table PDF](https://www.sttinfo.fi/files/67340313/72011769/375325/fi).

Thus, a comparison row is intended to mean:

`one operator + one general/flat-time distribution product + 3 × 25 A fixed-fee category + variable network-energy rate`

It is not a national “transmission price”, not a complete bill, and not necessarily the customer’s only available tariff. The fixed fee is a monthly connection/product charge; the energy fee is a network charge per kWh. Electricity tax is a separate consumption-based line.

### Important product-interpretation exception

The comparison label is not sufficient to infer that every row is a pure no-power tariff. Lahti’s own tariff page currently lists:

- ordinary `Yleissiirto`, 3 × 25 A: **€6.53/month and 3.79 c/kWh** gross;
- `Yleissiirto teho`: **€7.22/month and 2.95 c/kWh** gross, plus **€1.00/kW/month** power charge.

The Omakotiliitto row for Lahti is **€7.22/month and 2.95 c/kWh**, so it numerically matches `Yleissiirto teho`, not the ordinary no-power product: [Lahti official tariff page](https://www.lahtienergia.fi/lahti-energia-sahkoverkko/sahkoverkon-hinnastot/sahkon-verkkopalvelumaksut/). The final data must carry the product name and a possible power-charge field; otherwise the row is misleading.

### Snapshot and effective-date warning

The table was published on 6 May 2026. It should be treated as a dated comparison snapshot, not as a timeless “2026 tariff”. For example:

- Alajärvi’s current official page lists 3 × 25 A at **€15.15/month and 5.95 c/kWh**, while the comparison has **€14.03 and 5.51**; the page links a tariff effective 1 August 2026: [Alajärven Sähkö official tariff page](https://www.alajarvensahko.fi/hinnastomme/).
- PKS’s official tariff effective 1 August 2026 lists **€42.00 and 5.463 c/kWh**, versus the comparison’s **€42.04 and 5.46**: [PKS official tariff page](https://pkssahkonsiirto.fi/asiointi/hinnasto/), [linked 1 August 2026 PDF](https://pkssahkonsiirto.fi/wp-content/uploads/pkss_verkkopalveluhinnasto_01082026.pdf).

Store `valid_from`, `valid_to` (when known), `retrieved_at`, and `comparison_published_at` separately.

## 4. VAT and electricity-tax treatment

The comparison PDF does not explicitly state its VAT basis in the footnote. Independent first-party checks show that the comparison’s base and energy amounts are generally the **25.5% VAT-inclusive network-service amounts**, while electricity tax is excluded from the reported energy fee. Examples include Alva, Caruna Espoo, Elenia, Helen, Kemin Energia, Leppäkoski, Nivos, and VSV, whose own tariffs show the same values in an `alv 25,5 %` column or state that prices include VAT.

For the tax component:

- electricity tax consists of excise tax plus the security-of-supply charge and is collected with the network bill by the DSO; see [Vero’s electricity-tax tables](https://www.vero.fi/yritykset-ja-yhteisot/verot-ja-maksut/valmisteverotus/sahkovero/verotaulukot/) and the operator examples below;
- from **1 April 2026**, the commonly applicable class I total is **2.325 c/kWh before VAT**; class II is **0.135 c/kWh before VAT**;
- the corresponding class I gross amount shown by operators is about **2.917875 c/kWh** at 25.5% VAT; class II is about **0.169425 c/kWh**, subject to operator rounding;
- before 1 April 2026, first-party tariff sheets show the lower pre-increase values **2.253 c/kWh** (class I) and **0.063 c/kWh** (class II), so a full-year 2026 calculation needs tax effective periods.

The feasibility note should be corrected/clarified here: **2.325 and 0.135 are pre-VAT tax totals, not VAT-inclusive totals.** Do not add VAT a second time to a comparison energy fee already taken from an `alv 25,5 %` column. Conversely, if the final file stores a net tariff, VAT must be applied explicitly and only once.

## 5. Feed-to-comparison reconciliation

Observed at the audit time:

- comparison rows: **77**;
- DSO lookup-feed names: **117**;
- feed names with non-empty postal-code lists: **76**;
- feed names with empty postal-code lists: **41**;
- exact display-name matches between comparison and feed: **71**;
- comparison names without an exact feed-name match: **6**.

The six exact mismatches are not evidence that the comparison rows are invalid. They demonstrate that display names are not a safe join key.

| 2026 comparison name | Feed / official-map evidence | Recommended correction |
| --- | --- | --- |
| `Alva Sähköverkko Oy` | No exact feed name; exact official-map organization name | Add from the responsibility-area source; do not treat feed absence as operator absence. |
| `Keminmaan Energia ja Vesi Oy` | Feed has `Keminmaan Energia Oy`; the official tariff page is branded Keminmaan Energia ja Vesi | Canonicalize to the current legal/operator name and keep the short feed name as an alias. |
| `PKS Sähkönsiirto Oy` | Feed has the apparent typo `PKS Sähkösiirto Oy`; official tariff PDF and comparison use `PKS Sähkönsiirto Oy` | Correct the spelling and retain the feed spelling only as a source alias. |
| `Raseborgs Energi Ab` | Feed has bilingual `Raseborgs Energi Ab - Raaseporin Energia Oy`; WFS organization is `Ekenäs Energi Ab`, with action area `Raseborgs Energi Ab:s elnätsområde` | Use one stable area/operator key with Finnish/Swedish display aliases; do not force the legal name and marketing name to be identical. |
| `Tervolan Energia ja Vesi Oy` | No exact feed name; present in the official map and comparison | Add from the official responsibility-area source and mark the postal-feed record as missing. |
| `VSV Sähköverkko Oy` | No exact feed name; present in the official map and comparison | Add from the official responsibility-area source and mark the postal-feed record as missing. |

Other likely source-feed aliases requiring the same treatment include:

| Comparison/display name | Feed variants observed |
| --- | --- |
| `Elenia Verkko Oyj` | `Elenia Oy` with postal codes and a separate empty `Elenia Verkko Oyj` entry |
| `Haminan Sähköverkko Oy` | `Haminan Energia Oy` plus an empty exact-name entry |
| `Vatajankoski Sähköverkko Oy` | `Vatajankoski Oy` plus an empty exact-name entry |
| `Nivos Verkot Oy` | `Nivos Energia Oy` plus an empty exact-name entry |
| `Leppäkosken Sähkö Oy` | `Leppäkoski Group Oy` plus an empty exact-name entry |
| `Rauman Energia Sähköverkko Oy` | `Rauman Energia Oy` plus an empty exact-name entry |

The raw feed also contains examples such as `Fingrid Oyj`, `EPV Alueverkko Oy`, `Finnish Chemicals Oy`, `Testiyhtiö Oy`, airport/industrial entries, and other special or closed-network records. Those must not be counted as household 3 × 25 A tariff rows merely because they appear in the feed. The official map itself also includes closed distribution networks, so it is a coverage source rather than a household-tariff count.

## 6. First-party tariff checks completed

The following checks compare the Omakotiliitto 2026 row (`base €/month`, `energy c/kWh`) with the operator’s own page or PDF. A “match” means the two displayed components agree at the comparison’s precision; it does not mean the two documents have the same publication/effective date.

| Operator | Comparison 2026 | Own tariff evidence checked | Result / interpretation |
| --- | ---: | --- | --- |
| Alajärven Sähkö Oy | 14.03 / 5.51 | [Official tariff page](https://www.alajarvensahko.fi/hinnastomme/) lists current 3 × 25 A **15.15 / 5.95** and links a 1.8.2026 tariff | Changed after comparison snapshot; not a name error. |
| Alva Sähköverkko Oy | 12.11 / 2.26 | [Official tariff page, 1.4.2026](https://www.alva.fi/sahkoverkko/tuotteet-palvelut-hinnastot/hinnastot-ja-sopimusehdot/verkkopalveluhinnastot/) | Exact match; page says prices include 25.5% VAT and tax is added separately. |
| Caruna Oy | 29.71 / 5.26 | [Official Caruna tariff page](https://caruna.fi/tuotteet-ja-palvelut/kotiin-ja-kiinteistoon/verkkopalveluhinnastot/verkkopalveluhinnasto-caruna-oy) | Exact match, but the page is still headed 1.9.2024; a 2026 effective-date confirmation remains outstanding. |
| Caruna Espoo Oy | 8.18 / 2.77 | [Official tariff page, 1.1.2026](https://caruna.fi/tuotteet-ja-palvelut/kotiin-ja-kiinteistoon/verkkopalveluhinnastot/verkkopalveluhinnasto-caruna-0) | Exact match; official page shows the 25.5% VAT column. |
| Elenia Verkko Oyj | 22.79 / 5.89 | [Official small-customer PDF, 1.4.2026](https://www.elenia.fi/files/3368404e95e6e87870c3efd831994c0a6bf8b693/elenia-pienasiakkaat-hinnasto-4-2026-www-a4-fi-v2.pdf) | Exact match for Yleissiirto 3 × 25 A. |
| Helen Sähköverkko Oy | 6.01 / 4.44 | [Official tariff PDF, valid 1.4.2026](https://www.helensahkoverkko.fi/globalassets/hinnastot-ja-sopimusehdot/hsv/hsv-sahkon-verkkopalvelumaksut-1.4.2026.pdf) | Exact match in the 25.5% VAT column. |
| Kemin Energia ja Vesi Oy | 10.10 / 3.73 | [Official tariff PDF, 1.1.2026](https://www.kenve.fi/wp-content/uploads/2025/11/Sahkon-verkkopalveluhinnasto-01012026.pdf) | Exact match; PDF separately shows electricity tax and total-with-tax. |
| Keminmaan Energia ja Vesi Oy | 12.70 / 3.10 | [Official tariff page](https://kmev.fi/verkkopalveluhinnasto/) headed 1.1.2025 | Exact numeric match, but the currently posted page is not a 2026-effective document; confirm before final publication. |
| Lahti Energia Sähköverkko Oy | 7.22 / 2.95 | [Official tariff page](https://www.lahtienergia.fi/lahti-energia-sahkoverkko/sahkoverkon-hinnastot/sahkon-verkkopalvelumaksut/) | Numeric match is specifically `Yleissiirto teho`; ordinary 3 × 25 A Yleissiirto is 6.53 / 3.79 and the power charge is €1/kW/month. |
| Leppäkosken Sähkö Oy | 21.56 / 4.86 | [Official tariff PDF, 1.2.2026](https://leppakoski.fi/wp-content/uploads/2026/01/Verkkopalveluhinnasto-1.2.2026_.pdf) | Exact match; PDF says prices include 25.5% VAT and tax is collected separately. |
| Nivos Verkot Oy | 20.24 / 4.99 | [Official tariff page, 1.1.2026](https://nivos.fi/sahko/tuotteet-ja-palvelut/verkkopalvelutuotteet-ja-hinnastot/sahkoverkon-verkkopalveluhinnasto-yleistuotteet/) | Exact match; page explicitly says transfer charges exclude electricity tax and separates the components. |
| PKS Sähkönsiirto Oy | 42.04 / 5.46 | [Official tariff page](https://pkssahkonsiirto.fi/asiointi/hinnasto/) and [1.8.2026 PDF](https://pkssahkonsiirto.fi/wp-content/uploads/pkss_verkkopalveluhinnasto_01082026.pdf) list 42.00 / 5.463 | Near match; current fixed fee changed by €0.04 after the comparison snapshot, while energy rounds to 5.46. |
| Turku Energia Sähköverkot Oy | 7.63 / 1.91 | [Official tariff page](https://www.turkuenergia.fi/sahkoverkot/hinnastot/verkkopalveluhinnasto) | Exact match, but the page is headed 1.9.2024; current 2026-effective confirmation remains outstanding. |
| VSV Sähköverkko Oy | 17.80 / 4.30 | [Official 2026 tariff page](https://vsv.fi/sahkoverkko/hinnastot-ja-sopimusehdot) | Exact match; official page shows 25.5% VAT and the post-1.4.2026 tax table. |

This is **14 completed first-party row checks**, exceeding the ten-row checkpoint requirement. The checks are not a complete validation of all 77 rows.

## 7. Recommended final-file schema

Keep operator/coverage, tariff definition, money basis, tax, and provenance in one row per tariff period:

| Field | Required meaning |
| --- | --- |
| `operator_id` | Curated stable operator key; never the display name alone. |
| `operator_name` | Canonical display/legal name. |
| `operator_aliases` | Feed, Finnish/Swedish, former, and spelling variants. |
| `action_area_id` | Official WFS responsibility-area identifier; retain one-to-many areas per operator. |
| `coverage_source_url` | Official map/WFS source used for geography. |
| `municipality_code` / `postal_code` | Optional lookup fields; do not imply one DSO per city. |
| `tariff_id`, `tariff_name`, `tariff_type` | For example `Yleissiirto`, `Yleissiirto teho`, `Yösiirto`. |
| `fuse_size_a` | `3x25` for this comparison; record the operator’s actual grouping rule. |
| `valid_from`, `valid_to` | Tariff-effective period, independent of retrieval date. |
| `base_fee_eur_month_net`, `base_fee_eur_month_gross` | Store the basis explicitly. |
| `energy_charge_cents_kwh_net`, `energy_charge_cents_kwh_gross` | Network charge only; comparison energy value excludes electricity tax. |
| `power_charge_eur_kw_month` and `power_rule` | Nullable; required for rows such as Lahti’s `Yleissiirto teho`. |
| `electricity_tax_class` | Usually class I for households; retain class II as a separate use case. |
| `electricity_tax_cents_kwh_net`, `electricity_tax_cents_kwh_gross` | Separate, effective-dated tax line; do not embed in `energy_charge`. |
| `vat_rate` and `price_basis` | For example `25.5` and `gross_includes_vat`. |
| `source_url`, `retrieved_at`, `source_note` | Audit trail and explanatory exceptions. |

For a household total after 1 April 2026, if the tariff energy value is gross and electricity tax is stored net, the variable transfer component is conceptually:

`energy_charge_gross + electricity_tax_net × (1 + vat_rate)`

That calculation must be period-aware and must not be applied to a tariff source whose energy value already includes tax.

## Outstanding before finalizing the dataset

1. Obtain or build a direct 2026 city-designation enumeration; the current **108** count is an official-source continuity inference, not a direct 2026 status column.
2. Validate the remaining **63 of 77** comparison rows against current first-party tariff pages/PDFs.
3. Confirm 2026-effective documents for rows whose official page is still headed 2024/2025, notably Caruna Oy, Turku Energia, and Keminmaan Energia.
4. Resolve the six feed mismatches into a curated alias/area table, including the Raseborg legal-name/display-name relationship, rather than fixing only strings in the UI.
5. Decide whether the final artifact is a 6 May comparison snapshot or a current effective-date dataset. Do not mix the two without `valid_from`/`retrieved_at` fields.
6. Add a product-level review for every comparison row where the operator’s “Yleissiirto” contains a power charge or another nonstandard condition, with Lahti already confirmed as an example.
