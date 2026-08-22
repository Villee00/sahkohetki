import { describe, expect, it } from "vitest";
import { EVERYDAY_USES, getEverydayUse } from "./appliances";

describe("everyday use catalog", () => {
  it("contains the nine approved standard uses in order", () => {
    expect(EVERYDAY_USES.map((use) => use.id)).toEqual([
      "coffee",
      "kettle",
      "oven",
      "washing",
      "dryer",
      "dishwasher",
      "sauna",
      "television",
      "computer",
    ]);
    expect(EVERYDAY_USES).toHaveLength(9);
  });

  it("uses the researched standard-use consumption references", () => {
    expect(
      EVERYDAY_USES.map(({ id, consumptionKwh }) => ({ id, consumptionKwh })),
    ).toEqual([
      { id: "coffee", consumptionKwh: 0.15 },
      { id: "kettle", consumptionKwh: 0.12 },
      { id: "oven", consumptionKwh: 1.2 },
      { id: "washing", consumptionKwh: 1 },
      { id: "dryer", consumptionKwh: 1.5 },
      { id: "dishwasher", consumptionKwh: 0.75 },
      { id: "sauna", consumptionKwh: 8 },
      { id: "television", consumptionKwh: 0.11 },
      { id: "computer", consumptionKwh: 0.15 },
    ]);
    expect(EVERYDAY_USES.every((use) => !use.assumption.includes("mockup"))).toBe(true);
    expect(EVERYDAY_USES.every((use) => use.source.url.startsWith("https://"))).toBe(true);
  });

  it("keeps each researched definition and review date with the catalog value", () => {
    expect(getEverydayUse("coffee")).toMatchObject({
      name: "Kahvinkeitin",
      standardUse: "Yksi noin litran suodatettava pannullinen, lämpölevy enintään 30 min",
      consumptionKwh: 0.15,
      reviewedOn: "2026-08-22",
    });
    expect(getEverydayUse("sauna")).toMatchObject({
      consumptionKwh: 8,
      assumption: expect.stringContaining("1,5 tuntia"),
      source: expect.objectContaining({ url: expect.stringContaining("helen.fi") }),
    });
  });
});
