# App Shell 9 sidebar contract

Use only the sidebar composition from ReUI App Shell 9. Preserve the existing Orvilo main-page container, content layout, headers, overlays and controls. Do not mount SidebarInset, AppHeader, demo content wrappers or a full application shell.

The source sidebar owns its brand/notification header, command-search control, SidebarGroup/Menu/Button/Sub/Action composition and original workspace/account footer. Retain its spacing, typography and controls. Existing Orvilo content determines the groups and rows; do not compress it into six demo navigation slots.

Content invariants: original ordered/hidden core navigation, workspace Projects/Views and more commands, favorites data/actions/pagination/CAS reorder, joined teams and nested routes, persistent section preferences, workspace-aware navigation and modifier clicks. Global workspace/Issue navigation remains visible on Agent pages. Agent does not take over the global sidebar.

The user explicitly requests native transparency: macOS Electron sidebar surfaces are transparent to expose existing native vibrancy. This overrides the source's solid zinc backdrop. Native sidebar text and controls follow the active light/dark theme so the transparent surface retains readable contrast; Web retains the original dark sidebar palette. The source remains 250 px expanded and 66 px collapsed; the existing native titlebar and original main content account for that width. Web keeps the original zinc sidebar fallback.

No old footer icon strip, always-on demo credit/board-progress widget, or Shell 21 conversation tabs. The footer retains the source9 component and actual account/workspace/theme commands. Actual business upgrade content remains conditional on its existing feature gate.

Evidence must cover populated original sidebar contents, main-page and navigation clicks, menus, expanded/collapsed geometry, theme and native transparent material. Local Web startup is blocked by the machine's Electron-only development rule; Web build and Typecheck remain remote CI gates.

Explicit user changes (2026-09-29): remove the midpoint collapse rail and use the existing upper-left native titlebar toggle; use an upper header trigger on Web/non-Mac. In collapsed mode, hide search/account metadata and keep functional icon/avatar triggers. Drafts is intentionally hidden and deferred even though it is present in Linear; its existing data and direct routes remain preserved.
