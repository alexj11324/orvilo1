# Views directory entity tabs — runtime checkpoint

Verified 2026-09-22 against the actual Electron renderer on CDP `:9222`, at 1440×900 CSS pixels, Chinese locale, workspace `ws-useragenttes`. The first three captures were made at repository HEAD `03832fb09` (18:24 local); the titlebar Back replay followed HEAD `bd80bc23d` (18:27 local). Both used the uncommitted task-owned diff in `SavedViewsPage.tsx`, `NewViewModal.tsx`, `savedViewDirectory.ts`, the focused test and common locale files. The shared candidate tab began and ended at `app://renderer/ws-useragenttes/projects`.

The authenticated Linear reference was inspected in a dedicated Brave tab via CDP at `https://linear.app/bdiverifier/views/issues` and `/views/projects`, 1440×900, English locale. Issues had one personal view; Projects was empty. No reference records were changed.

## Candidate transitions observed

1. `app://renderer/ws-useragenttes/views` selected Issues (`aria-current=page`) and listed four task built-ins; the project built-in was absent. Body scroll width equaled 1440px.
2. Clicking Projects reached `app://renderer/ws-useragenttes/views?entity=project`, selected Projects, and showed only the `All projects` built-in. Body scroll width stayed 1440px.
3. Clicking `New view` on Projects opened the real editor with entity `Projects`; its live preview reported one project (`Parity Test Project`). Cancel closed it without creating a view.
4. Searching `never-match-project` showed the no-match state and zero rows; clearing search restored the project row.
5. A full reload on the Projects URL retained the Projects selection and project-only row after loading.
6. From the Electron sidebar Projects route, opening Views and clicking the Projects entity tab enabled the actual titlebar Back button (`NavigationBar.tsx:147`). Clicking it restored `/ws-useragenttes/views`, the Issues selection and all four task built-ins. The shared tab was then restored to `/ws-useragenttes/projects`.

Local candidate captures: `/private/tmp/views-tabs-issues-after.png`, `/private/tmp/views-tabs-projects-after.png`, `/private/tmp/views-project-create-after.png`. These are local evidence and were not published.

## History boundary

`window.history.back()` from the Electron renderer returned to the outer `/projects` page. This is an invalid probe of the per-tab navigation stack: `WorkspaceLink.desktop.tsx` navigates the active memory router, while `useWindowUrlMirror.ts` mirrors its URL with `window.history.replaceState`. The direct titlebar Back replay above passed through `useNavigationHistory.ts` and the memory router's `navigate(-1)`.

## Gates and remaining differences

- Focused regression: missing-helper red test, then 3/3 green; scoped `bun run check` on seven task-owned source/locale files passed with lint clean. No local `tsgo` was run.
- Reference entity routes use `/views/issues` and `/views/projects`; candidate selection uses a query on the existing `/views` route because the shared router is owned by another lane.
- The candidate retains its real virtual built-in presets, so its project tab is populated while the reference project directory is empty. Removing or hiding those presets requires a proven replacement creation path and favorite/deep-link handling; see `DIRECTORY-BUILTINS-ASSESSMENT.md`.
- Directory Name/Owner columns, owner chips, sorting/display options, grouped creation action, and exact empty illustration remain separate parity gaps.
