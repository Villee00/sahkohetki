// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import Loading from "./loading";

afterEach(cleanup);

it("shows the forecast route as active while its data loads", () => {
  render(<Loading />);

  const navigation = screen.getByRole("navigation", { name: "Päänavigaatio" });
  expect(within(navigation).getAllByRole("link")).toHaveLength(3);
  expect(
    within(navigation)
      .getByRole("link", { name: "Sähköennuste" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(screen.getByRole("status").textContent).toContain(
    "Ladataan sähköennustetta",
  );
});
