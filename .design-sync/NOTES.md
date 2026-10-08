# design-sync notes (Orvilo ReUI)

Target project: `6a790fde-712c-4709-a4e0-ca874c74d180` ("Orvilo ReUI"). Shape: `package`, pkg `@orvilo/ui`, global `window.OrviloUI`.

## How it is built

- There is no standalone design-system package in this repo. `packages/ui` is a **build-only entry** that re-exports `src/components/{ui,reui}`; source stays where it is.
- Build: `pnpm --filter @orvilo/ui build` (tsdown for JS + `.d.ts`, then `scripts/build-css.mjs` for `dist/styles.css`). tsdown needs `NODE_OPTIONS=--max-old-space-size=12288` for the type graph; the script sets it.
- `pnpm install` must be plain (no `--frozen-lockfile`): the workspace sets `lockfile: false`.
- Converter: `node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules node_modules --entry ./packages/ui/dist/index.mjs --out ./ds-bundle` from the repo root. Re-copy the staged scripts into `.ds-sync/` first (see the skill).
- `dist/styles.css` = `src/app/globals.css` with the antd reset import stripped and the Tailwind `source()` root pinned to `src/components`. If `globals.css` changes those two lines the script throws on purpose.
- Add or remove a component file in `src/components/{ui,reui}` -> update `packages/ui/src/index.ts` by hand (explicit re-exports, no barrel scanning).

## Decisions

- `ui/code-block` and `reui/code-block/*` are NOT exported: they pull shiki grammars (6 MB of chunks) and i18n.
- 304 exports include compound sub-parts (`DialogContent` ...). They were regrouped into 7 categories (actions, forms, overlays, navigation, data, feedback, layout) via `docsMap` -> `.design-sync/groups/*.md` stubs. A new export with no `docsMap` entry falls into group `general`; add it to the right stub.
- Excluded via `componentSrcMap: null`: `DataGridTableRowSpacer` (empty 8px `<tbody>`) and `SidebarMenuSkeleton` (random width, nondeterministic previews).
- Muted/secondary/accent surfaces look near-white (`#fbfbfb`, 3% black). That is the approved `DESIGN.md` value, not a bug. `Skeleton`, `Progress` tracks, `Slider` tracks and `secondary` buttons are faint by design; do not "fix" them here.
- `globals.css` declares `--font-sans: var(--font-sans, ...)` (self-reference). It renders as a system sans in previews; the app overrides it elsewhere. Brand fonts are not shipped (`[FONT_MISSING]` did not fire).

## Previews

23 authored previews in `.design-sync/previews/` (core set). Everything else ships the floor card (honest placeholder), authorable on any re-sync. Overlays use `defaultOpen` plus `cardMode` overrides in `config.json`; `Dialog` has a 420px spacer because its portal is `fixed` and would otherwise measure 0px tall.

## Known render warns

- `[TOKENS_MISSING]` 12 vars (`--data-grid-scrollbar-*`, `--accordion-panel-height` ...): set at runtime by the components, non-blocking.
- `[RENDER_THIN]`/`[GRID_OVERFLOW]` on `Dialog`/`Select`: fixed/portal content, handled by `cardMode`.

## Re-sync risks

- `docsMap` in `config.json` is a 304-entry generated list. New compound parts need a manual entry (or regenerate with the family prefix rule in the group stubs).
- Only core components have authored previews; a change to a floor-card component is not visually verified.
- `Math.random()` inside a component (`SidebarMenuSkeleton`) makes previews nondeterministic; keep it excluded.
- Dark mode is not verified: previews render the light `:root` tokens only.
- ReUI is a licensed library; the upload contains its compiled code. Confirm the license still allows it before syncing to a new project.
