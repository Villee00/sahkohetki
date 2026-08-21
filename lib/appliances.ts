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

export type EverydayUse = {
  id: EverydayUseId;
  name: string;
  standardUse: string;
  consumptionKwh: number;
  assumption: string;
  reviewedOn: string;
};

export const EVERYDAY_USES: readonly EverydayUse[] = [
  {
    id: "coffee",
    name: "Kahvinkeitin",
    standardUse: "Yksi suodatettava pannullinen",
    consumptionKwh: 0.12,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "kettle",
    name: "Vedenkeitin",
    standardUse: "Yksi litra vettä kiehuvaksi",
    consumptionKwh: 0.11,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "oven",
    name: "Uuni",
    standardUse: "Yksi tunti tyypillistä ruoanlaittoa 200 °C:ssa",
    consumptionKwh: 1.5,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "washing",
    name: "Pyykinpesukone",
    standardUse: "Yksi normaali 60 °C pesuohjelma",
    consumptionKwh: 0.8,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "dryer",
    name: "Kuivausrumpu",
    standardUse: "Yksi kuivaussykli",
    consumptionKwh: 1.5,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "dishwasher",
    name: "Astianpesukone",
    standardUse: "Yksi Eco-pesuohjelma",
    consumptionKwh: 1,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "sauna",
    name: "Sauna",
    standardUse: "Yksi saunakerta, lämmitys ja kylpy",
    consumptionKwh: 8,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "television",
    name: "Televisio",
    standardUse: "Yksi tunti 55 tuuman LED-televisiolla",
    consumptionKwh: 0.08,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
  {
    id: "computer",
    name: "Tietokone",
    standardUse: "Yksi tunti pöytätietokoneella",
    consumptionKwh: 0.15,
    assumption: "Väliaikainen oletus, joka perustuu toimitettuun mockupiin.",
    reviewedOn: "2026-08-22",
  },
];

export function getEverydayUse(id: EverydayUseId) {
  return EVERYDAY_USES.find((use) => use.id === id);
}
