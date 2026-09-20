// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const estimateWithComparison: CostEstimate = {
  ...estimate,
  comparison: {
    title: "Säästät 0,04 senttiä",
    detail: "edullisimpana ajankohtana 12:00–13:00",
  },
};

it("shows the researched assumption and its source", async () => {
  const user = userEvent.setup();
  const use = getEverydayUse("coffee");
  if (!use) throw new Error("Expected the coffee use to be in the catalog.");

  render(<ApplianceCard use={use} estimate={estimate} />);

  const disclosure = screen.getByLabelText(
    "Kahvinkeitin: näytä oletus ja rajaus",
  );
  await user.click(disclosure);

  expect(screen.getByText(/Vertailuarvo sisältää noin litran kahvin valmistuksen ja lämpölevyn käytön/)).toBeTruthy();
  const sourceLink = screen.getByRole("link", {
    name: "TTS / Doria – Kahvinkeittimien testi 2020",
  });
  expect(sourceLink.getAttribute("href")).toBe("https://www.doria.fi/handle/10024/189370");
  expect(screen.getByText(/Tarkistettu 22\.8\.2026\./)).toBeTruthy();
});

it("keeps the appliance article, cost metrics, and expandable assumption", async () => {
  const user = userEvent.setup();
  const use = getEverydayUse("coffee");
  if (!use) throw new Error("Expected the coffee use to be in the catalog.");

  render(<ApplianceCard use={use} estimate={estimateWithComparison} />);

  const article = screen.getByRole("article");
  const disclosure = screen.getByRole("button", {
    name: "Kahvinkeitin: näytä oletus ja rajaus",
  });

  expect(article.textContent).toContain("Säästät");
  expect(article.textContent).toContain("0,04 senttiä");
  expect(article.textContent).toContain("0,15 kWh");
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  await user.click(disclosure);
  expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  expect(article.textContent).toContain("Tarkistettu");
});

it("keeps the disclosure trigger anchored while its panel opens beneath the row", async () => {
  const user = userEvent.setup();
  const use = getEverydayUse("coffee");
  if (!use) throw new Error("Expected the coffee use to be in the catalog.");

  render(<ApplianceCard use={use} estimate={estimateWithComparison} />);

  const article = screen.getByRole("article");
  const disclosure = screen.getByRole("button", {
    name: "Kahvinkeitin: näytä oletus ja rajaus",
  });

  expect(disclosure.tagName).toBe("BUTTON");
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  expect(article.querySelector(".appliance-card__assumption-panel")).toBeNull();

  await user.click(disclosure);

  const panel = article.querySelector(".appliance-card__assumption-panel");
  expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  expect(panel).toBeTruthy();
  expect(panel?.closest('[data-slot="card"]')).toBeTruthy();
  expect(screen.getByText(/Vertailuarvo sisältää noin litran kahvin valmistuksen ja lämpölevyn käytön/)).toBeTruthy();
});

it("renders the heat-pump card with its dedicated icon", () => {
  const use = getEverydayUse("heat-pump");
  if (!use) throw new Error("Expected the heat-pump use to be in the catalog.");

  render(<ApplianceCard use={use} estimate={estimate} />);

  expect(screen.getByRole("article").querySelector(".lucide-air-vent")).toBeTruthy();
});
