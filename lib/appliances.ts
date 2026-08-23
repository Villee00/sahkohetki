export const EVERYDAY_USE_IDS = [
  "coffee",
  "kettle",
  "oven",
  "washing",
  "dryer",
  "dishwasher",
  "sauna",
  "television",
  "computer",
] as const;

export type EverydayUseId = (typeof EVERYDAY_USE_IDS)[number];

export type EverydayUseSource = {
  label: string;
  url: string;
};

export type EverydayUse = {
  id: EverydayUseId;
  name: string;
  standardUse: string;
  consumptionKwh: number;
  assumption: string;
  reviewedOn: string;
  source: EverydayUseSource;
};

export const EVERYDAY_USES: readonly EverydayUse[] = [
  {
    id: "coffee",
    name: "Kahvinkeitin",
    standardUse:
      "Yksi noin litran suodatinkahvipannullinen, lämpölevy enintään 30 minuuttia",
    consumptionKwh: 0.15,
    assumption:
      "Vertailuarvo sisältää noin litran kahvin valmistuksen ja lämpölevyn käytön enintään 30 minuutin ajan.",
    reviewedOn: "2026-08-22",
    source: {
      label: "TTS / Doria – Kahvinkeittimien testi 2020",
      url: "https://www.doria.fi/handle/10024/189370",
    },
  },
  {
    id: "kettle",
    name: "Vedenkeitin",
    standardUse: "Yksi litra kylmää vettä kiehuvaksi",
    consumptionKwh: 0.12,
    assumption:
      "Vertailuarvo perustuu yhden litran kylmän veden kuumentamiseen kiehuvaksi.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Motiva – vedenkeittimen mittausesimerkki",
      url: "https://www.motiva.fi/files/986/Pitkajarvenkoulu_laskutehtavat.pdf",
    },
  },
  {
    id: "oven",
    name: "Uuni",
    standardUse: "Esilämmitys ja yksi tunti ruoanlaittoa 200 °C:ssa",
    consumptionKwh: 1.2,
    assumption:
      "Vertailuarvo koostuu noin 0,50 kWh:n esilämmityksestä ja 0,70 kWh:n kulutuksesta lämpötilan ylläpitoon yhden tunnin ajan 200 °C:ssa.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Helen – uunin kulutus 200 °C:ssa",
      url: "https://www.helen.fi/asiakastuki/henkiloasiakkaat/energiankayton-neuvonta/kodinkoneiden-hankinta/lattia-ja-kalusteliedet",
    },
  },
  {
    id: "washing",
    name: "Pyykinpesukone",
    standardUse: "Yksi tavallinen täysi 60 °C:n puuvillapesu",
    consumptionKwh: 1,
    assumption:
      "Vertailuarvo vastaa yhtä tavallista 60 °C:n pesuohjelmaa ilman esipesua, lisähuuhtelua tai kuivausta.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Helen – pyykinpesu 60 °C:ssa",
      url: "https://www.helen.fi/artikkelit/2024/nain-ohjaat-sahkonkulutusta-edullisille-hetkille",
    },
  },
  {
    id: "dryer",
    name: "Kuivausrumpu",
    standardUse: "Yksi noin 3 kg:n kuivaussykli",
    consumptionKwh: 1.5,
    assumption:
      "Vertailuarvo on noin 3 kg:n kuormalle pyöristetty keskilukema; lämpöpumppu- ja perinteiset kuivausrummut kuluttavat eri määriä sähköä.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Helen – pyykin kuivaus",
      url: "https://www.helen.fi/asiakastuki/henkiloasiakkaat/energiankayton-neuvonta/kodinkoneiden-hankinta/pyykin-kuivaus",
    },
  },
  {
    id: "dishwasher",
    name: "Astianpesukone",
    standardUse: "Yksi täysi Eco-ohjelma",
    consumptionKwh: 0.75,
    assumption:
      "Vertailuarvo vastaa modernin täysikokoisen astianpesukoneen Eco-ohjelman pyöristettyä kulutusta.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Siemens – astianpesukoneen Eco-kulutus",
      url: "https://www.siemens-home.bsh-group.com/be/nl/toestellen/vaatwassen/de-juiste-vaatwasser-kiezen",
    },
  },
  {
    id: "sauna",
    name: "Sauna",
    standardUse: "Yksi noin 1,5 tunnin saunomiskerta lämmityksineen",
    consumptionKwh: 8,
    assumption:
      "Vertailuarvo sisältää noin 1,5 tuntia sähkökiukaan käyttöä, esilämmityksen ja tavanomaisen saunomisen.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Helen – saunan lämmittäminen",
      url: "https://www.helen.fi/asiakastuki/henkiloasiakkaat/energiankayton-neuvonta/usein-kysyttya",
    },
  },
  {
    id: "television",
    name: "Televisio",
    standardUse: "Yksi tunti 55-tuumaisen LED-television katselua SDR-kuvatilassa",
    consumptionKwh: 0.11,
    assumption:
      "Vertailuarvo on 55-tuumaisen LED-television tavanomaisen SDR-katselun kulutusvaihteluvälin keskikohta.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Fortum – kodinkoneiden sähkönkulutus",
      url: "https://yhdessa.fortum.fi/kodinkoneiden-sahkonkulutus-tiedatko-paljonko-laitteesi-kuluttavat",
    },
  },
  {
    id: "computer",
    name: "Tietokone",
    standardUse: "Yksi tunti aktiivista käyttöä pöytätietokoneella",
    consumptionKwh: 0.15,
    assumption:
      "Vertailuarvo kuvaa tavallista aktiivista pöytätietokoneen käyttöä ilman erillistä näyttöä, kaiuttimia tai oheislaitteita.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Fortum – kodinkoneiden sähkönkulutus",
      url: "https://yhdessa.fortum.fi/kodinkoneiden-sahkonkulutus-tiedatko-paljonko-laitteesi-kuluttavat",
    },
  },
];

export function getEverydayUse(id: EverydayUseId) {
  return EVERYDAY_USES.find((use) => use.id === id);
}
