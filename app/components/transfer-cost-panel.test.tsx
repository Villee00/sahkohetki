// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { type TransferData } from "../../lib/price-types";
import { TransferCostPanel } from "./transfer-cost-panel";

afterEach(() => cleanup());

const transferData: TransferData = {
  municipalities: [
    {
      municipalityCode: "240",
      city: "Kemi",
      designation: "kaupunki",
      operators: [
        {
          id: "240:Kemin Energia ja Vesi Oy",
          operatorName: "Kemin Energia ja Vesi Oy",
          monthlyFixedFeeEur: 10.1,
          energyChargeCentsPerKwh: 3.73,
          priceAvailable: true,
          tariffName: "Yleissiirto / general-transfer",
          tariffStatus: "matched",
          tariffSnapshotCreatedAt: "2026-05-04",
          tariffSourceUrl: "https://example.test/kemi.pdf",
          notes: "",
        },
        {
          id: "240:Tenergia Oy",
          operatorName: "Tenergia Oy",
          monthlyFixedFeeEur: null,
          energyChargeCentsPerKwh: null,
          priceAvailable: false,
          tariffName: "Yleissiirto / general-transfer",
          tariffStatus: "not_in_snapshot",
          tariffSnapshotCreatedAt: "2026-05-04",
          tariffSourceUrl: null,
          notes: "Price unavailable",
        },
      ],
    },
  ],
  electricityTax: {
    centsPerKwhVatIncluded: 2.917875,
    effectiveFrom: "2026-04-01",
    sourceUrl: "https://www.vero.fi/",
  },
};

it("labels the transfer selectors and enables operators after a municipality is selected", () => {
  const onMunicipalityChange = vi.fn();
  const { rerender } = render(
    <TransferCostPanel
      data={transferData}
      selectedMunicipalityCode=""
      selectedOperatorId=""
      selectedMunicipality={null}
      selectedTariff={null}
      onMunicipalityChange={onMunicipalityChange}
      onOperatorChange={vi.fn()}
      onLocate={vi.fn()}
      locationStatus="idle"
      locationMessage={null}
    />,
  );

  expect(screen.getByRole("combobox", { name: "Kunta" })).toBeTruthy();
  const operatorControl = screen.getByRole("combobox", {
    name: "Sähköverkkoyhtiö",
  }) as HTMLButtonElement;
  expect(operatorControl.disabled).toBe(true);
  expect(
    operatorControl
      .closest('[data-slot="field"]')
      ?.getAttribute("data-disabled"),
  ).toBe("true");
  expect(screen.getByRole("button", { name: "Paikanna minut" })).toBeTruthy();
  const mapSourceLink = screen.getByRole("link", { name: "OpenStreetMap" });
  expect(mapSourceLink).toBeTruthy();
  expect(mapSourceLink.parentElement?.textContent).toBe(
    "Sijainti haetaan vain painikkeella. Karttatieto: OpenStreetMap.",
  );

  onMunicipalityChange("240");
  expect(onMunicipalityChange).toHaveBeenCalledWith("240");

  rerender(
    <TransferCostPanel
      data={transferData}
      selectedMunicipalityCode="240"
      selectedOperatorId=""
      selectedMunicipality={transferData.municipalities[0]}
      selectedTariff={null}
      onMunicipalityChange={onMunicipalityChange}
      onOperatorChange={vi.fn()}
      onLocate={vi.fn()}
      locationStatus="idle"
      locationMessage={null}
    />,
  );

  expect(
    (screen.getByRole("combobox", {
      name: "Sähköverkkoyhtiö",
    }) as HTMLButtonElement).disabled,
  ).toBe(false);
});
