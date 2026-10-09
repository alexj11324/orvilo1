# Sidebar row focus ring

Keyboard focus on every sidebar row uses the Button primitive's ring
(`focus-visible:ring-3 focus-visible:ring-ring/50`): 3px at 50% of `--ring`, drawn inset.
Expected computed `box-shadow` (dark theme, `--ring` white): `color(srgb 1 1 1 / .5) 0 0 0 3px inset`.

There is one definition per row type:

| Row type                                                                                                                  | Renders through                                                                                                                                                      | Ring defined by                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main sidebar rows (Issue, Inbox, My Issues, Agents, Groups, Projects, Views, favorites), team rows, Settings sidebar rows | `SidebarNavItem` / `SidebarMenuButton` / `SidebarMenuSubButton` / `SidebarGroupLabel` / `SidebarGroupAction` / `SidebarMenuAction` (`src/components/ui/sidebar.tsx`) | Tailwind classes on the primitive: `focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset`                                                  |
| Sidebar trigger                                                                                                           | `SidebarTrigger` (a `Button`)                                                                                                                                        | Button's own `ring-3 ring-ring/50` plus `focus-visible:ring-inset`                                                                                             |
| Provider settings rail rows                                                                                               | `NavItem` (`src/features/NavPanel/components/NavItem.tsx`)                                                                                                           | its `interactive` antd-style rule `&&:focus-visible { box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent) }` (not a shadcn primitive) |
| Provider rail section trigger                                                                                             | `ProviderMenu/List.tsx`                                                                                                                                              | Tailwind classes, same trio                                                                                                                                    |
| Notifications button, sidebar search input                                                                                | `Button` / `Input` primitives                                                                                                                                        | primitive ring (`ring-3 ring-ring/50`) plus `focus-visible:ring-inset`; the old `ring-2 ring-sidebar-ring` overrides are gone                                  |

Why the earlier override was removed: PR #597 restated the ring as a `box-shadow` in the
`SidebarShell.tsx` host rule while `components/ui/sidebar.tsx` kept `ring-2 ring-sidebar-ring`,
so two sources set the same property and the measured main-sidebar and settings rows still
showed the primitive's 2px outer ring. The primitive is now the single source;
`SidebarShell.tsx` keeps only `outline: 2px solid transparent` and `border-color: transparent`
on focus-visible, which hand back what the unlayered host reset (antd anchor `:focus-visible`
outline) and a Button's `focus-visible:border-ring` would otherwise add. It no longer sets
`box-shadow`.

Notes:

- The ring is inset because rows sit flush in accordion / scroll-area wrappers that clip
  overflow, so an outer ring would lose its edges.
- `--ring` is `var(--foreground)` in light and dark (`globals.css`, `themeRoles.ts`).
- `NavItem` still sets its own antd-style box-shadow; antd-style is currently unlayered
  (`ANTD_STYLE_LAYER_ENABLED = false`) so it beats Tailwind utilities on that element.

Not changed (not sidebar rows): `WorkInbox/InboxListRow.tsx` (inset 2px primary),
`ChatInput/ActionBar/Params/Controls.tsx`, `ChatInput/ControlBar/WorkingDirectoryPicker.tsx`
(2px outline).
