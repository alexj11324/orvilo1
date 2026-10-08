# Sidebar shadcn compliance

Rules the primary sidebar (`src/features/ReUIShell/**`, `src/features/HomeSidebar/**`,
`src/features/NavPanel/**`) follows so rows, headers and actions behave the same
everywhere. The primitive is `src/components/ui/sidebar.tsx` (Base UI: `render`,
not `asChild`).

## Composition

- Every row is `SidebarMenu` > `SidebarMenuItem` > `SidebarMenuButton`
  (`isActive` for the current route). `SidebarNavItem` is the only wrapper.
- A trigger (context menu, dropdown, collapsible) is composed **into** the
  primitive through `render`: `<SidebarMenuButton render={<DropdownMenuTrigger />}>`.
  Do not wrap a primitive in `<XTrigger render={<SidebarMenuButton />}>`: the
  trigger clones the primitive and its own `data-slot` overwrites the primitive's
  (`sidebar-menu-button`, `sidebar-group-label`). `SidebarContextMenu` therefore
  accepts a function child: `{(trigger) => <SidebarMenuButton render={trigger(<a />)} />}`.
- Collapsible groups (`SectionHeader`) and team rows use Base UI `Collapsible`:
  the label or row is the trigger rendered through the primitive, the chevron
  turns with the trigger's `data-panel-open` (Base UI's name for Radix's
  `data-state=open`), the panel is `CollapsibleContent`. `aria-expanded` and
  `aria-controls` come from the trigger.
- Group "more" is `SidebarGroupAction`; row "more" is `SidebarMenuAction showOnHover`.
  Both are 24px (`size-6`, DESIGN.md minimum) and stay visible on row hover, on
  `focus-within`, and while their menu is open (`aria-expanded`, `data-popup-open`).
- Do not set icon sizes inside menu buttons; the primitive sizes `svg` to `size-4`.

## The host reset (`SidebarShell` `hostStyles`)

The app mounts Ant Design's unlayered reset. For every `a` it sets the link
colour, `transition: color 0.2s` and a blue 2px `:focus-visible` outline, and the
global stylesheet sets `scrollbar-width: thin` on `*`. Unlayered rules beat the
primitive's layered Tailwind utilities, so `hostStyles` is the single place that
hands those properties back, keyed on `data-sidebar` (never `data-slot`):

| Property    | Result                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| hover       | `--sidebar-accent` background and `--sidebar-accent-foreground` text, changing together (`transition-property: width, height, padding` only) |
| selected    | `--selected`, stronger than hover and kept on top of it                                                                                      |
| focus       | transparent outline (same as `outline-hidden`), indicator is the primitive's `ring-2 ring-sidebar-ring`; background unchanged                |
| group label | one colour (`--sidebar-group`), hover background when it is a button                                                                         |
| scrollbar   | transparent until the content area is hovered                                                                                                |

`NavItem` uses the same roles in its own scoped styles.

## NavItem (secondary panels)

`NavItem` keeps its 28px / 13px row. DESIGN.md records the dense 13px role and the
28px dense control height, and the component also serves popover selectors and
settings menus, so a geometry change is a product decision, not a bug fix. Its
states and semantics follow the primary rows: selected is `--selected`
(`data-active`), hover is `--sidebar-accent`, no inline background, a row without
`href` is a real `button` (a row that carries its own action buttons keeps a `div`
exposed as `role="button"` with Enter / Space handling, because buttons cannot nest).

## Checklist for a new sidebar row

1. `SidebarNavItem` or the primitives directly; no hand-built anchors.
2. Trigger composed into the primitive through `render`.
3. `cn()` for class composition; `size-N`; tokens only; no `!important`.
4. Icon-only controls carry an `aria-label`; collapsed rows get a `tooltip`.
