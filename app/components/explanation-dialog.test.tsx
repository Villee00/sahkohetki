// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ExplanationDialog } from "./explanation-dialog";

afterEach(() => cleanup());

it("keeps the explanation dialog API controlled by onOpenChange", () => {
  const source = readFileSync(
    `${process.cwd()}/app/components/explanation-dialog.tsx`,
    "utf8",
  );

  expect(source).toMatch(/onOpenChange: \(open: boolean\) => void;/);
  expect(source).not.toMatch(/dialogRef\??:/);
  expect(source).not.toMatch(/closeButtonRef\??:/);
  expect(source).not.toMatch(/onClose\??:/);
});

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
