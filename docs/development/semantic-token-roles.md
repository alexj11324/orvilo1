# Semantic token roles for local primitives

Local primitives in `src/components/ui` and `src/components/reui` read Tailwind roles such as `bg-muted` and `bg-secondary`. `src/styles/themeRoles.ts` resolves those roles from the theme engine at runtime; `src/app/globals.css` holds the fallbacks used before `ThemeRoles` mounts. The two files must change together. [DESIGN.md](../../DESIGN.md#local-primitive-fill-roles) owns the approved mapping; this page records why it changed and what was audited.

## Mapping

| Role                                 | Before (light / dark)                                                               | After (light / dark)                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `--muted`                            | `colorBgContainerSecondary` `#fbfbfb` / `#070707`                                   | `colorFillTertiary` `rgba(0,0,0,.03)` / `rgba(255,255,255,.06)`                              |
| `--secondary`                        | `colorBgContainerSecondary` `#fbfbfb` / `#070707`                                   | `colorFillTertiary` `rgba(0,0,0,.03)` / `rgba(255,255,255,.06)`                              |
| `--accent`                           | `colorFillTertiary`                                                                 | unchanged                                                                                    |
| `--selected`                         | `colorFillSecondary`, not registered as a Tailwind color; fallback `var(--muted)`   | `colorFillSecondary` `rgba(0,0,0,.06)` / `rgba(255,255,255,.1)`, registered as `bg-selected` |
| `--ring`, `--sidebar-ring`           | runtime `readableColor(surface)` (`#000` / `#fff`); fallback `colorTextSecondary`   | `colorText` in both files                                                                    |
| `--invert` / `--invert-foreground`   | runtime `colorText` / container; fallback `zinc-900` / `zinc-50` with no dark value | `colorText` / container in both files and both themes                                        |
| `--primary-hover` fallback           | `var(--primary)` (no hover)                                                         | `--primary` mixed 10% toward `--card`; runtime `colorPrimaryHover` unchanged                 |
| `--foreground` dark fallback         | `#f7f7f7`                                                                           | `#ffffff`, the `colorText` default in DESIGN.dark.md                                         |
| `--sidebar-muted`, `--sidebar-group` | defined, not registered                                                             | registered as `text-sidebar-muted` / `text-sidebar-group`; values unchanged                  |
| `--focus`                            | referenced by three Badge variants, never defined                                   | variants removed                                                                             |

The old `--muted` was a surface that sat about 1.03:1 from the panel in both themes and was darker than the panel in dark. Skeletons, segmented tab tracks, progress and slider tracks, `kbd`, avatar fallbacks, secondary buttons and secondary badges were close to invisible, and `hover:bg-muted` dug a dark hole in dark. Estimated from the default palette, the new wash is about 1.07:1 on the light panel and 1.13:1 on the dark panel; `--selected` is about 1.14:1 and 1.27:1. These are static estimates, not runtime measurements.

`--muted`, `--secondary` and `--accent` share one value on purpose. It matches the shadcn convention the installed primitives were written for, and the engine's own filled-control convention (`colorFillTertiary` at rest). `hover:bg-muted` and `hover:bg-accent` now render the same. `colorFillSecondary` was not used for `--muted` or `--secondary` because it is the selected role.

## Why the fills are translucent

A wash adapts to whatever is under it. An opaque value premixed over the panel would disappear on popovers in dark (the result equals the popover color) and on the page canvas in light. The cost is that a wash cannot hide content behind it.

Consumers of `bg-muted` and `bg-secondary` on `canary` before this change, by kind (168 Tailwind uses, plus 15 `var(--muted)` / `var(--secondary)` uses in feature and package styles):

| Kind                                                               | `muted`                            | `secondary` |
| ------------------------------------------------------------------ | ---------------------------------- | ----------- |
| Static surface or chip                                             | 75                                 | 17          |
| Tinted static (`/NN`: footers, stripes, chips)                     | 24                                 | 0           |
| Track (skeleton, progress, slider, tab list, stepper, upload ring) | 6                                  | 0           |
| Interactive (hover, expanded, open)                                | 34                                 | 3           |
| Selected or pressed state                                          | 8                                  | 0           |
| Opaque or sticky                                                   | 1 class, plus 1 `color-mix` premix | 0           |

Only the data grid needs an opaque result: pinned header cells, and pinned body cells on row hover and selection. Those keep `bg-background` and layer the wash as a background image through the `wash-*` utility in `globals.css` (`bg-background wash-muted`, `wash-muted/40`, `wash-selected`). A `color-mix()` with a translucent role is not opaque, so the former premix was replaced. The utility has no `bg-` prefix so that `tailwind-merge` keeps it next to the base color. The data grid's sticky header already carries its own `bg-background/90` and blur.

## Primitive changes

- Selected, pressed and active states use `bg-selected`: Toggle, Table row, data grid rows, code block selected line, Sidebar menu buttons, Calendar range band, and `ActionIcon` `active`.
- The code block's keyboard position uses `bg-accent`; the data grid column header hover and open states use `bg-accent`.
- The segmented tab's active pill uses `bg-card`; the page canvas is as grey as the track.
- `Button variant="secondary"` shows its hover fill while expanded.
- Status text and icons use the `*-text` roles in Alert, Field, code block diff markers, `Menu` danger items and `ActionIcon` danger hover.
- `ModelSelect` mapped its video tag to the undefined `focus` Badge variant; it now uses `secondary`.

## Follow-ups, not done here

- Re-pin the `--radius` scale so `rounded-md/lg/xl` resolve to 6/8/12px.
- Split the two jobs of `--input` (strong border and fill).
- Align `ui/dialog`, `ui/alert-dialog` and `ui/sheet` z-index with `Modal`.
- Collapse duplicate primitives (the two code blocks, dialog stacks, loaders).
- Raise dark `--border` contrast on popovers.
- Replace the `bg-black/10` overlay scrim with a themed role.
- Migrate feature call sites to `bg-selected` (for example `aria-current` rows that paint `var(--muted)`), and to `*-text` status roles.
- Give `ModelSelect`'s video tag a product-approved color if neutral is not intended.
- `/50` tints of the wash (dialog and card footers, `dark:hover:bg-muted/50` on the ghost Button) are faint; the hover case is handled by the accent-wash change in #537.
