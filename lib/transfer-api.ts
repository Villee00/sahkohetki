import type {
  ElectricityTax,
  MunicipalityTransfer,
  TransferData,
  TransferTariff,
} from "./price-types";

export const TRANSFER_COST_API_PRICING = {
  currency: "EUR",
  vatIncluded: true,
  energyUnit: "cents-per-kwh",
  fixedFeeUnit: "euros-per-month",
} as const;

export type TransferCostPricing = typeof TRANSFER_COST_API_PRICING;

export type TransferCostElectricityTax = ElectricityTax & {
  taxClass: "I";
};

export type TransferCostTariff = Omit<
  TransferTariff,
  "energyChargeCentsPerKwh"
> & {
  transferEnergyChargeCentsPerKwh: number | null;
  combinedVariableChargeCentsPerKwh: number | null;
};

export type TransferCostMunicipality = Omit<MunicipalityTransfer, "operators"> & {
  operators: readonly TransferCostTariff[];
};

export type TransferCostApiResponse = {
  pricing: TransferCostPricing;
  electricityTax: TransferCostElectricityTax;
  municipalities: readonly TransferCostMunicipality[];
};

function compareFinnishNames(left: string, right: string): number {
  return left.localeCompare(right, "fi");
}

function projectTariff(
  tariff: TransferTariff,
  electricityTaxCentsPerKwh: number,
): TransferCostTariff {
  const priceAvailable =
    tariff.priceAvailable &&
    tariff.monthlyFixedFeeEur !== null &&
    tariff.energyChargeCentsPerKwh !== null;
  const transferEnergyChargeCentsPerKwh = priceAvailable
    ? tariff.energyChargeCentsPerKwh
    : null;

  return {
    id: tariff.id,
    operatorName: tariff.operatorName,
    monthlyFixedFeeEur: priceAvailable ? tariff.monthlyFixedFeeEur : null,
    transferEnergyChargeCentsPerKwh,
    combinedVariableChargeCentsPerKwh:
      transferEnergyChargeCentsPerKwh === null
        ? null
        : transferEnergyChargeCentsPerKwh + electricityTaxCentsPerKwh,
    priceAvailable,
    tariffName: tariff.tariffName,
    tariffStatus: tariff.tariffStatus,
    tariffSnapshotCreatedAt: tariff.tariffSnapshotCreatedAt,
    tariffSourceUrl: tariff.tariffSourceUrl,
    notes: tariff.notes,
  };
}

function projectMunicipality(
  municipality: MunicipalityTransfer,
  electricityTaxCentsPerKwh: number,
): TransferCostMunicipality {
  return {
    municipalityCode: municipality.municipalityCode,
    city: municipality.city,
    designation: municipality.designation,
    operators: [...municipality.operators]
      .sort((left, right) => compareFinnishNames(left.operatorName, right.operatorName))
      .map((tariff) => projectTariff(tariff, electricityTaxCentsPerKwh)),
  };
}

export function buildTransferCostApiResponse(
  transferData: TransferData,
): TransferCostApiResponse {
  const electricityTax = {
    taxClass: "I" as const,
    ...transferData.electricityTax,
  };

  return {
    pricing: TRANSFER_COST_API_PRICING,
    electricityTax,
    municipalities: [...transferData.municipalities]
      .sort((left, right) => compareFinnishNames(left.city, right.city))
      .map((municipality) =>
        projectMunicipality(
          municipality,
          transferData.electricityTax.centsPerKwhVatIncluded,
        ),
      ),
  };
}
