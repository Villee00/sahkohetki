# Finnish electricity network price in Sähköhetki examples

**Date:** 25 August 2026
**Scope:** research only; no product code changes

## Conclusion

This is feasible as an educational, operator-specific network-charge example. It is not feasible to add one nationally correct “Finnish transmission price” constant: the customer’s location determines the distribution-system operator (DSO), and the DSO cannot be changed for the same connection. The Energy Authority’s consumer comparison describes the electricity bill as network service, energy, and taxes, with network service tied to the local network owner. [Sähkönhinta.fi FAQ](https://www.sahkonhinta.fi/faq) · [Sähkönhinta.fi about the service](https://www.sahkonhinta.fi/aboutus)

The smallest honest extension is a named, dated DSO/tariff example whose variable energy charge can be added to the current spot price. A bill-like estimate is a larger model because the fixed fee and any power charge cannot be derived from a single appliance’s kWh.

## Current Finnish operator and catalog count

**Exact live count (25 August 2026).** Energiavirasto’s current [Sähköverkonhaltijoiden vastuualuekartta](https://energiavirasto.fi/verkonhaltijat-kartalla) covers both distribution-network holders and closed distribution-network holders. Its linked [WFS responsibility-area dataset](https://verkkotietopiste.fi/geoserver/vtp/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=vtp%3Aaction_area_WFS&outputFormat=application%2Fjson&propertyName=action_area_id%2Caction_area_name%2Corganization_name&maxFeatures=200) returned 98 `action_area` records and 81 distinct `organization_name` values at `2026-08-25T16:12:01.562Z` UTC. The corresponding [WFS count query](https://verkkotietopiste.fi/geoserver/vtp/wfs?service=WFS&version=1.1.1&request=GetFeature&typeName=vtp%3Aaction_area_WFS&resultType=hits) reports the 98-area total.

- **81** is the current count of distinct legal/network-holder identities in the full official map universe, including closed distribution networks.
- **98** is the count of current geographic responsibility-area records. It is not a company count: one operator can have several areas, and municipalities/cities can contain more than one operator.
- For an app’s complete network catalog, use **81 operator records** as the operator key set and keep the area IDs/names as separate coverage data. Do not create one record per municipality or city.
- Tariff products are a separate layer: one operator may publish several general, time-of-use, seasonal, or customer-category products. A household-only catalog should explicitly filter out closed-network operators when they have no public residential tariff; the map is an operator/area source, not a tariff-product count. The [Energy Authority comparison-service FAQ](https://www.sahkonhinta.fi/faq?q=mik%C3%A4onsiirtohintajamiksisit%C3%A4eivoikilpailuttaa) confirms that the location determines the local transfer company, while [Electricity Market Act 588/2013, section 54](https://finlex.fi/fi/lainsaadanto/ajantasa/2013/20130588) requires a distribution-network holder to offer different electricity-distribution service products.

## Repository fit

- `lib/appliances.ts:21-29` models each of the current 10 examples as consumption kWh plus assumption, review date, and source metadata; it has no network-tariff concept.
- `lib/price-types.ts:15-21` and `lib/price-domain.ts:88-99` use one `priceCentsPerKwh` scalar for each interval and multiply it by example consumption. The current `applyPriceMargin` seam (`lib/price-domain.ts:325-343`, used by `app/components/price-explorer.tsx`) can mechanically carry one variable c/kWh add-on, but its UI calls that add-on a seller margin and should not silently become a DSO charge.
- `lib/price-source.ts:18,202-216` already converts the spot price to VAT-inclusive euros/cents using 25.5%; the UI explicitly says network charges, electricity tax, and fixed fees are currently excluded (`app/components/price-explorer.tsx:823-828,917-923`).
- `Docs/superpowers/` contains design/plan documents but no research-note convention. This note therefore uses the new `Docs/research/` directory.

## Fields an example needs

| Field | Why it is required |
| --- | --- |
| `operator`, service area, source URL | DSO and price are location-specific. |
| `tariff`, product category, effective date, and connection/fuse category | One DSO can publish several products and fixed fees can vary by fuse size or site category. |
| `energyChargeCentsPerKwh` plus explicit periods/schedule | General, day/night, and seasonal tariffs use different rates. The 2026 Energy Authority order defines the energy component in c/kWh and permits the national time division. [Order 2340/000002/2025 (Energy Authority, Finlex)](https://www.finlex.fi/api/media/authority-regulation/911686/mainPdf/main.pdf?timestamp=2026-02-10T06:41:27.000Z&typeDiscriminator=energy-authority) |
| `fixedFeeEurPerMonth` and its condition | The fixed component is €/calendar month, not a per-use charge. [Energy Authority order](https://www.finlex.fi/api/media/authority-regulation/911686/mainPdf/main.pdf?timestamp=2026-02-10T06:41:27.000Z&typeDiscriminator=energy-authority) |
| optional `powerChargeEurPerKwMonth`, measurement rule, and threshold | Applicable products may charge from measured monthly 60-minute peak power; this cannot be inferred from the example’s energy kWh. [Energy Authority order](https://www.finlex.fi/api/media/authority-regulation/911686/mainPdf/main.pdf?timestamp=2026-02-10T06:41:27.000Z&typeDiscriminator=energy-authority) |
| `electricityTaxClass`, tax rate, security-of-supply component, and effective date | Electricity tax is collected by the network operator; Verohallinto distinguishes classes I and II, and the 1 April 2026 table lists totals of 2.325 c/kWh (I) and 0.135 c/kWh (II). [Verohallinto: electricity tax](https://www.vero.fi/yritykset-ja-yhteisot/verot-ja-maksut/valmisteverotus/sahkovero/) · [2026 tax tables](https://www.vero.fi/yritykset-ja-yhteisot/verot-ja-maksut/valmisteverotus/sahkovero/verotaulukot/) |
| `vatRate` and whether every amount is VAT-inclusive | The general Finnish VAT rate is 25.5%; the app’s spot price is already gross, while tariff sheets may show both net and gross columns. [Verohallinto: VAT rates](https://www.vero.fi/yritykset-ja-yhteisot/verot-ja-maksut/arvonlisaverotus/arvonlisaveroprosentit/) · [Caruna Espoo tariff, 1 January 2026](https://caruna.fi/tuotteet-ja-palvelut/kotiin-ja-kiinteistoon/verkkopalveluhinnastot/verkkopalveluhinnasto-caruna-0) |

## Main caveats confirmed by tariff documents

- **Operator and tariff:** Caruna Espoo’s current sheet separates Yleissiirto, Yösiirto, and Kausisiirto. It gives different c/kWh rates, fixed fees by customer/fuse category, and both VAT-0% and VAT-25.5% columns. For example, its Yösiirto uses day 07–22 and night 22–07; its Kausisiirto uses a winter weekday/day period. [Caruna tariff](https://caruna.fi/tuotteet-ja-palvelut/kotiin-ja-kiinteistoon/verkkopalveluhinnastot/verkkopalveluhinnasto-caruna-0)
- **Time-of-use:** a tariff row must carry its local-time weekday/season rule and be evaluated in `Europe/Helsinki`; a single average add-on would be wrong for day/night or seasonal examples. The national measurement regulation defines day 07–22 and night as the remaining time, and the winter weekday period as 1 November–31 March, Monday–Saturday 07–22, while allowing local alternatives. [Government Decree 767/2021 (Finlex)](https://www.finlex.fi/fi/lainsaadanto/2021/767)
- **Fixed fee:** show it separately unless the product explicitly introduces a monthly allocation assumption such as expected household kWh/month. Allocating it to one appliance would be an illustrative convention, not the actual invoice amount.
- **Taxes:** for a normal household example, class I is the default category because Verohallinto says other electricity belongs to class I; class II is restricted to listed uses such as industry, certain heat-pump/electric-boiler uses, and professional greenhouse cultivation. [Verohallinto: electricity tax](https://www.vero.fi/yritykset-ja-yhteisot/verot-ja-maksut/valmisteverotus/sahkovero/)
- **VAT basis:** normalize every tariff component before combining it with the current gross spot price; never add VAT to a tariff column already marked `alv 25,5 %`.
- **Versioning:** the Energy Authority order applies to distribution products below 110 kV, but its component rules become effective on 1 January 2029. Store tariff effective dates and source links so an example can be refreshed rather than treated as permanent Finnish pricing. [Energy Authority order](https://www.finlex.fi/api/media/authority-regulation/911686/mainPdf/main.pdf?timestamp=2026-02-10T06:41:27.000Z&typeDiscriminator=energy-authority)

## How many networks should be counted?

Use **77 local distribution-system operators** as the planning count for household transfer pricing. The Finnish Government's 2024 proposal describes 77 distribution network operators, each with a geographic responsibility area based on an electricity-network licence issued by the Energy Authority. [HE 197/2024, Finlex](https://www.finlex.fi/fi/hallituksen-esitykset/2024/197) · [Sähkönhinta.fi FAQ](https://www.sahkonhinta.fi/faq)

This is an operator/area count, not a city count: one operator can serve several municipalities, and a municipality can contain more than one network area. The app should therefore maintain a normalized operator list and resolve it by postal code or by an explicitly selected operator/tariff. The comparison service's live DSO feed is useful for this mapping, but its raw records also contain special, high-voltage, legacy, and test entries, so those should not be counted as household tariff presets without filtering. [Sähkönhinta.fi DSO feed](https://ev-shv-prod-app-wa-consumerapi1.azurewebsites.net/api/getdsocollection)

For the first household-facing version, count and support the 77 local DSOs at the operator level, then attach each operator's current tariff products. Do not add Fingrid's national transmission network or high-voltage/special-network operators to the household transfer-price catalog.

## Recommended scope

1. Start with one clearly labelled, versioned DSO example and a VAT-inclusive variable c/kWh network charge. Keep it separate from the existing seller-margin setting.
2. Display the fixed monthly fee, tax class/rate, tariff name, operator/service area, effective date, and source beside the example; do not fold the fixed fee into appliance cards yet.
3. Add day/night or seasonal rates only when the tariff schedule is represented explicitly. Treat power-based products as a later, separate feature requiring load/peak-power input.

This gives a truthful “spot + example network energy charge” comparison now, while avoiding the false implication that it is a user’s exact transfer bill.
