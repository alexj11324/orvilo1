# Workspace Views directory: entity tabs

Observed 2026-09-22 in authenticated Linear at 1440×900, light theme, English locale. Reference routes: `https://linear.app/bdiverifier/views/issues` and `/views/projects`. Candidate baseline: `app://renderer/ws-useragenttes/views`, HEAD `c5f45c9a3` plus the shared dirty worktree, 1440×900, Chinese locale. Reference account currently has one personal issue view (`All issues`) and zero project views. Earlier zero-issue-view inventory is stale.

## Observed reference

- Header `Views`, `New view` button; below it, `Issues` and `Projects` links. The active segment follows the route.
- Both links are 28px high, 12px/500 Inter Variable with 10px horizontal padding and a 9999px pill radius. At 1440px, Issues begins at x=252.5, y=60.25; its selected background is a light neutral gray.
- Issues: `Name` and `Owner` headers; `Personal views · Only visible to you` group; a 60px linked view row with a view icon and an owner badge/name. A `Create private issue view…` button appears at the group edge.
- Projects: an empty message headed `Views`, with project-specific explanation, `Create new view`, and `Documentation`. The two entity tabs remain visible.
- The `Display options` button on the populated Issues directory opens ordering (`Name`, `Owner`, `Updated`, `Created`), direction, and `Created`/`Updated`/`Owner` display properties. No ordering or property toggle was changed on the reference.

## Candidate baseline and bounded change

- Current directory mixes four task built-ins and one project built-in in a single table, and has no entity tabs. Built-ins support real deep links and favorites; hiding them is not lossless (see `../DIRECTORY-BUILTINS-ASSESSMENT.md`).
- Add `Issues` and `Projects` links within the existing `/views` route, with a query parameter retaining the selected entity through reload and history. Filter real and virtual views by `entityType`; preserve search, ownership groups, create, delete, and direct links.
- Retain the built-in group on each tab. The project tab will therefore continue to have one candidate-specific preset until its replacement creation path is accepted.
- Clicking `New view` from the reference Projects tab navigates to `/views/projects/new` with the Projects query selected and a project preview. The candidate's existing modal stays modal-based but must initialize its real query editor to the active entity tab, including after closing and reopening it.
- Match the reference's entity labels and selected tab shape. Sorting/display controls and rich owner metadata remain separate work because this bounded slice does not introduce a misleading inert control or an unproved owner name.

## Verification

- Red/green regression: mixed task/project view records switch tabs without leaking rows; search still applies within the selected tab; direct links and grouping retain their inputs.
- Scoped check on task-owned files; then real Electron click, reload, browser back, and new-view entry state, with URL, viewport and revision recorded.
