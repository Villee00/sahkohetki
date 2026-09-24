// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteHeader } from "./site-header";
import { SiteLoadingShell } from "./site-loading-shell";

afterEach(cleanup);

describe("SiteHeader", () => {
  it.each(["price", "history", "forecast"] as const)(
    "links all three routes and marks the active %s page",
    (activeRoute) => {
      render(<SiteHeader activeRoute={activeRoute} />);

      const links = [
        ["Nyt", "/", "price"],
        ["Historia", "/historia", "history"],
        ["Sähköennuste", "/ennuste", "forecast"],
      ] as const;
      const nav = screen.getByRole("navigation", { name: "Päänavigaatio" });
      expect(within(nav).getAllByRole("link")).toHaveLength(3);
      for (const [name, href, route] of links) {
        const link = within(nav).getByRole("link", { name });
        expect(link.getAttribute("href")).toBe(href);
        expect(link.getAttribute("aria-current")).toBe(
          activeRoute === route ? "page" : null,
        );
      }
    },
  );

  it("offers a keyboard route past the shared navigation to page content", () => {
    render(<SiteHeader activeRoute="forecast" />);

    expect(screen.getByRole("link", { name: "Siirry sisältöön" }).getAttribute("href")).toBe(
      "#main-content",
    );
  });

  it("marks the forecast route and keeps complete labels available on mobile", () => {
    render(<SiteHeader activeRoute="forecast" />);

    const forecastLink = screen.getByRole("link", { name: "Sähköennuste" });
    expect(forecastLink.getAttribute("aria-current")).toBe("page");
    expect(forecastLink.textContent).toContain("Sähköennuste");
    expect(
      screen.getByRole("link", { name: "Sähköhetki – etusivu" }),
    ).toBeTruthy();
  });

  it("renders page context and utility actions in named regions", () => {
    render(
      <SiteHeader
        activeRoute="price"
        context={<span>Valittu hinta 8,20 snt/kWh</span>}
        utilityActions={<button type="button">Tietolähde</button>}
      />,
    );

    expect(screen.getByText("Valittu hinta 8,20 snt/kWh")).toBeTruthy();
    const utilityNavigation = screen.getByRole("navigation", {
      name: "Sivun työkalut",
    });
    expect(
      utilityNavigation.querySelector("button")?.textContent,
    ).toBe("Tietolähde");
  });
});

it.each(["now", "history"] as const)(
  "keeps the %s loading screen's skip-link target focusable",
  (destination) => {
    render(<SiteLoadingShell destination={destination} />);
    expect(document.getElementById("main-content")?.getAttribute("tabindex")).toBe("-1");
  },
);
