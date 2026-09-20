# Sähköhetki shadcn preset migration design

**Date:** 20 September 2026
**Status:** Approved direction

## Goal

Move the Sähköhetki page to shadcn/ui using preset `b1ffdaIyun` as the visual source of truth. Preserve the existing electricity-price data flow, calculations, Finnish copy, accessibility behavior, and custom price-chart interaction while replacing every feasible application UI surface with shadcn primitives.

## Product and visual decisions

- The incoming preset fully replaces the current dark-blue glass visual system.
- The preset values are authoritative: Lyra style, taupe base/theme, orange chart color, Geist body font, Roboto heading font, Lucide icons, no radius, subtle menu accent, and inverted menu color.
- The migration does not change the product’s data semantics or user-facing feature scope.
- The page remains Finnish-first, responsive, keyboard-accessible, and readable with assistive technology.
- The existing price chart remains a custom visualization where its scale, hover behavior, daylight-saving labels, carried-forward markers, and per-bar keyboard selection are not represented by a standard shadcn component.
- Custom chart styling may remain in `app/globals.css`, but it must use the preset’s semantic tokens and narrowly scoped custom chart variables rather than restoring the old dark-blue/glass token system.

## Current context

The project is a Next.js 16.3.2 App Router application using React 19, TypeScript, Tailwind CSS v4, Vitest, and Lucide React. The interactive surface is concentrated in `app/components/price-explorer.tsx`, with supporting components for the chart, appliance rows, transfer-cost settings, explanation dialogs, and icons. There is currently no `components.json` file and no installed shadcn component source.

The server boundary in `app/page.tsx`, `lib/price-source.ts`, `lib/price-domain.ts`, and the API route is outside the UI migration except for preserving its existing interfaces. `PriceExplorer` continues to receive serialized `ExplorerData` and owns only browser interaction state.

## Architecture

### Preset and component source

Initialize the existing project with shadcn CLI using preset `b1ffdaIyun`. The generated project configuration, utility helper, CSS variables, dependencies, and UI component source are the canonical shadcn layer. The implementation must use the actual base mode and resolved paths reported by the CLI rather than guessing component APIs or import locations.

The generated shadcn components live in the project’s resolved UI directory. The migration adds only the primitives needed by the page, keeps them as source code in the repository, and imports them through the configured alias. Components are composed rather than reimplemented in page files.

### Application component mapping

| Existing surface | shadcn composition | Notes |
| --- | --- | --- |
| Sticky header actions | `Button`, Lucide icon objects, existing `Image` brand mark | Preserve visible labels on larger screens and accessible labels on compact screens. |
| Hourly/15-minute and today/tomorrow controls | `ToggleGroup` and `ToggleGroupItem` | Controlled by existing `mode` and `horizon` state. Use the base-specific controlled-value API reported by the CLI. |
| Selected price hero | `Card`, `Badge`, `Separator` where useful | Preserve selected interval, current marker, price summary, spectrum marker, and non-color text. |
| Unavailable/status callouts | `Alert`, `AlertTitle`, `AlertDescription` | Keep explicit Finnish status/error text and existing ARIA roles. |
| Price chart frame and toolbar | `Card` composition, `ToggleGroup`, semantic tokens | The custom plot and bar hit targets remain specialized markup. |
| Appliance rows | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `Badge` | Preserve compact row layout, cost metrics, comparison text, and assumption disclosure. |
| Margin settings | `Dialog`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, `Input`, `Button` | Validation uses `data-invalid` on `Field` and `aria-invalid` on `Input`. |
| Municipality/network-company settings | `Field`, `FieldLabel`, `Select`, `SelectGroup`, `SelectItem`, `Button` | Preserve dependent selection, disabled operator state, geolocation action, stored selection, and source links. |
| Explanation overlays | Controlled `Dialog` composition | shadcn owns focus trapping, Escape handling, overlay stacking, and focus return; dialog titles and descriptions remain explicit. |
| Dividers and footer grouping | `Separator` and semantic layout | Replace decorative border dividers where a separator is the correct semantic element. |

The string-based `Icon` lookup is reduced or removed where direct Lucide component objects are practical. New shadcn component usage follows the preset icon library and uses `data-icon` for icons inside shadcn buttons; icons do not receive redundant sizing classes inside those components.

### Intentional custom exceptions

- The chart bars remain native buttons with custom geometry because the bar height, selected state, disabled state, pointer hover, accessible price labels, and data-level styling are the visualization’s core behavior.
- The spectrum track and marker remain custom visualization markup because they represent a continuous price position rather than an input control.
- Chart-specific CSS, tooltip positioning, grid lines, and responsive axis labels remain custom, but colors and focus treatment use semantic tokens or explicitly named chart variables registered in `app/globals.css`.
- The brand image remains `next/image` because it is a project asset rather than a UI primitive.

## Behavior and data flow

No server or domain behavior changes. The migration preserves:

- server-only price loading and the `ExplorerData` boundary;
- hourly and quarter-hour selection behavior, including unavailable intervals;
- Finnish timezone and daylight-saving rendering;
- localStorage persistence for margin and transfer selections;
- geolocation lookup and its success/error messages;
- modal content, source links, and formula copy;
- visible focus, keyboard chart selection, and screen-reader labels;
- metadata, JSON-LD, sitemap, robots, and API routes.

The controlled dialog state may be refactored to shadcn’s `open`/`onOpenChange` contract, but it must retain the existing opener state behavior and return focus to the triggering control. No browser-side price fetching or new product behavior is introduced.

## CSS and typography migration

`app/globals.css` is replaced with the preset’s Tailwind v4 semantic variables and base styles, then extended only with the layout and chart rules required by the page. The previous `--ink-*`, glass panel, blue-gradient, and global dark-theme overrides are removed. Status colors are expressed through preset semantic tokens, shadcn variants, or named chart variables rather than raw one-off Tailwind color classes.

The preset’s font configuration is applied through the generated project setup. The implementation must follow the actual CLI output for Next.js font loading and avoid introducing a second competing font stack.

## Verification and review

The implementation is complete only when all of the following pass:

- focused and full Vitest suites;
- ESLint;
- TypeScript typecheck;
- Next.js production build;
- browser verification at desktop and mobile widths, including dialog focus, form validation, selectors, chart keyboard selection, and responsive layout;
- a final review against this spec and the implementation plan.

The work is developed on a `codex/` feature branch, committed in reviewable task commits, pushed to the remote, and submitted as a pull request targeting `main`.

## Out of scope

This migration does not alter price-source policy, tariff data, appliance assumptions, product copy beyond component-compatible markup, routing, SEO content, API contracts, or the custom chart’s data semantics. It does not add accounts, themes/settings beyond the existing margin control, new registries, or unrelated refactors.
