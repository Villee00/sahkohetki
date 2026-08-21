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

  it("keeps the provisional values and definitions together", () => {
    expect(getEverydayUse("coffee")).toMatchObject({
      name: "Kahvinkeitin",
      standardUse: "Yksi suodatettava pannullinen",
      consumptionKwh: 0.12,
      reviewedOn: "2026-08-22",
    });
    expect(getEverydayUse("sauna")).toMatchObject({
      consumptionKwh: 8,
      assumption: expect.stringContaining("mockup"),
    });
  });
});
