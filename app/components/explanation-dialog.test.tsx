// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ExplanationDialog } from "./explanation-dialog";

afterEach(() => cleanup());

it("renders a labelled controlled dialog and closes through onOpenChange", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  render(
    <ExplanationDialog
      id="formula-dialog"
      title="Miten kustannusarvio lasketaan?"
      open={true}
      onOpenChange={onOpenChange}
    >
      <p>Selite</p>
    </ExplanationDialog>,
  );

  expect(
    screen.getByRole("dialog", { name: "Miten kustannusarvio lasketaan?" }),
  ).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
