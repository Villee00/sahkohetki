import type { MunicipalityTransfer } from "./price-types";

export type ReverseGeocodeAddress = Partial<
  Record<"municipality" | "city" | "town" | "village" | "hamlet", string>
>;

const addressFields: Array<keyof ReverseGeocodeAddress> = [
  "municipality",
  "city",
  "town",
  "village",
  "hamlet",
];

export function normalizeMunicipalityName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fi-FI")
    .replace(/\b(kaupunki|kunta|stad)\b/gu, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim();
}

export function findMunicipalityByAddress(
  address: ReverseGeocodeAddress,
  municipalities: readonly MunicipalityTransfer[],
): MunicipalityTransfer | null {
  const municipalitiesByName = new Map(
    municipalities.map((municipality) => [
      normalizeMunicipalityName(municipality.city),
      municipality,
    ]),
  );

  for (const field of addressFields) {
    const value = address[field];
    if (typeof value !== "string" || value.trim().length === 0) continue;

    const municipality = municipalitiesByName.get(
      normalizeMunicipalityName(value),
    );
    if (municipality) return municipality;
  }

  return null;
}
