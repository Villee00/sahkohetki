// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Coffee } from "lucide-react";
import { Icon } from "./ui-icon";

afterEach(() => cleanup());

it("passes a Lucide component object through while preserving SVG props", () => {
  render(
    <Icon
      icon={Coffee}
      data-testid="icon"
      className="icon-size"
      strokeWidth={1.5}
    />,
  );

  const icon = screen.getByTestId("icon");
  expect(icon.getAttribute("class")).toContain("lucide-coffee");
  expect(icon.getAttribute("class")).toContain("icon-size");
  expect(icon.getAttribute("stroke-width")).toBe("1.5");
  expect(icon.getAttribute("aria-hidden")).toBe("true");
  expect(icon.getAttribute("focusable")).toBe("false");
});
