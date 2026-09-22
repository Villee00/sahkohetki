// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteHeader } from "./site-header";

afterEach(cleanup);

describe("SiteHeader", () => {
  it("links both primary routes and marks the active price page", () => {
    render(<SiteHeader activeRoute="price" />);

    const priceLink = screen.getByRole("link", { name: "Hinta" });
    const forecastLink = screen.getByRole("link", { name: "Sähköennuste" });
    expect(priceLink.getAttribute("href")).toBe("/");
    expect(forecastLink.getAttribute("href")).toBe("/ennuste");
    expect(priceLink.getAttribute("aria-current")).toBe("page");
    expect(forecastLink.getAttribute("aria-current")).toBeNull();
  });

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
