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

| Need                                               | Write                                                                                 | Resolves to                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| Primary / secondary text                           | `text-foreground` / `text-muted-foreground`                                           | `colorText` / `colorTextSecondary` |
| Canvas / panel / overlay surface                   | `bg-background` / `bg-card` / `bg-popover`                                            | layout / container / elevated      |
| Hover wash / selected or pressed                   | `hover:bg-accent` (static: `bg-muted`) / `bg-selected`                                | `colorFillTertiary` / `…Secondary` |
| Stronger edge                                      | `border-border`                                                                       | `colorBorder`                      |
| Status text or icon                                | `text-destructive-text`, `text-success-text`, …                                       | contrast-checked `*-text` role     |
| Filled action                                      | `<Button>`; else `bg-primary text-primary-foreground`                                 | primary pair                       |
| Metadata / body / emphasis text                    | `text-xs` / `text-sm` / `text-base`                                                   | 12 / 14 / 16px                     |
| Dense label, on a surface DESIGN.md scopes to 13px | `text-(length:--text-dense)`                                                          | 13px                               |
| Chip or tag radius                                 | `rounded-(--radius-chip)`                                                             | 4px                                |
| Input or small-control radius                      | `rounded-(--radius-input)`                                                            | 6px                                |
| Button / card radius                               | `rounded-(--radius-button)` / `rounded-(--radius-card)`                               | 8px                                |
| Menu, popover or dialog radius                     | `rounded-(--radius-overlay)`                                                          | 12px                               |
| Pill, avatar, circular action                      | `rounded-full`                                                                        |                                    |
| Control height                                     | `<Button size>`: `lg` 36 normal, `default` 32 compact toolbar, `sm` 28 dense, `xs` 24 | never `h-*` on a Button            |
| Any other whole-pixel size or gap                  | px ÷ 4 on the scale: `h-11` 44px, `w-70` 280px, `gap-2` 8px                           | 4px rhythm; half steps allowed     |
| Full width or height                               | `w-full` / `h-full`                                                                   | not `w-[100%]`                     |

- **`rounded-lg` is 10px and `rounded-xl` is 14px** until the Tailwind radius scale is re-pinned; neither is an approved role. Use the role forms above. `rounded-sm` (6px) and `rounded-md` (8px) happen to match and appear in installed primitives; new code still names the role.
- **Do not invent a utility name for a role.** `cn` cannot classify one: `cn('text-foreground', 'text-dense')` drops the text color and `cn('rounded-md', 'rounded-card')` keeps both. The variable forms above merge correctly, which is why role variables live in `:root` in [globals.css](../../../src/app/globals.css) and not in `@theme`.
- `text-xs` and `text-sm` carry Tailwind's line height (16px / 20px), not the 20px / 22px in DESIGN.md; the variable form sets font size only. Add `leading-5` to prose or multi-line metadata that needs the DESIGN.md line box. Re-pinning `--text-xs--line-height` and `--text-sm--line-height` is a scoped migration, like the radius scale.
- `border-border` is the stronger edge. The everyday divider (`colorBorderSecondary`) has a role class only in the sidebar (`border-sidebar-border`); elsewhere keep the surrounding file's divider and add a role to DESIGN.md and `globals.css` before repeating a literal.
- An arbitrary value is right only when no row fits: `calc()`, viewport units, a CSS variable owned by the component, or a measured optical correction. Explain the last kind on the line, as DESIGN.md requires. If a role is missing, add it to DESIGN.md and `globals.css` rather than repeating a literal.

## Component Priority

1. **ReUI/shadcn primitives** — `@/components/ui/*` (dialog, button, tooltip, popover, dropdown-menu, select, checkbox, radio-group, switch, tabs, accordion, skeleton, alert, progress, slider, scroll-area, sheet, spinner, sonner, input, textarea, combobox) and `@/components/reui/*` (badge, stepper, sortable, code-block, autocomplete). **If the component lives here, use it.**
2. **Local lobehub-compatible adapters** — keep the lobehub API surface so call sites stay mechanical:
   `@/components/ActionIcon`, `@/components/Modal` (createModal/confirmModal/useModalContext/ModalHost/ModalFooter — see the **modal** skill), `@/components/toast` (toast/useToast/ToastHost), `@/components/Avatar` (+AvatarGroup), `@/components/Upload` (+UploadDragger), `@/components/ItemsMenu`, `@/components/Menu`, `@/components/GroupForm` (antd validation binding), `@/components/InputNumber`, `@/components/DatePicker`, `@/components/SimpleEmpty`, `@/components/SearchBar`, `@/components/ImperativeModal`.
3. **`@lobehub/ui`** — kept-feature components only: Markdown, Mermaid, Image lightbox, HotkeyInput, ColorSwatches, Freeze, MaskShadow, DraggablePanel, FileTypeIcon, MaterialFileTypeIcon, CodeDiff/PatchDiff, Tree, FloatingSheet/FloatingPanel, EditableMessage, ChatHeader/TabBar mobile shells, Highlighter/Snippet, FluentEmoji, GroupAvatar, ContextMenuHost/ModalHost libs.
4. **antd** — only as `GroupForm`'s validation layer; never import antd controls directly.
5. **Custom implementation** — true last resort.

For Modal specifically, see the dedicated **modal** skill — use the imperative `createModal({ content: … })` pattern over `<Modal open … />`. The new `ModalHost` and sonner `ToastHost` are mounted in `SPAGlobalProvider` and every app shell; the lobehub base-ui hosts stay mounted until call-site slices finish migrating.

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

## Related Skills

- **`ux`**: loading behavior and user-facing interaction design; component choices follow [Loader selection](#loader-selection).
- **`modal`**: imperative `@/components/Modal` patterns.
- **`spa-routes`**: SPA navigation, route ownership, router configuration, and `.desktop` variants.
- **`compose-atoms`**: split a heavy domain feature into mountable capability atoms; each host imports only what it mounts.
- **`zustand`**: store structure and selector conventions.
