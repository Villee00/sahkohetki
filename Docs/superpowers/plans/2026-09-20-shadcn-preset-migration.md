# Sähköhetki shadcn preset migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Sähköhetki page to shadcn/ui with preset `b1ffdaIyun`, replacing feasible custom UI while preserving the existing price explorer behavior and accessible custom chart.

**Architecture:** Initialize the existing Next.js App Router project with the shadcn CLI using the exact preset and the current v4 Base UI component base. Add only the shadcn primitives used by the page, then refactor the existing client components to compose those primitives. Keep data fetching, domain calculations, and the chart’s bespoke geometry unchanged; replace its frame, controls, dialogs, fields, cards, alerts, badges, and separators with source-owned shadcn components.

**Tech Stack:** Next.js 16.3.2 App Router, React 19.2.8, TypeScript 5, Tailwind CSS v4, shadcn CLI 4.x, Base UI primitives, Lucide React, Vitest, Testing Library, npm.

**Spec:** Docs/superpowers/specs/2026-09-20-shadcn-preset-migration-design.md

## Global Constraints

- The incoming preset fully replaces the current dark-blue glass visual system.
- The exact shadcn preset is `b1ffdaIyun`, resolving to Lyra, taupe base/theme, orange chart color, Geist body font, Roboto heading font, Lucide icons, radius `none`, subtle menu accent, and inverted menu color.
- Initialize the project with the current shadcn Base UI base (`--base base`) because the preset code does not encode a base; verify the resolved `base` field with `npx shadcn@latest info --json` before using component APIs.
- Custom chart CSS is allowed only for visualization geometry and must use preset semantic tokens or named chart variables; do not restore the old `--ink-*` or glass-panel theme.
- The server/domain data flow, `ExplorerData` boundary, price calculations, API routes, metadata, and Finnish product behavior must not change.
- Client components retain `'use client'` only at the existing interactive boundary and any newly generated interactive shadcn source; do not move server-only data access into the client bundle.
- Use semantic shadcn tokens and built-in variants before custom colors; use `cn()` for conditional classes; use `gap-*` instead of `space-x-*`/`space-y-*`; use `size-*` for equal icon dimensions; do not add manual overlay z-index values.
- Forms use `FieldGroup`/`Field`, invalid controls use `data-invalid` plus `aria-invalid`, and option sets use `ToggleGroup` rather than manually toggled buttons.
- Dialogs, cards, alerts, badges, separators, and grouped Select items must use their complete shadcn compositions and accessibility-required titles/descriptions.
- The custom price chart’s native per-bar buttons and spectrum marker are intentional exceptions; all other feasible action controls use shadcn `Button` or the appropriate primitive.
- Run the Next.js 16.3.2 documentation checks for Server/Client Components, `'use client'`, CSS, and fonts before changing the client boundary or font setup.
- Work on `codex/shadcn-preset-migration`, commit each completed task, push the branch, and open a pull request targeting `main` only after verification and review are clean.

## Review Focus

- Base-specific controlled `ToggleGroup` and `Select` values must preserve mode, horizon, municipality, and operator state; add interaction tests in Task 4.
- Dialog open/close, Escape, focus trap, and focus return must remain accessible without the old hand-rolled focus logic; add dialog interaction tests in Task 2 and Task 4.
- Invalid margin input, disabled operator selection, location pending/error states, and source links must retain their labels and ARIA state; cover them in Tasks 2 and 4.
- Dense quarter-hour charts, unavailable bars, carried-forward markers, hover tooltips, and keyboard selection must remain unchanged; preserve and extend the existing chart tests in Task 4.
- Preset tokens, generated aliases, font loading, client boundaries, and production build output must agree; verify `components.json`, `shadcn info`, typecheck, lint, and build in Tasks 1 and 4.

---

### Task 1: Initialize the shadcn foundation and preset theme

