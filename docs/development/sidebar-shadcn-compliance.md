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

| Property    | Result                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| hover       | `--sidebar-accent` background and `--sidebar-accent-foreground` text, changing together (`transition-property: width, height, padding` only)           |
| selected    | `--selected`, stronger than hover and kept on top of it                                                                                                |
| focus       | transparent outline plus one `0 0 0 2px var(--sidebar-ring)` shadow on every `data-sidebar` control, so no second ring can stack; background unchanged |
| group label | one colour (`--sidebar-group`), hover background when it is a button                                                                                   |
| scrollbar   | transparent until the content area is hovered                                                                                                          |

`NavItem` uses the same roles in its own scoped styles.

## Header and footer

The shell has **one** account/workspace entry: the workspace switcher in
`SidebarHeader` (`WorkspaceSwitcher`: `SidebarMenu > SidebarMenuItem >
SidebarMenuButton size="lg" render={<DropdownMenuTrigger />}`). It is fixed (only
`SidebarContent` scrolls), shows the workspace glyph and name, a visible
`ChevronsUpDown` (`data-sidebar-affordance` opts it out of the dimmed-icon rule), has
`aria-expanded` from the trigger and, in the icon rail, a tooltip with the name (the name
stays in the accessibility tree as `sr-only`). `WorkspaceAvatar` has one shape
(`rounded-md`, the same as team glyphs) on root, image, fallback and border.

The former footer user block (`NavWorkspace`) is gone. Its contents moved into the
switcher menu (`WorkspaceMenuContent`), grouped and separated like Linear:

| Group     | Entries                                                                                 |
| --------- | --------------------------------------------------------------------------------------- |
| Workspace | Settings (`useMenu` key `setting`, keeps the Kbd and "Update available" badge), Members |
| Switch    | Workspaces list (member count, check on the active one), New workspace                  |
| Personal  | user name label, Account (`/settings/profile`), Import data / business items, Theme     |
| Help      | Documentation, cloud promotion, Get App                                                 |
| Session   | Sign out / Log in                                                                       |

`groupUserMenuItems` (`userMenuGroups.ts`) splits `useMenu().mainItems` by key into those
groups; unknown keys fall into Personal. Settings surfaces hide the switcher header, so
they get a one-row `SidebarFooter` (`SettingsSignOut`) to keep sign-out reachable; no
other surface renders a footer.

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

## Round 3 follow-ups

- Workspace menu: the "Workspace settings" row renders its desktop shortcut through local
  `Kbd` / `KbdGroup` primitives. The pure `hotkeyDisplayKeys` helper resolves `mod` / `comma`
  to the platform glyphs (⌘ and `,` on macOS, Ctrl elsewhere) instead of printing raw tokens.
- Favourites: dnd-kit's `tabindex="0"` (and `role`) on the sortable `li` are dropped via
  `withoutRowTabStop`, so each row keeps one tab stop, the link with its focus ring.
  Keyboard reordering is the row menu's Move up / Move down items.
