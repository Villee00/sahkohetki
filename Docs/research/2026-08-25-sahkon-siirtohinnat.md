# Finnish city electricity-transfer prices, 2026

**Generated:** 2026-08-25

## What is included

[data/sahkon-siirtohinnat-kaupungit-2026.csv](../data/sahkon-siirtohinnat-kaupungit-2026.csv) contains all **108 Finnish municipalities using the city designation**. It expands a city into one row per distribution-operator candidate returned for the selected representative 2026 Paavo postal code, rather than pretending that a municipality has one universal electricity-network price.

- City rows: **108**
- City/operator candidate rows: **220**
- Rows with a price from the 77-operator comparison snapshot: **217**
- Rows without a price: **3**
- Tariff basis: **Yleissiirto, 3 × 25 A**, fixed fee in €/month including VAT and network-energy charge in c/kWh including VAT but excluding electricity tax.
- Snapshot source created: **2026-05-04**; release published: **2026-05-06**; data retrieved: **2026-08-25**.

## Important interpretation

Electricity distribution tariffs are operator- and connection-specific, not city-wide. The city-coverage research found **72** representative postal codes with multiple DSO matches and **73** city rows that cannot support a single exact city answer from postal-code data alone. Those rows retain every representative DSO candidate and its price. **Maarianhamina has no match in the mainland DSO feed**, so its price cells remain empty.

The CSV values are a consistent 2026 comparison snapshot, not a claim that every operator’s tariff was unchanged on 2026-08-25. Some official operator pages already show later effective tariffs; those differences are carried in the tariff_status and notes columns. Lahti’s matching row is Yleissiirto teho and has a separate 1.00 €/kW/month power charge.

## Sources

- [Omakotiliitto/KTI 2026 comparison attachment](https://www.sttinfo.fi/files/67340313/72011769/375325/fi)
- [Omakotiliitto release](https://www.sttinfo.fi/tiedote/72011769/sahkon-siirtomaksujen-rakenne-ja-hinta-vaativat-avoimuutta-kuluttajille-sanoo-omakotiliitto?lang=fi&publisherId=67340313)
- [Statistics Finland Paavo 2026 postal-area WFS](https://geo.stat.fi/geoserver/postialue/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=postialue:pno_2026&outputFormat=application/json&count=5000&propertyName=posti_alue,nimi,kunta,pinta_ala)
- [Sähkönhinta.fi official DSO feed](https://ev-shv-prod-app-wa-consumerapi1.azurewebsites.net/api/getdsocollection)
- [Statistics Finland Municipalities 2026](https://stat.fi/en/luokitukset/kunta/kunta_1_20260101)
- [Kuntaliitto 108-city count](https://www.kuntaliitto.fi/valtuutettu/nain-kunta-toimii)

The detailed source extraction and audit trail are in [the city coverage research](2026-08-25-city-coverage-agent.md), [the tariff table research](2026-08-25-tariff-table-agent.md), and [the validation audit](2026-08-25-validation-agent.md).
