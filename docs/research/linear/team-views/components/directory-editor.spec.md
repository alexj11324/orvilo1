# Team Views directory and new-view editor

## Evidence

- Reference: authenticated Linear `bdiverifier` / team `ORV`, light theme, English, dedicated Brave tab `1298198094`, observed 2026-09-22 at 1729×889 and a 390×844 viewport override. The tab's CDP `Runtime.evaluate`, `Page.captureScreenshot`, and UI navigation were used. No reference record was created or edited.
- Candidate source: `devin/v6-linear-polish` dirty worktree, HEAD `b5e87be2c` when collection began. The shared Electron `:9222` slot was occupied, so candidate findings below are source observations until wired and exercised.
- Reference data: both team directories were empty; the issue editor preview contained a populated In Review group, and the project editor preview contained three project rows. Saved-view row behavior, post-save navigation, error state, and permissions were not observed.

## Observed directory

The team Views surface has a Views title, favorite control, New view in the header, separate Issues and Projects pills below it, and Display options at the right. Issues maps to `/team/ORV/views/issues`, Projects maps to `/team/ORV/views/projects`; switching changes the empty-state noun and URL. The empty body has a stacked-sheet illustration, Views title, explanatory text, Create new view, and Documentation. At 390px the sidebar collapses and the body remains stacked with both actions on one line. The Display options popover has Ordering (Name), Direction, and Created/Updated/Owner display-property toggles.

## Observed editor and interactions

Create new view navigates to a full page ending in `/new`. The header is `orvilo › All issues` or `orvilo › All projects`, depending on source directory. The form has an icon, empty name input with `All issues` or `All projects` placeholder, optional Description input, `Save to orvilo`, Cancel, and an enabled Create view button even with the name input blank. Below it are Issues/Projects pills, Add filter and Display options. The rest of the page is a live result preview, not a five-title sample. Cancel from the Issues editor returned to its Issues directory without writing.

## Candidate implementation boundary

The existing `SavedViews` domain owns entity filtering, filter-builder state, query AST construction, `savedViewCreate`, list cache, and task/project result components. `TeamViewsSurface` composes these with team visibility, team ID, directory segmentation, URL-backed `new=1`, live query preview, and Cancel. The same draft query feeds preview and save. It places `teamId eq current team` in a top-level AND alongside the editable filter, so user OR conditions cannot broaden the result to another team. TeamPage only needs to delegate its Views branch to this component; the shared router remains at `/teams/:teamId` with query-state history.

## Remaining gaps

- The saved-view schema and create API have no description field. A disabled Description placeholder preserves form geometry without promising persistence; enabling it requires a separately scoped domain/API change.
- The current shared project result component is a compact project row. The Linear project editor preview uses the seven-column table. Reuse of the workspace Projects table presentation is the appropriate follow-up.
- The reference has no saved team views. The candidate preserves team-owned plus workspace-shared visibility from the previous implementation until a populated reference fixture establishes which rows belong in the directory.
- Candidate Electron runtime and narrow-window parity must be checked after TeamPage wiring. The shared `:9222` session was in use during this slice.
