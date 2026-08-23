import { describe, expect, it } from "vitest";
import { EVERYDAY_USES, getEverydayUse } from "./appliances";

describe("everyday use catalog", () => {
  it("contains the ten approved standard uses in order", () => {
    expect(EVERYDAY_USES.map((use) => use.id)).toEqual([
      "coffee",
      "sauna",
      "oven",
      "dishwasher",
      "heat-pump",
      "washing",
      "dryer",
      "kettle",
      "television",
      "computer",
    ]);
    expect(EVERYDAY_USES).toHaveLength(10);
  });

  it("uses the researched standard-use consumption references", () => {
    expect(
      EVERYDAY_USES.map(({ id, consumptionKwh }) => ({ id, consumptionKwh })),
    ).toEqual([
      { id: "coffee", consumptionKwh: 0.15 },
      { id: "sauna", consumptionKwh: 8 },
      { id: "oven", consumptionKwh: 1.2 },
      { id: "dishwasher", consumptionKwh: 1.25 },
      { id: "heat-pump", consumptionKwh: 0.6 },
      { id: "washing", consumptionKwh: 1 },
      { id: "dryer", consumptionKwh: 1.5 },
      { id: "kettle", consumptionKwh: 0.12 },
      { id: "television", consumptionKwh: 0.11 },
      { id: "computer", consumptionKwh: 0.15 },
    ]);
    expect(
      EVERYDAY_USES.every((use) => !use.assumption.includes("mockup")),
    ).toBe(true);
    expect(
      EVERYDAY_USES.every((use) => use.source.url.startsWith("https://")),
    ).toBe(true);
  });

  it("keeps each researched definition and review date with the catalog value", () => {
    expect(getEverydayUse("coffee")).toMatchObject({
      name: "Kahvinkeitin",
      standardUse:
        "Yksi noin litran suodatinkahvipannullinen, lämpölevy enintään 30 minuuttia",
      consumptionKwh: 0.15,
      reviewedOn: "2026-08-22",
    });
    expect(getEverydayUse("sauna")).toMatchObject({
      consumptionKwh: 8,
      assumption: expect.stringContaining("1,5 tuntia"),
      source: expect.objectContaining({
        url: expect.stringContaining("helen.fi"),
      }),
    });
    expect(getEverydayUse("washing")).toMatchObject({
      standardUse: "Yksi täysi 60 °C:n peruspesuohjelma",
      consumptionKwh: 1,
      assumption: expect.stringContaining("ei Eco 40–60"),
      source: expect.objectContaining({
        url: "https://www.helen.fi/asiakastuki/henkiloasiakkaat/energiankayton-neuvonta/kodinkoneiden-hankinta/pyykinpesukoneet",
      }),
    });
    expect(getEverydayUse("dishwasher")).toMatchObject({
      name: "Astianpesukone",
      standardUse: "Yksi täysi normaali astianpesu (kylmävesiliitäntä)",
      consumptionKwh: 1.25,
      assumption: expect.stringContaining("1,0–1,5 kWh/kerta"),
      source: expect.objectContaining({
        label: "Vattenfall – kodin sähkölaitteiden energiankulutus",
        url: "https://www.vattenfall.fi/energianeuvonta/sahkonkulutus/sahkolaitteiden-energiankulutus/",
      }),
    });
    expect(getEverydayUse("heat-pump")).toMatchObject({
      name: "Ilmalämpöpumppu",
      standardUse: "Yksi tunti ilmalämpöpumpun lämmitystä",
      consumptionKwh: 0.6,
      assumption: expect.stringContaining("0,6 kWh/tunti"),
      source: expect.objectContaining({
        label: "Vattenfall – kodin sähkölaitteiden energiankulutus",
        url: "https://www.vattenfall.fi/energianeuvonta/sahkonkulutus/sahkolaitteiden-energiankulutus/",
      }),
    });
  });
});