**Files:**
- Create: `components.json`
- Create: `lib/utils.ts`
- Create: `components/ui/button.tsx`
- Create: `components/ui/badge.tsx`
- Create: `components/ui/card.tsx`
- Create: `components/ui/alert.tsx`
- Create: `components/ui/separator.tsx`
- Create: `components/ui/dialog.tsx`
- Create: `components/ui/field.tsx`
- Create: `components/ui/input.tsx`
- Create: `components/ui/select.tsx`
- Create: `components/ui/toggle-group.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Test: existing Vitest suite and shadcn CLI project context

**Interfaces:**
- Produces the project aliases `@/components/ui/*` and `@/lib/utils`.
- Produces a `cn(...inputs)` helper based on `clsx` and `tailwind-merge`.
- Produces semantic Tailwind v4 variables and font variables for the preset values; downstream components import these generated primitives and do not recreate them.

- [ ] **Step 1: Re-read the Next.js constraints and capture the baseline**

Read these installed guides before changing `app/layout.tsx` or client boundaries:

```sh
sed -n '1,260p' node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
sed -n '1,220p' node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md
sed -n '1,240p' node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md
sed -n '1,240p' node_modules/next/dist/docs/01-app/01-getting-started/11-css.md
npm test
```

Expected: the baseline remains 12 test files and 96 passing tests before UI edits.

- [ ] **Step 2: Inspect the current and incoming shadcn context**

```sh
npx shadcn@latest info --json
npx shadcn@latest preset resolve --json
npx shadcn@latest preset decode b1ffdaIyun --json
npx shadcn@latest docs button badge card alert separator dialog field input select toggle-group
```

Expected: the project reports Next.js, Tailwind v4, RSC support, and no current preset; the incoming preset reports code `b1ffdaIyun`, style `lyra`, theme/base `taupe`, `font=geist`, `fontHeading=roboto`, `iconLibrary=lucide`, `radius=none`; docs output provides the URLs for every component added below.

- [ ] **Step 3: Apply the approved preset to the existing project**

Run the CLI from the repository root:

```sh
npx shadcn@latest init --preset b1ffdaIyun --base base --no-monorepo --force
npx shadcn@latest info --json
```

Expected: `components.json`, the configured alias paths, preset CSS variables, and required dependencies are created/updated. The reported preset code is `b1ffdaIyun`, `tailwindVersion` is `v4`, `rsc` is `true`, and `base` is `base`.

- [ ] **Step 4: Add only the primitives needed by the page**

Use the component docs just fetched, then add the source components:

```sh
npx shadcn@latest add button badge card alert separator dialog field input select toggle-group
```

Read every generated file before proceeding. Confirm that imports use the project’s actual alias, Base UI APIs match the generated source, grouped items are composed correctly, Dialog has accessible title/description parts, and Button icons will use the configured Lucide library. Do not overwrite generated source with hand-copied registry code.

- [ ] **Step 5: Finish the preset CSS and font boundary**

Keep the CLI-generated `app/globals.css` as the base. Remove the previous `--ink-*`, glass-panel, blue-gradient, and global dark-theme overrides. Add only page layout and chart variables/rules that are still needed, using semantic tokens for surfaces, text, focus, borders, and status. Follow the generated font convention in `app/layout.tsx`; if the preset does not add it automatically, use the Next.js `next/font` API to apply Geist to body text and Roboto to headings without introducing a second competing stack.

Use `cn` and the generated semantic tokens in later tasks; do not add `space-y-*`, raw status color utilities, or manual overlay z-index values in the foundation.

- [ ] **Step 6: Verify the foundation and commit it**

```sh
npx shadcn@latest info --json
npm run typecheck
npm run lint
npm test
git diff --check
git add components.json lib/utils.ts components/ui package.json package-lock.json app/globals.css app/layout.tsx
git commit -m "feat: initialize shadcn preset foundation"
```

Expected: generated config reports the exact preset and aliases, checks pass, and the commit contains only the preset foundation/theme/component-source changes.

### Task 2: Replace dialogs, fields, and transfer selectors

**Files:**
- Modify: `app/components/explanation-dialog.tsx`
- Modify: `app/components/transfer-cost-panel.tsx`
- Create: `app/components/explanation-dialog.test.tsx`
- Create: `app/components/transfer-cost-panel.test.tsx`

**Interfaces:**
- `ExplanationDialog` keeps `id`, `title`, `open`, `children`, and close-label semantics but exposes a controlled `onOpenChange(open: boolean)` callback instead of requiring callers to manage a dialog ref and custom focus trap.
- `TransferCostPanel` keeps its current data/callback props and output copy; it renders Base UI Select controls with controlled string values, grouped items, labels, disabled state, and a Button location action.

- [ ] **Step 1: Read the generated APIs and write focused failing interaction tests**

Read the generated component files and their docs before using them:

```sh
npx shadcn@latest docs dialog field input select button alert separator
sed -n '1,320p' components/ui/dialog.tsx
sed -n '1,320p' components/ui/field.tsx
sed -n '1,260p' components/ui/select.tsx
```

Add a focused dialog test that initially fails against the current custom component:

```tsx
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
```

Add a transfer panel test with a local `TransferData` literal containing municipality `240` (`Kemi`) and two operators: `Kemin Energia ja Vesi Oy` with an available tariff and `Tenergia Oy` with `priceAvailable: false`. Render `TransferCostPanel` with an empty municipality and operator selection, assert both labelled `combobox` controls and the disabled operator state, call `onMunicipalityChange("240")`, rerender with the Kemi municipality, and assert the operator control is enabled. Assert the location button has name `Paikanna minut` and the OpenStreetMap link remains present. Tests must assert accessible roles/names and state, not implementation-specific CSS.

- [ ] **Step 2: Replace the hand-rolled ExplanationDialog**

Compose `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, and `DialogClose` according to the generated Base UI API. Preserve the existing `id`, title, description text, close label, children, and controlled visibility. Remove the hand-written backdrop click handler, `z-50`, focus trapping, and Escape listener; let the shadcn Dialog own those behaviors. Keep the title and description in the accessibility tree even if any visual copy is hidden.

- [ ] **Step 3: Replace transfer controls with Field/Select/Button/Alert compositions**

Use `FieldGroup`/`Field`/`FieldLabel` for municipality and operator controls. Use `Select` with its Base UI `items` shape and place every `SelectItem` inside `SelectGroup`. Use a shadcn `Button` for location; when `locationStatus === "locating"`, keep it disabled and show the existing accessible label. Use `Alert`/`AlertDescription` for location and tariff error/status messages, and `Separator` for the section divisions that are semantic separators. Preserve OpenStreetMap, tariff, and tax source links.

- [ ] **Step 4: Run focused tests, then typecheck and commit**

```sh
npm test -- app/components/explanation-dialog.test.tsx app/components/transfer-cost-panel.test.tsx
npm run typecheck
git diff --check
git add app/components/explanation-dialog.tsx app/components/explanation-dialog.test.tsx app/components/transfer-cost-panel.tsx app/components/transfer-cost-panel.test.tsx
git commit -m "feat: migrate settings and source dialogs to shadcn"
```

Expected: focused tests pass, dialog focus/close semantics are covered, and no server/domain files change.

### Task 3: Convert appliance cards and icon composition

**Files:**
- Modify: `app/components/appliance-card.tsx`
- Modify: `app/components/appliance-card.test.tsx`
- Modify: `app/components/ui-icon.tsx`
- Modify: `app/components/ui-icon.test.tsx`

**Interfaces:**
- `ApplianceCard` keeps the existing `use`, `estimate`, `costLabel`, and `emptyMessage` props and its `article` landmark/accessible disclosure behavior.
- `Icon` accepts a Lucide component object rather than a string key; all call sites use the preset’s `lucide` library.

- [ ] **Step 1: Write the card/icon contract tests**

Update the existing tests so they assert the stable behavior that must survive the migration:

```tsx
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
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  await user.click(disclosure);
  expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  expect(article.textContent).toContain("Tarkistettu");
});

it("passes Lucide component objects through the icon boundary", () => {
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
```

- [ ] **Step 2: Compose each appliance row from Card parts**

Use `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardFooter` for the row’s identity, metrics, and disclosure. Use `Badge` for the consumption value and a Button/icon-only control for the assumption disclosure, preserving `aria-expanded`, `aria-controls`, and the panel placement beneath the row. Use semantic text tokens and `cn()` for conditional classes. Do not rebuild Card-like borders or status pills with raw styled spans.

- [ ] **Step 3: Replace string icon names with Lucide objects and verify**

Change `applianceIcons` to map each use id to a Lucide component object. Update general actions to use direct Lucide imports or the object-based `Icon` wrapper. For icons inside shadcn Buttons, use `data-icon="inline-start"`/`data-icon="inline-end"` and no redundant icon sizing class. Preserve the heat-pump `AirVent` behavior and all existing icon test coverage.

- [ ] **Step 4: Run focused tests and commit**

```sh
npm test -- app/components/appliance-card.test.tsx app/components/ui-icon.test.tsx
npm run typecheck
git diff --check
git add app/components/appliance-card.tsx app/components/appliance-card.test.tsx app/components/ui-icon.tsx app/components/ui-icon.test.tsx
git commit -m "feat: compose appliance rows with shadcn cards"
```

Expected: the appliance row remains compact and accessible, the icon library stays Lucide, and the focused tests pass.

### Task 4: Migrate the explorer shell, chart frame, and page tests

**Files:**
- Modify: `app/components/price-explorer.tsx`
- Modify: `app/components/price-chart.tsx`
- Modify: `app/components/price-explorer.test.tsx`
- Modify: `app/components/price-chart.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- `PriceExplorer` retains `data: ExplorerData`, its existing state transitions, and every existing user-facing action/copy.
- `PriceChart` retains its existing props and custom bar-selection behavior; only its outer surfaces, toolbar integration, semantic tokens, and class composition change.

- [ ] **Step 1: Add failing tests for the explorer’s shadcn interactions**

Extend the existing tests with accessible behavior assertions:

```tsx
it("changes precision and horizon through controlled ToggleGroups", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={data} />);
  await user.click(screen.getByRole("button", { name: "15 minuutin tarkkuus" }));
  await user.click(screen.getByRole("button", { name: "Huomenna" }));
  expect(screen.getByRole("button", { name: "15 minuutin tarkkuus" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Huomenna" }).getAttribute("aria-pressed")).toBe("true");
});

it("opens settings, validates the margin Field, and returns focus on close", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={dataWithUses} />);
  const opener = screen.getByRole("button", { name: "Lisää marginaali" });
  await user.click(opener);
  const dialog = screen.getByRole("dialog", { name: "Lisää marginaali" });
  const input = within(dialog).getByLabelText("Sähköyhtiön marginaali");
  await user.clear(input);
  await user.type(input, "-1");
  await user.click(within(dialog).getByRole("button", { name: "Käytä marginaalia" }));
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(within(dialog).getByRole("alert").textContent).toContain("Anna vähintään");
  await user.click(within(dialog).getByRole("button", { name: "Sulje lisää marginaali" }));
  expect(document.activeElement).toBe(opener);
});

it("keeps keyboard bar selection and unavailable state intact", async () => {
  const user = userEvent.setup();
  render(<PriceExplorer data={data} />);
  const bar = screen.getByRole("button", {
    name: /Valitse aikaväli 13:00–14:00/,
  });
  bar.focus();
  await user.keyboard("{Enter}");
  expect(document.activeElement).toBe(bar);
  expect(screen.getByRole("banner").textContent).toContain("13:00–14:00");
});
```

Update selectors in existing tests from old visual class names to stable semantic roles, labels, `aria-pressed`, `aria-expanded`, `data-level`, and chart test IDs. Keep the existing DST, negative-price, unavailable, carried-forward, and tooltip coverage.

- [ ] **Step 2: Replace page controls with shadcn components**

Use `Button` for header actions, location/margin actions, source links where a button-like treatment is intended, and the appliance transfer opener. Use object-based Lucide icons with `data-icon` attributes. Use controlled Base UI `ToggleGroup` values as arrays (`value={[mode]}` / `value={[horizon]}`) and unwrap `onValueChange` safely so the current state cannot become empty. Preserve the existing visible labels and mobile screen-reader labels.

- [ ] **Step 3: Compose hero, status, footer, and chart frame**

Use `Card` parts for the selected-price hero and chart frame, `Badge` for price levels/margin/current markers, `Alert` for unavailable messaging, and `Separator` for the footer/source grouping. Keep the spectrum marker and chart plot custom. Replace manual conditional class template strings with `cn()`, use semantic tokens instead of the old slate/sky/emerald/amber/rose utility palette, and replace all `space-x-*`/`space-y-*` usage with flex/grid plus `gap-*`.

Use the custom chart buttons only for the visualization exception documented in the spec. Preserve their native button semantics, `aria-pressed`, disabled unavailable points, keyboard focus, hover tooltip, current-time marker, average line, and carried-forward marker.

- [ ] **Step 4: Preserve client/server boundaries and remove obsolete focus code**

Keep `'use client'` at the top of `price-explorer.tsx`, do not add browser APIs to server files, and remove the old `dialogRef`, `closeButtonRef`, `dialogWasOpenRef`, and document-level Tab/Escape listener once shadcn Dialog is wired. Keep opener focus behavior through Dialog’s controlled trigger or an explicit `onOpenChange` callback that focuses the stored trigger only after closing.

- [ ] **Step 5: Finish chart/page CSS and run the complete test cycle**

Limit `app/globals.css` to preset base styles, layout rules, and custom chart geometry. Confirm no old theme variables or glass-panel selectors remain:

```sh
rg -n -- "--ink-|glass-panel|bg-slate|text-slate|border-slate|bg-sky|text-sky|space-[xy]-" app components lib || true
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: the search finds no obsolete page theme usage outside intentional chart-variable definitions; all tests, lint, typecheck, and production build pass.

- [ ] **Step 6: Commit the explorer migration**

```sh
git add app/components/price-explorer.tsx app/components/price-chart.tsx app/components/price-explorer.test.tsx app/components/price-chart.test.tsx app/globals.css
git commit -m "feat: migrate explorer UI to shadcn components"
```

Expected: the commit contains the page-level UI migration and chart-token cleanup without touching data-source/domain files.

### Task 5: Browser/accessibility verification and handoff artifacts

**Files:**
- Test: full repository test/lint/typecheck/build commands and a desktop/mobile browser pass.

**Interfaces:**
- No new runtime interface. This task is the release gate for the completed UI migration.

- [ ] **Step 1: Start the production-equivalent app and inspect the main flow**

```sh
npm run build
npm run start
```

Open the local app and verify at desktop and mobile widths: preset typography and taupe theme, sticky header, current/selected price hero, chart hover/focus, mode/horizon controls, appliance cards, margin dialog, transfer selectors, geolocation button state, source links, and footer. Check that no console errors or hydration warnings appear.

- [ ] **Step 2: Exercise keyboard and assistive-technology states**

Tab through header controls, open/close every dialog with keyboard, confirm focus is trapped and restored, submit invalid margin input, move through both Select controls, focus chart bars, press Enter/Space, and inspect unavailable/carry-forward labels. Confirm headings, labels, dialog title/description, article landmarks, alerts, and link names remain discoverable.

- [ ] **Step 3: Run final verification and commit any targeted fixes**

```sh
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
```

Expected: all commands pass and the worktree contains only intended migration/plan/spec changes; any targeted fix made during this task has a focused regression test and its own commit.

- [ ] **Step 4: Prepare the branch for review**

```sh
git log --oneline --decorate main..HEAD
git diff --stat main...HEAD
git status --short
git push -u origin codex/shadcn-preset-migration
```

Open a pull request with base `main`, summarize the preset/component migration, list the preserved custom chart exception, and include the verification commands and browser checks.
