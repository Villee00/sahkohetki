import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTransferCsv } from "./transfer-prices";

const snapshotCsv = readFileSync(
  `${process.cwd()}/data/sahkon-siirtohinnat-kaupungit-2026.csv`,
  "utf8",
);

describe("transfer price snapshot", () => {
  it("groups the CSV into municipality and DSO choices", () => {
    const data = parseTransferCsv(snapshotCsv);
    const kemi = data.municipalities.find(
      (municipality) => municipality.municipalityCode === "240",
    );

    expect(data.municipalities).toHaveLength(108);
    expect(kemi?.city).toBe("Kemi");
    expect(kemi?.operators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operatorName: "Kemin Energia ja Vesi Oy",
          monthlyFixedFeeEur: 10.1,
          energyChargeCentsPerKwh: 3.73,
          priceAvailable: true,
        }),
      ]),
    );
  });

  it("keeps unavailable operators visible and includes the household tax", () => {
    const data = parseTransferCsv(snapshotCsv);
    const jyvaskyla = data.municipalities.find(
      (municipality) => municipality.municipalityCode === "179",
    );

    expect(jyvaskyla?.operators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operatorName: "JE-Siirto Oy",
          priceAvailable: false,
          monthlyFixedFeeEur: null,
          energyChargeCentsPerKwh: null,
        }),
      ]),
    );
    expect(data.electricityTax).toMatchObject({
      centsPerKwhVatIncluded: 2.917875,
      effectiveFrom: "2026-04-01",
    });
  });
});
