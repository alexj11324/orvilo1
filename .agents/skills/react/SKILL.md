---
name: react
description: 'Use for TSX components, UI libraries, styling, state locality, layout, render performance and memoization.'
user-invocable: false
---

# React Component Writing Guide

## Ownership

This skill owns component selection, imports, styling, and React implementation rules. [DESIGN.md](../../../DESIGN.md) owns the approved visual roles and values; [ux](../ux/SKILL.md) owns interaction behavior. Before visual/token work, read [design-system](../design-system/SKILL.md) and the applicable references for primitive → semantic → component architecture.

## Styling

Apply the semantic role in DESIGN.md before choosing a CSS expression. `cssVar.*` / antd-style and Tailwind utilities must consume the same approved semantic contract; they are implementation paths, not separate palettes or scales. Component styling references semantic or component tokens rather than inventing raw visual values. Document scoped measured exceptions in DESIGN.md and the affected evidence inventory.

Use the application's existing theme mechanism and `[data-theme]` mappings. Do not copy an upstream `.dark`-only override or add a parallel theme toggle. Adapt design-system generation and Tailwind examples to the project's installed toolchain; do not initialize a second theme/configuration or replace existing fonts from an example.

| Scenario                                                   | Approach                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| New component, new file, or a file already on Tailwind     | Local primitives + the Tailwind role classes in [Role lookup](#role-lookup) |
| Editing a file that already uses `createStaticStyles`      | Stay in it with `cssVar.*`; do not style one element through both systems   |
| Value computed at render time (measured width, user color) | Inline `style`, for that value only                                         |
| Truly dynamic (JS color fns like `readableColor`/`chroma`) | `createStyles` + `token` — **last resort**                                  |

A static value never belongs in `style`. Do not start a new `createStaticStyles` block in a file that has none.

### Role lookup

Pick the role, then write the class in this table. A literal such as `text-[13px]`, `rounded-[8px]`, `h-[32px]`, `#080808` or `rgba(...)` in a component means a row here was skipped.

| Need                                               | Write                                                                                       | Resolves to                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Primary / secondary text                           | `text-foreground` / `text-muted-foreground`                                                 | `colorText` / `colorTextSecondary`               |
| Tertiary / disabled / existing description text    | `text-foreground-tertiary` / `text-foreground-quaternary` / `text-foreground-description`   | exact engine text roles                          |
| Faint neutral fill / everyday divider              | `bg-fill-quaternary` / `border-divider`                                                     | `colorFillQuaternary` / `colorBorderSecondary`   |
| Existing status background / edge                  | `bg-success-wash` / `border-success-border` (also primary, warning, info, destructive)      | exact engine `*Bg` / `*Border`                   |
| Canvas / panel / overlay surface                   | `bg-background` / `bg-card` / `bg-popover`                                                  | layout / container / elevated                    |
| Existing raised document/card shadow               | `shadow-(--shadow-raised)`                                                                  | exact `boxShadowTertiary`; opt-in raised surface |
| Hover wash / selected or pressed                   | `hover:bg-accent` (static: `bg-muted`) / `bg-selected`                                      | `colorFillTertiary` / `…Secondary`               |
| Stronger edge                                      | `border-border`                                                                             | `colorBorder`                                    |
| Status text or icon                                | `text-destructive-text`, `text-success-text`, …                                             | contrast-checked `*-text` role                   |
| Filled action                                      | `<Button>`; else `bg-primary text-primary-foreground`                                       | primary pair                                     |
| Metadata / body / emphasis text                    | `text-xs` / `text-sm` / `text-base`                                                         | 12px/20px / 14px/22px / 16px                     |
| Dense label, on a surface DESIGN.md scopes to 13px | `text-(length:--text-dense)`                                                                | 13px                                             |
| Chip or tag radius                                 | `rounded-(--radius-chip)`                                                                   | 4px                                              |
| Input or small-control radius                      | `rounded-(--radius-input)`                                                                  | 6px                                              |
| Button / card radius                               | `rounded-(--radius-button)` / `rounded-(--radius-card)`                                     | 8px                                              |
| Menu, popover or dialog radius                     | `rounded-(--radius-overlay)`                                                                | 12px                                             |
| Pill, avatar, circular action                      | `rounded-full`                                                                              |                                                  |
| Control height                                     | `<Button size>`: `default` / `normal` / `lg` 36, `compact` 32, `sm` 28, `large` 40, `xs` 24 | never `h-*` on a Button                          |
| Any other whole-pixel size or gap                  | px ÷ 4 on the scale: `h-11` 44px, `w-70` 280px, `gap-2` 8px                                 | 4px rhythm; half steps allowed                   |
| Full width or height                               | `w-full` / `h-full`                                                                         | not `w-[100%]`                                   |

`Input` names visual height with `visualSize`: `small` 28px, `compact` 32px, omitted/`default`/`normal` 36px, and `large` 40px. Native numeric `size` still means character width. Set `InputGroup visualSize` to size both the group and its `InputGroupInput`; an explicit child value overrides inheritance. `SelectTrigger size` supports `sm` 28px, `compact` 32px, omitted/`default`/`normal` 36px and `large` 40px. The local Select adapter maps `small`/`sm` to 28px, `compact` to 32px, omitted/`middle`/`default`/`normal` to 36px and `large`/`lg` to 40px for both single-select and multiple modes. Multiple mode forwards these roles to `ComboboxChips visualSize` using the shared `InputVisualSize` values `small`, `compact`, `default`, `normal`, and `large`. Chips uses minimum height and `flex-wrap` so selected values can form additional rows; its editable query uses 14px/22px normally and 16px/24px for `large`. Public caller `className` is merged after the role classes, and native `style`/props remain forwarded. NumberField and the local InputNumber adapter support `sm` 28px, `compact` 32px, omitted/`default`/`normal` 36px and `large` 40px; existing `lg` remains 36px. NumberField child overrides retain precedence, and InputNumber forwards that size contract. Button `lg` also remains the existing normal 36px spelling; use `large` for 40px. [AutocompleteInput](../../../src/components/reui/autocomplete.tsx) uses `sm` 28px, `compact` 32px, omitted/`default`/`md`/`lg` 36px and `large` 40px. [Toggle](../../../src/components/ui/toggle.tsx) and [ToggleGroup](../../../src/components/ui/toggle-group.tsx) share `sm` 28px, `compact` 32px, omitted/`default`/`lg` 36px and `large` 40px; small toggle labels use the metadata role. An explicit group size is inherited by its items; omitting it preserves an item's explicit size before the ordinary default. Choose `compact` for an actual collection, chart or preview work toolbar, not every previously 32px call site. Modal OK/Cancel button props forward the local Button's `size`. Retain a nonstandard role only with current necessity evidence and independent review, not a legacy default.

- **`rounded-lg` is 10px and `rounded-xl` is 14px** until the Tailwind radius scale is re-pinned; neither is an approved role. Use the role forms above. `rounded-sm` (6px) and `rounded-md` (8px) happen to match and appear in installed primitives; new code still names the role.
- Raised-surface shadows use the ordinary `--shadow-raised` variable supplied by ThemeRoles and globals. Keep `shadow-(--shadow-raised)` as the variable form; do not create an `@theme` self-reference or give all cards a shadow.
- **Do not invent a utility name for a role.** `cn` cannot classify one: `cn('text-foreground', 'text-dense')` drops the text color and `cn('rounded-md', 'rounded-card')` keeps both. The variable forms above merge correctly, which is why role variables live in `:root` in [globals.css](../../../src/app/globals.css) and not in `@theme`.
- `text-xs` and `text-sm` use the DESIGN.md default line boxes: 12px/20px metadata and 14px/22px body at a 16px root. [globals.css](../../../src/app/globals.css) pins their unitless line-height ratios so they scale with the existing rem font sizes.
- Explicit `leading-*` utilities still override those defaults. Keep an override only when the owner's approved role and current layout justify it; old pixels alone do not justify an exception. When an explicit DESIGN.md line box is needed, use `leading-5` for metadata or `leading-5.5` for body. Numeric `leading-*` classes consume the rem-based `--leading-*` aliases in `globals.css`, independently of the fixed 4px geometry `--spacing`; when introducing a numeric suffix, supply its typography alias rather than relying on geometry fallback.
- The dense-role variable form sets font size only. Keep the scoped role's explicit line height, including the documented 13px/1.7 description; do not apply the metadata or body default to every dense or heading role.
- `border-border` is the stronger edge; `border-divider` is the everyday divider (`colorBorderSecondary`). `border-sidebar-border` remains the sidebar alias. Description text uses `text-foreground-description` to preserve its value; it is not interchangeable with secondary text. Status `*-wash` preserves the engine background, while `*-subtle` is the existing computed mix.
- An arbitrary value is right only when no row fits: `calc()`, viewport units, a CSS variable owned by the component, or a measured optical correction. Explain the last kind on the line, as DESIGN.md requires. If a role is missing, add it to DESIGN.md and `globals.css` rather than repeating a literal.

## Component Priority

1. **ReUI/shadcn primitives** — `@/components/ui/*` (dialog, button, tooltip, popover, dropdown-menu, select, checkbox, radio-group, switch, tabs, accordion, skeleton, alert, progress, slider, scroll-area, sheet, spinner, sonner, input, textarea, combobox) and `@/components/reui/*` (badge, stepper, sortable, code-block, autocomplete). **If the component lives here, use it.**
2. **Local lobehub-compatible adapters** — keep the lobehub API surface so call sites stay mechanical:
   `@/components/ActionIcon`, `@/components/Modal` (createModal/confirmModal/useModalContext/ModalHost/ModalFooter — see the **modal** skill), `@/components/toast` (toast/useToast/ToastHost), `@/components/Avatar` (+AvatarGroup), `@/components/Upload` (+UploadDragger), `@/components/ItemsMenu`, `@/components/Menu`, `@/components/GroupForm` (antd validation binding), `@/components/InputNumber`, `@/components/DatePicker`, `@/components/SimpleEmpty`, `@/components/SearchBar`, `@/components/ImperativeModal`, `@/components/HotkeyInput`, `@/components/ImageSelect`, `@/components/FloatingPanel`, `@/components/FloatingSheet`, `@/components/ContextMenu` (imperative web menu behind `@/libs/contextMenu`).
3. **`@lobehub/ui`** — kept-feature components only: Markdown, Mermaid, Image lightbox, ColorSwatches, Freeze, MaskShadow, DraggablePanel, FileTypeIcon, MaterialFileTypeIcon, CodeDiff/PatchDiff, Tree, EditableMessage, ChatHeader/TabBar mobile shells, Highlighter/Snippet, FluentEmoji, GroupAvatar.
4. **antd** — only as `GroupForm`'s validation layer; never import antd controls directly.
5. **Custom implementation** — true last resort.

Settings → Proxy is the first migrated form: use local `Field` components with `react-hook-form` and the existing `zod` validation; no resolver package is needed. Its schema only validates: submit raw values with the page's mounted-field payload contract. Unmigrated forms keep `GroupForm` until their own behavior and caller migration is reviewed; do not remove shared providers based on this one page.

For Modal specifically, see the dedicated **modal** skill — use the imperative `createModal({ content: … })` pattern over `<Modal open … />`. The new `ModalHost` and sonner `ToastHost` are mounted in `SPAGlobalProvider` and every app shell; only the lobehub base-ui `ToastHost` stays mounted, because retained lobehub components (Image viewer, chat list) still toast through it.

> Common slip: `import { createModal } from '@lobehub/ui/base-ui'` is the legacy stack — use `@/components/Modal`. Same for `toast`, `useToast`, `ModalFooter`, `ModalInstance`.

## Loader selection

Use local `@/components/ui/spinner` for inline/button busy indicators and local skeletons for known shapes. Retain `NeuralNetworkLoading` for AI-specific surfaces that already use it and existing branded full-page loaders where they express the surface's purpose. Do not use antd `Spin` / `<Spin />`. Loading behavior, structure, recovery, and long-operation feedback follow [UX Feedback](../ux/references/feedback.md); this section is the sole component-selection owner for those needs.

## State

Keep transient state in its smallest useful owner. Extract a custom hook when state transitions and handlers obscure rendering or form a reusable unit; do not extract solely because a component has a particular number of hooks.

Split a component only to establish a real state, reuse, render-update, or mountable-capability boundary. Do not split solely to make files smaller. Decomposing a heavy domain feature into host-assembled atoms is owned by **`compose-atoms`**.

## Render Performance and Memoization

Treat `memo`, `useMemo`, and `useCallback` as opt-in optimizations, not default component wrappers. Before adding one, identify the actual rerender boundary and prefer structural fixes:

1. Split at the update boundary.
2. Move transient state to its smallest owner.
3. Use narrow Zustand selectors and avoid broad subscriptions.

Do not memoize prop-free or trivially rendered components, or a component that normally receives new objects, arrays, functions, or JSX children. Do not use memoization to compensate for state held too high in the tree.

Use memoization only when the subtree is demonstrably expensive or frequently repeated, its relevant inputs are stable during normal parent renders, and profiling or a concrete render-path analysis identifies the avoided work. State that reason in the implementation summary or PR.

## Layout

Use plain Tailwind flex utilities — no `Flexbox`/`Center` imports. See `references/layout-kit.md` for the prop→class mapping.

- `gap-*` instead of `margin` for spacing between flex children
- `flex-1` to fill available space; `flex-none` for fixed-size items
- Nest flex containers for complex layouts; `overflow-auto` for scrollable regions
- Settings content width belongs to [SettingContainer](../../../src/features/Setting/SettingContainer.tsx) and its [named role map](../../../src/features/Setting/settingWidth.ts), with approved values in [DESIGN.md](../../../DESIGN.md#density-and-exceptions). Select `form` or `wide`; do not repeat a numeric page cap. A page that owns its panes, or a mobile content branch, consumes the same role without moving headers or adding a second scroll owner. Workspace settings use the shared wrapper's workspace surface rather than replacing its background.

## Related Skills

- **`ux`**: loading behavior and user-facing interaction design; component choices follow [Loader selection](#loader-selection).
- **`modal`**: imperative `@/components/Modal` patterns.
- **`spa-routes`**: SPA navigation, route ownership, router configuration, and `.desktop` variants.
- **`compose-atoms`**: split a heavy domain feature into mountable capability atoms; each host imports only what it mounts.
- **`zustand`**: store structure and selector conventions.
