import { expect, it } from "vitest";
import { findMunicipalityByAddress } from "./municipality-location";
import type { MunicipalityTransfer } from "./price-types";

const municipalities: MunicipalityTransfer[] = [
  { municipalityCode: "240", city: "Kemi", designation: "kaupunki", operators: [] },
  { municipalityCode: "564", city: "Oulu", designation: "kaupunki", operators: [] },
];

it("matches the reverse-geocoder municipality to the local municipality code", () => {
  expect(
    findMunicipalityByAddress(
      { municipality: "Kemi", city: "Oulu" },
      municipalities,
    ),
  ).toMatchObject({ municipalityCode: "240", city: "Kemi" });
});

it("returns no municipality when the reverse-geocoder place is outside the CSV", () => {
  expect(
    findMunicipalityByAddress({ city: "Rovaniemi" }, municipalities),
  ).toBeNull();
});
