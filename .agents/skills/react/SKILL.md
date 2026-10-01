---
name: react
description: 'Use for TSX components, UI libraries, styling, state locality, layout, render performance and memoization.'
user-invocable: false
---

# React Component Writing Guide

## Styling

| Scenario                                                   | Approach                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| Most cases                                                 | `createStaticStyles` + `cssVar.*` (zero-runtime, module-level) |
| Simple one-off                                             | Inline `style` attribute                                       |
| Truly dynamic (JS color fns like `readableColor`/`chroma`) | `createStyles` + `token` — **last resort**                     |

## Component Priority

1. **ReUI/shadcn primitives** — `@/components/ui/*` (dialog, button, tooltip, popover, dropdown-menu, select, checkbox, radio-group, switch, tabs, accordion, skeleton, alert, progress, slider, scroll-area, sheet, spinner, sonner, input, textarea, combobox) and `@/components/reui/*` (badge, stepper, sortable, code-block, autocomplete). **If the component lives here, use it.**
2. **Local lobehub-compatible adapters** — keep the lobehub API surface so call sites stay mechanical:
   `@/components/ActionIcon`, `@/components/Modal` (createModal/confirmModal/useModalContext/ModalHost/ModalFooter — see the **modal** skill), `@/components/toast` (toast/useToast/ToastHost), `@/components/Avatar` (+AvatarGroup), `@/components/Upload` (+UploadDragger), `@/components/ItemsMenu`, `@/components/Menu`, `@/components/GroupForm` (antd validation binding), `@/components/InputNumber`, `@/components/DatePicker`, `@/components/SimpleEmpty`, `@/components/SearchBar`, `@/components/ImperativeModal`.
3. **`@lobehub/ui`** — kept-feature components only: Markdown, Mermaid, Image lightbox, HotkeyInput, ColorSwatches, Freeze, MaskShadow, DraggablePanel, FileTypeIcon, MaterialFileTypeIcon, CodeDiff/PatchDiff, Tree, FloatingSheet/FloatingPanel, EditableMessage, ChatHeader/TabBar mobile shells, Highlighter/Snippet, FluentEmoji, GroupAvatar, ContextMenuHost/ModalHost libs.
4. **antd** — only as `GroupForm`'s validation layer; never import antd controls directly.
5. **Custom implementation** — true last resort.

For Modal specifically, see the dedicated **modal** skill — use the imperative `createModal({ content: … })` pattern over `<Modal open … />`. The new `ModalHost` and sonner `ToastHost` are mounted in `SPAGlobalProvider` and every app shell; the lobehub base-ui hosts stay mounted until call-site slices finish migrating.

> Common slip: `import { createModal } from '@lobehub/ui/base-ui'` is the legacy stack — use `@/components/Modal`. Same for `toast`, `useToast`, `ModalFooter`, `ModalInstance`.

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

- **`ux`**: loading visuals and user-facing interaction design. Do not use antd `Spin` / `<Spin />`.
- **`modal`**: imperative `@/components/Modal` patterns.
- **`spa-routes`**: SPA navigation, route ownership, router configuration, and `.desktop` variants.
- **`compose-atoms`**: split a heavy domain feature into mountable capability atoms; each host imports only what it mounts.
- **`zustand`**: store structure and selector conventions.
