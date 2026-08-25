import type {
  ElectricityTax,
  MunicipalityTransfer,
  TransferData,
  TransferTariff,
} from "./price-types";

export const HOUSEHOLD_ELECTRICITY_TAX: ElectricityTax = {
  centsPerKwhVatIncluded: 2.917875,
  effectiveFrom: "2026-04-01",
  sourceUrl:
    "https://www.vero.fi/yritykset-ja-yhteisot/verot-ja-maksut/valmisteverotus/sahkovero/verotaulukot/",
};

export const EMPTY_TRANSFER_DATA: TransferData = {
  municipalities: [],
  electricityTax: HOUSEHOLD_ELECTRICITY_TAX,
};

type CsvRecord = Record<string, string>;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("Transfer CSV contains an unclosed quote.");
  cells.push(cell);
  return cells;
}

function parseCsv(csv: string): CsvRecord[] {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("Transfer CSV has no data rows.");

  const headers = parseCsvLine(lines[0]);
  if (headers.some((header) => header.length === 0)) {
    throw new Error("Transfer CSV contains an empty header.");
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    if (values.length !== headers.length) {
      throw new Error("Transfer CSV row has an unexpected number of columns.");
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function finiteNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function splitNames(value: string | undefined): string[] {
  return (value ?? "")
    .split(";")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function getOperatorName(row: CsvRecord): string {
  return (
    row.canonical_operator_name?.trim() || row.raw_dso_name_from_feed?.trim() || ""
  );
}

function createUnavailableTariff(
  municipalityCode: string,
  operatorName: string,
  row: CsvRecord | undefined,
): TransferTariff {
  return {
    id: `${municipalityCode}:${operatorName}`,
    operatorName,
    monthlyFixedFeeEur: null,
    energyChargeCentsPerKwh: null,
    priceAvailable: false,
    tariffName:
      row?.tariff_name?.trim() || "Yleissiirto / general-transfer",
    tariffStatus: row?.tariff_status?.trim() || "not_in_snapshot",
    tariffSnapshotCreatedAt: row?.tariff_snapshot_created_at?.trim() || "",
    tariffSourceUrl: row?.tariff_source_url?.trim() || null,
    notes: row?.notes?.trim() || "Hinta ei ole saatavilla tässä aineistossa.",
  };
}

function createTariff(
  municipalityCode: string,
  operatorName: string,
  row: CsvRecord,
): TransferTariff {
  const monthlyFixedFeeEur = finiteNumber(row.monthly_fixed_fee_eur_vat_incl);
  const energyChargeCentsPerKwh = finiteNumber(
    row.energy_charge_cents_kwh_vat_incl_excl_electricity_tax,
  );
  const priceAvailable =
    row.price_available?.trim().toLowerCase() === "yes" &&
    monthlyFixedFeeEur !== null &&
    energyChargeCentsPerKwh !== null;

  return {
    id: `${municipalityCode}:${operatorName}`,
    operatorName,
    monthlyFixedFeeEur: priceAvailable ? monthlyFixedFeeEur : null,
    energyChargeCentsPerKwh: priceAvailable ? energyChargeCentsPerKwh : null,
    priceAvailable,
    tariffName:
      row.tariff_name?.trim() || "Yleissiirto / general-transfer",
    tariffStatus: row.tariff_status?.trim() || "unknown",
    tariffSnapshotCreatedAt: row.tariff_snapshot_created_at?.trim() || "",
    tariffSourceUrl: row.tariff_source_url?.trim() || null,
    notes: row.notes?.trim() || "",
  };
}

function buildMunicipality(
  rows: CsvRecord[],
  municipalityCode: string,
): MunicipalityTransfer {
  const firstRow = rows[0];
  const aliases = new Map<string, string>();
  const rowsByOperator = new Map<string, CsvRecord>();

  for (const row of rows) {
    const operatorName = getOperatorName(row);
    if (!operatorName) continue;
    rowsByOperator.set(operatorName, row);
    aliases.set(operatorName, operatorName);
    const rawName = row.raw_dso_name_from_feed?.trim();
    if (rawName) aliases.set(rawName, operatorName);
  }

  const operatorNames = new Set<string>(rowsByOperator.keys());
  for (const observedName of splitNames(
    firstRow.observed_municipality_dso_names,
  )) {
    operatorNames.add(aliases.get(observedName) ?? observedName);
  }

  const operators = [...operatorNames]
    .sort((left, right) => left.localeCompare(right, "fi"))
    .map((operatorName) => {
      const row = rowsByOperator.get(operatorName);
      return row
        ? createTariff(municipalityCode, operatorName, row)
        : createUnavailableTariff(municipalityCode, operatorName, firstRow);
    });

  return {
    municipalityCode,
    city: firstRow.city.trim(),
    designation: firstRow.designation.trim(),
    operators,
  };
}

export function parseTransferCsv(csv: string): TransferData {
  const rows = parseCsv(csv);
  const rowsByMunicipality = new Map<string, CsvRecord[]>();

  for (const row of rows) {
    const municipalityCode = row.municipality_code?.trim();
    if (!municipalityCode || !row.city?.trim()) {
      throw new Error("Transfer CSV row is missing municipality identity.");
    }
    const municipalityRows = rowsByMunicipality.get(municipalityCode) ?? [];
    municipalityRows.push(row);
    rowsByMunicipality.set(municipalityCode, municipalityRows);
  }

  const municipalities = [...rowsByMunicipality.entries()]
    .map(([municipalityCode, municipalityRows]) =>
      buildMunicipality(municipalityRows, municipalityCode),
    )
    .sort((left, right) => left.city.localeCompare(right.city, "fi"));

  return {
    municipalities,
    electricityTax: HOUSEHOLD_ELECTRICITY_TAX,
  };
}
