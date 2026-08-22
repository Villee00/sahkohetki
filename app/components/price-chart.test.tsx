// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { PriceChart } from "./price-chart";

const point = {
  id: "quarter-1015",
  startAt: "2026-08-22T10:15:00.000Z",
  endAt: "2026-08-22T10:30:00.000Z",
  label: "10:15–10:30",
  priceCentsPerKwh: 4.5,
  available: true,
  level: "cheap" as const,
};

it("lets a keyboard-accessible chart button select an available interval", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<PriceChart points={[point]} selectedId={point.id} onSelect={onSelect} />);
  const button = screen.getByRole("button", { name: /10:15/ });
  expect(button.getAttribute("aria-pressed")).toBe("true");
  await user.click(button);
  expect(onSelect).toHaveBeenCalledWith(point.id);
});
