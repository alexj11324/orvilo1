# Settings content width

Issue #696's owner decision sets form pages to 640px and wide pages to 1024px.
`SettingContainer` now owns both caps through `width="form"` (default) and
`width="wide"`. The workspace container re-exports it, rather than maintaining a
second layout implementation. DESIGN.md records the page roles.

The standard personal/workspace shells and route skeleton share the tab-width
policy. Profile no longer narrows itself inside a wider shell, so sibling sections
get the same form width. Agents explicitly selects the form lane; providers and
credentials explicitly select wide. Mobile standard pages use the same cap without
adding desktop padding or a fixed-height scroll area. Dedicated multi-pane pages
retain their own layout and scroll ownership.

Intentional changes: default form tabs and workspace General/Budget narrow from
1024px to 640px; Profile and Agents remain 640px, and named lists/reports retain
1024px. Skeletons now follow the selected lane rather than always occupying 1024px.
Inner row controls and preview elements are not page content-width owners.

The existing workspace layout test covers form vs wide route selection as well as
header/content rendering. The 15-file scoped check passed all 15 related tests. Compiling the actual global
stylesheet with Tailwind v4 confirmed both width utilities and the existing 36px
gap. Full type checks and relevant CI suites remain separate gates.
Electron before/after captures of Profile, Agents, Appearance and workspace General
are still required for product acceptance; local tests alone do not establish visual
parity. Record captures with their exact revision on the PR when available.
