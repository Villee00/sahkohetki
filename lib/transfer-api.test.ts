import { describe, expect, it } from "vitest";
import { buildTransferCostApiResponse } from "./transfer-api";
import type { TransferData, TransferTariff } from "./price-types";

function tariff(overrides: Partial<TransferTariff>): TransferTariff {
  return {
    id: "default:operator",
    operatorName: "Default Operator",
    monthlyFixedFeeEur: 10,
    energyChargeCentsPerKwh: 3.73,
    priceAvailable: true,
    tariffName: "Yleissiirto / general-transfer",
    tariffStatus: "verified",
    tariffSnapshotCreatedAt: "2026-05-04",
    tariffSourceUrl: "https://example.com/tariff",
    notes: "",
    ...overrides,
  };
}

const transferData: TransferData = {
  electricityTax: {
    centsPerKwhVatIncluded: 2.917875,
    effectiveFrom: "2026-04-01",
    sourceUrl: "https://example.com/tax",
  },
  municipalities: [
    {
      municipalityCode: "179",
      city: "Jyväskylä",
      designation: "kaupunki",
      operators: [
        tariff({
          id: "179:Unavailable Operator",
          operatorName: "Unavailable Operator",
          monthlyFixedFeeEur: null,
          energyChargeCentsPerKwh: null,
          priceAvailable: false,
          tariffSourceUrl: null,
          notes: "Not available in snapshot",
        }),
        tariff({
          id: "179:Available Operator",
          operatorName: "Available Operator",
        }),
      ],
    },
    {
      municipalityCode: "005",
      city: "Alajärvi",
      designation: "kaupunki",
      operators: [
        tariff({
          id: "005:Alajärven Sähkö Oy",
          operatorName: "Alajärven Sähkö Oy",
        }),
      ],
    },
  ],
};

describe("transfer cost API projection", () => {
  it("returns stable pricing metadata and sorted municipality/operator records", () => {
    const response = buildTransferCostApiResponse(transferData);

    expect(response.pricing).toEqual({
      currency: "EUR",
      vatIncluded: true,
      energyUnit: "cents-per-kwh",
      fixedFeeUnit: "euros-per-month",
    });
    expect(response.electricityTax).toEqual({
      taxClass: "I",
      ...transferData.electricityTax,
    });
    expect(response.municipalities.map(({ city }) => city)).toEqual([
      "Alajärvi",
      "Jyväskylä",
    ]);
    expect(response.municipalities[1]?.operators.map(({ operatorName }) => operatorName)).toEqual([
      "Available Operator",
      "Unavailable Operator",
    ]);
  });

  it("calculates the combined variable charge for an available tariff", () => {
    const response = buildTransferCostApiResponse(transferData);
    const availableTariff = response.municipalities[1]?.operators[0];

    expect(availableTariff).toMatchObject({
      id: "179:Available Operator",
      operatorName: "Available Operator",
      monthlyFixedFeeEur: 10,
      transferEnergyChargeCentsPerKwh: 3.73,
      combinedVariableChargeCentsPerKwh: 6.647875,
      priceAvailable: true,
    });
  });

  it("keeps unavailable tariffs with null monetary fields", () => {
    const response = buildTransferCostApiResponse(transferData);
    const unavailableTariff = response.municipalities[1]?.operators[1];

    expect(unavailableTariff).toMatchObject({
      id: "179:Unavailable Operator",
      priceAvailable: false,
      monthlyFixedFeeEur: null,
      transferEnergyChargeCentsPerKwh: null,
      combinedVariableChargeCentsPerKwh: null,
      tariffSourceUrl: null,
      notes: "Not available in snapshot",
    });
  });
});
