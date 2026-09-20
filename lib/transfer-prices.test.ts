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

  it("does not copy tariff provenance onto an observed-only operator", () => {
    const header = snapshotCsv.split(/\r?\n/, 1)[0] ?? "";
    const columns = header.replaceAll('"', "").split(",");
    const values: Record<string, string> = {
      municipality_code: "999",
      city: "Testikaupunki",
      designation: "kaupunki",
      raw_dso_name_from_feed: "Known Operator",
      canonical_operator_name: "Known Operator",
      monthly_fixed_fee_eur_vat_incl: "10",
      energy_charge_cents_kwh_vat_incl_excl_electricity_tax: "3",
      tariff_name: "Yleissiirto / general-transfer",
      tariff_snapshot_created_at: "2026-05-04",
      tariff_status: "matched",
      price_available: "yes",
      tariff_source_url: "https://example.com/known-operator",
      observed_municipality_dso_names: "Known Operator;Observed Only Operator",
    };
    const row = columns
      .map((column) => `"${(values[column] ?? "").replaceAll('"', '""')}"`)
      .join(",");

    const data = parseTransferCsv(`${header}\n${row}`);
    const observedOnly = data.municipalities[0]?.operators.find(
      (operator) => operator.operatorName === "Observed Only Operator",
    );

    expect(observedOnly).toMatchObject({
      priceAvailable: false,
      tariffStatus: "not_in_snapshot",
      tariffSnapshotCreatedAt: "",
      tariffSourceUrl: null,
      notes: "Hinta ei ole saatavilla tässä aineistossa.",
    });
  });
});
