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
      "Yksi noin litran suodatettava pannullinen, lämpölevy enintään 30 min",
    consumptionKwh: 0.15,
    assumption:
      "Vertailuarvo sisältää noin litran kahvin valmistuksen ja enintään 30 minuuttia lämpölevyllä.",
    reviewedOn: "2026-08-22",
    source: {
      label: "TTS / Doria – Kahvinkeittimien testi 2020",
      url: "https://www.doria.fi/handle/10024/189370",
    },
  },
  {
    id: "sauna",
    name: "Sauna",
    standardUse: "Yksi noin 1,5 h:n saunomiskerta, lämmitys ja kylpy",
    consumptionKwh: 8,
    assumption:
      "Vertailuarvo sisältää noin 1,5 tuntia sähkökiukaan päälläoloa, esilämmityksen ja normaalin saunomisen.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Helen – saunan lämmittäminen",
      url: "https://www.helen.fi/asiakastuki/henkiloasiakkaat/energiankayton-neuvonta/usein-kysyttya",
    },
  },
  {
    id: "oven",
    name: "Uuni",
    standardUse: "Esilämmitys ja yksi tunti ruoanlaittoa 200 °C:ssa",
    consumptionKwh: 1.2,
    assumption:
      "Vertailuarvo koostuu noin 0,50 kWh esilämmityksestä ja 0,70 kWh:n yhden tunnin ylläpidosta 200 °C:ssa.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Helen – uunin kulutus 200 °C:ssa",
      url: "https://www.helen.fi/asiakastuki/henkiloasiakkaat/energiankayton-neuvonta/kodinkoneiden-hankinta/lattia-ja-kalusteliedet",
    },
  },
  {
    id: "washing",
    name: "Pyykinpesukone",
    standardUse: "Yksi tavallinen täysi 60 °C puuvillapesu",
    consumptionKwh: 1,
    assumption:
      "Vertailuarvo yhdelle normaalille 60 °C pesuohjelmalle ilman esipesua, lisähuuhtelua tai kuivausta.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Helen – pyykinpesu 60 asteessa",
      url: "https://www.helen.fi/artikkelit/2024/nain-ohjaat-sahkonkulutusta-edullisille-hetkille",
    },
  },
  {
    id: "kettle",
    name: "Vedenkeitin",
    standardUse: "Yksi litra kylmää vettä kiehuvaksi",
    consumptionKwh: 0.12,
    assumption:
      "Vertailuarvo perustuu yhden litran kylmän vesimäärän kuumentamiseen kiehumispisteeseen.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Motiva – vedenkeittimen mittausesimerkki",
      url: "https://www.motiva.fi/files/986/Pitkajarvenkoulu_laskutehtavat.pdf",
    },
  },

  {
    id: "dryer",
    name: "Kuivausrumpu",
    standardUse: "Yksi noin 3 kg:n kuivaussykli",
    consumptionKwh: 1.5,
    assumption:
      "Vertailuarvo on pyöristetty keskilukema noin 3 kg:n kuormalle; lämpöpumppu- ja perinteiset kuivausrummut kuluttavat eri määrän.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Helen – pyykin kuivaus",
      url: "https://www.helen.fi/asiakastuki/henkiloasiakkaat/energiankayton-neuvonta/kodinkoneiden-hankinta/pyykin-kuivaus",
    },
  },
  {
    id: "dishwasher",
    name: "Astianpesukone",
    standardUse: "Yksi täysi Eco-pesuohjelma",
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
    id: "television",
    name: "Televisio",
    standardUse: "Yksi tunti 55 tuuman LED-televisiolla SDR-kuvatilassa",
    consumptionKwh: 0.11,
    assumption:
      "Vertailuarvo käyttää 55 tuuman LED-television tavallisen SDR-katselun kulutuksen vaihteluvälin keskikohtaa.",
    reviewedOn: "2026-08-22",
    source: {
      label: "Fortum – kodinkoneiden sähkönkulutus",
      url: "https://yhdessa.fortum.fi/kodinkoneiden-sahkonkulutus-tiedatko-paljonko-laitteesi-kuluttavat",
    },
  },
  {
    id: "computer",
    name: "Tietokone",
    standardUse: "Yksi tunti aktiivista pöytätietokonekäyttöä",
    consumptionKwh: 0.15,
    assumption:
      "Vertailuarvo kuvaa tavallista aktiivista pöytätietokonekäyttöä ilman erillistä näyttöä, kaiuttimia tai oheislaitteita.",
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
