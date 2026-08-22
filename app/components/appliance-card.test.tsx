// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ApplianceCard } from "./appliance-card";
import { getEverydayUse } from "../../lib/appliances";
import type { CostEstimate } from "../../lib/price-types";

afterEach(() => cleanup());

const estimate: CostEstimate = {
  cents: 1.2,
  euros: 0.012,
  centsLabel: "1.20",
  eurosLabel: "0.01",
};

it("marks the appliance assumption as provisional and awaiting external verification", () => {
  const use = getEverydayUse("coffee");
  if (!use) throw new Error("Expected the coffee use to be in the catalog.");

  render(<ApplianceCard use={use} estimate={estimate} />);

  expect(
    screen.getByText(
      "Väliaikainen oletus, joka perustuu toimitettuun mockupiin. Ulkoinen varmistus on vielä kesken. Päivätty 22.8.2026.",
    ),
  ).toBeTruthy();
});
