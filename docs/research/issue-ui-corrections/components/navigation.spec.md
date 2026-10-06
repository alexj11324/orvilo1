# Navigation and retirement

Target: HomeSidebar/Navigation/shared route and command/hotkey UI owners.
Evidence: user screenshot sidebar has a bare +; actual root already redirects to /tasks but sidebar has no tasks link; Reviews and New Goal are currently visible.
Interaction: click navigation; create actions only on their owning page.
Reuse current WorkspaceLink, Issues board (/tasks), CreateTaskModal. Sidebar Issues is one destination; no separate Home. Don't redesign all navigation or reorder unrelated groups.
Remove every sidebar create plus/header compose and Agent sidebar new/create actions, retain page-owned new Task modal. Agent creation only on Agents page; choose/select already existing Agent elsewhere.
Hide Reviews in sidebar/customize/commands/hotkeys; don't delete PR or task-review backend. Stop the badge fetch after its consumer is removed.
Remove application-owned goal creation from CreateRow, command palette, inline TaskIntentReview/CreateTaskInlineEntry, goals page/empty state and slash-action menu. Keep native ACP tools and persisted record readers.
No new glyph/style system. Existing row tokens and focus behavior. Normal/narrow/sidebar-collapsed must all retain Issues entry. New task UI remains user's screenshot modal.
Regression: persisted old sidebar preferences cannot restore create/reviews; navigation actually reaches Issues, goals cannot be started from commands. Tests fail on base. No local tsgo.
