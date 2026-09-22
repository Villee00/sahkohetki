// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { MotionConfig } from "motion/react";
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

it("renders a compact appliance row with adjacent cost and saving metrics", () => {
  const use = getEverydayUse("coffee");
  if (!use) throw new Error("Expected the coffee use to be in the catalog.");

  render(<ApplianceCard use={use} estimate={estimateWithComparison} />);

  const row = screen.getByRole("article");
  const metrics = row.querySelector(".appliance-card__metrics");

  expect(row.className).toContain("appliance-card--row");
  expect(row.querySelector(".appliance-card__icon")).toBeTruthy();
  expect(metrics?.textContent).toContain("ARVIOITU KUSTANNUS SPOT-HINNALLA");
  expect(metrics?.textContent).toContain("Säästät");
  expect(metrics?.textContent).toContain("0,04 senttiä");
  expect(row.querySelector(".appliance-card__assumption-trigger")).toBeTruthy();
});

it("keeps the disclosure trigger anchored while its panel opens beneath the row", async () => {
  const user = userEvent.setup();
  const use = getEverydayUse("coffee");
  if (!use) throw new Error("Expected the coffee use to be in the catalog.");

  render(<ApplianceCard use={use} estimate={estimateWithComparison} />);

  const row = screen.getByRole("article");
  const chevron = screen.getByRole("button", {
    name: "Kahvinkeitin: näytä oletus ja rajaus",
  });

  expect(chevron.tagName).toBe("BUTTON");
  expect(chevron.getAttribute("aria-expanded")).toBe("false");
  expect(chevron.getAttribute("aria-controls")).toBe(
    "appliance-coffee-assumption",
  );
  expect(row.querySelector(".appliance-card__assumption-panel")).toBeNull();

  await user.click(chevron);

  const panel = row.querySelector(".appliance-card__assumption-panel");
  expect(chevron.getAttribute("aria-expanded")).toBe("true");
  expect(panel).toBeTruthy();
  expect(panel?.parentElement).toBe(row);
  expect(panel?.id).toBe("appliance-coffee-assumption");
  expect(screen.getByText(/Vertailuarvo sisältää noin litran kahvin valmistuksen ja lämpölevyn käytön/)).toBeTruthy();
});

it("keeps the assumption panel mounted while it closes before removing it", async () => {
  const user = userEvent.setup();
  const use = getEverydayUse("coffee");
  if (!use) throw new Error("Expected the coffee use to be in the catalog.");

  render(
    <MotionConfig reducedMotion="never">
      <ApplianceCard use={use} estimate={estimate} />
    </MotionConfig>,
  );

  const row = screen.getByRole("article");
  const disclosure = screen.getByRole("button", {
    name: "Kahvinkeitin: näytä oletus ja rajaus",
  });

  await user.click(disclosure);
  const panel = row.querySelector(".appliance-card__assumption-panel");
  expect(panel).toBeTruthy();

  await user.click(disclosure);

  expect(row.querySelector(".appliance-card__assumption-panel")).toBe(panel);
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  await waitFor(() => {
    expect(row.querySelector(".appliance-card__assumption-panel")).toBeNull();
  });
});

it("opens and closes the assumption panel without motion when reduced motion is requested", async () => {
  const user = userEvent.setup();
  const use = getEverydayUse("coffee");
  if (!use) throw new Error("Expected the coffee use to be in the catalog.");

  render(
    <MotionConfig reducedMotion="always">
      <ApplianceCard use={use} estimate={estimate} />
    </MotionConfig>,
  );

  const disclosure = screen.getByRole("button", {
    name: "Kahvinkeitin: näytä oletus ja rajaus",
  });
  await user.click(disclosure);

  const row = screen.getByRole("article");
  const panel = row.querySelector<HTMLElement>(
    ".appliance-card__assumption-panel",
  );
  expect(panel).not.toBeNull();
  expect(panel?.style.height).toBe("auto");

  await user.click(disclosure);
  await waitFor(() => {
    expect(row.querySelector(".appliance-card__assumption-panel")).toBeNull();
  });
});

it("renders the heat-pump card with its dedicated icon", () => {
  const use = getEverydayUse("heat-pump");
  if (!use) throw new Error("Expected the heat-pump use to be in the catalog.");

  render(<ApplianceCard use={use} estimate={estimate} />);

  expect(screen.getByRole("article").querySelector(".lucide-air-vent")).toBeTruthy();
});
