# Sidebar row focus ring

Keyboard focus on sidebar rows uses the same ring as the Button primitive
(`focus-visible:ring-3 focus-visible:ring-ring/50`): 3px at 50% of `--ring`.

- `src/features/NavPanel/components/NavItem.tsx` (`interactive` style) and the shared
  rule in `src/features/ReUIShell/SidebarShell.tsx` (menu-button, menu-sub-button,
  menu-action, group-action, group-label, trigger) carry it as
  `box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent)`.
- Edit the antd-style rule itself: these rules are unlayered and beat Tailwind classes.
- The ring is inset, not outer. Rows rendered by `NavItem` sit flush (no horizontal
  padding) inside accordion content and the `SideBarLayout` scroll area, both of which
  clip overflow, so an outer ring would lose its left/right edges. Inset keeps one
  look across all sidebars.
- `--ring` is `var(--foreground)` in light and dark (`globals.css`, `themeRoles.ts`),
  so the ring resolves to 50% black / white.

Not changed (not sidebar rows): `WorkInbox/InboxListRow.tsx` (inset 2px primary),
`ChatInput/ActionBar/Params/Controls.tsx`, `ChatInput/ControlBar/WorkingDirectoryPicker.tsx`
(2px outline), `Settings/provider/ProviderMenu/List.tsx` and `ReUIShell/NotificationsPopover.tsx`
(Tailwind `ring-2`), `components/ui/sidebar.tsx` (`ring-2 ring-sidebar-ring`, overridden
inside the shell).
