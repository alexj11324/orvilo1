# Cycles — Linear ↔ Orvilo parity audit (2026-09-23)

**Verdict: nothing to fix.** Linear's cycles surface exists but is *disabled* for team
ORV; Orvilo deliberately ships no Cycles product (user ruling + `PARITY-MATRIX.md`
Try row: ⛔ 有意不做), while still exposing a **read-model** of synced cycles
(filter/group-by/picker). Every divergence below is classified; none is a bounded
bug inside this page's scope.

## Ground truth — Linear (`linear.app/bdiverifier`, team key `ORV`)

| Surface | State | Evidence |
| --- | --- | --- |
| `/bdiverifier/team/ORV/cycles` | **Reachable.** Title `orvilo › Cycles`, body renders empty state `This team has no cycles.` Not a 404 — the route exists even with the feature off. Only interactive controls on the page: `Menu` button + `Add to favorites` switch. | `linear-team-cycles-url.png`, `linear-cycles-page-full.png` |
| Sidebar `Try▾` → `Cycles` row | **Still NOT a nav link** (matches `PAGE-INVENTORY.md`). Renders as `<div tabindex="0" data-menu-open="false">` whose accessible name is **`Enable cycles for team…`** — an enablement affordance (opens a menu/dialog), not navigation. No `href`. | `linear-sidebar-cycles-hover.png`, DOM dump in audit log |
| Sidebar `Try▾` → `Initiatives` row | IS an `<a>`, but points at **`/bdiverifier/settings/initiatives`** — the *settings* page, not a product surface. | same DOM dump |
| Team settings `/bdiverifier/settings/teams/ORV` | `Cycles — Focus your team over short, time-boxed windows — **Off**`. Cycles are **disabled** for team ORV; that is why the cycles page is an empty state and the sidebar row offers to enable them. | `linear-team-settings.png` |

## Ground truth — Orvilo (`localhost:3010`, workspace `agent-testing`)

| Surface | State | Evidence |
| --- | --- | --- |
| `/agent-testing/cycles` | **No route.** SPA catch-all `path: '*'` → `redirectElement('/')` (`src/spa/router/desktopRouter.shared.tsx:1308-1312`). Live-verified: deep link landed on `/tasks` (the workspace default surface). | `orvilo-cycles-route-redirect.png` |
| Sidebar | **No `Try` group, no `Cycles`/`Initiatives` rows** — full left-rail dump: Inbox / My issues / Reviews / Agent / Drafts / Workspace▾(Projects, Views, More) / Favorites▾ / Your teams▾(team → Home, Triage, Issues, Projects, Views). Zero cycle-ish rows. | `orvilo-sidebar-no-cycles.png` |
| Team page tabs | `home` / `triage` / `issues` / `projects` / `views` (`src/features/WorkTeams/TeamPage.tsx:42,130-181`). `?tab=cycles` silently falls through to home. **No cycles tab.** | code + `orvilo-team-issues.png` |
| Team issues → Filter popover | Live-verified: contains `Cycle` select (value `All cycles`), `No project` checkbox, work-query `Add filter` builder, `No filters — matches all readable items` empty hint. | `orvilo-filter-popover-cycle-select.png` |
| Team issues → `?cycle=<id>` | Live-verified: `Cycle: Parity Cycle 42` closable tag + exactly the 4 seeded cycle tasks (Todo 2, In progress 2). | `orvilo-cycle-filtered.png` |
| Team issues → `?layout=list&grouping=cycle` | Live-verified: `Parity Cycle 42` bucket header (count 4) then `No cycle` bucket (count 46). Cycle grouping is list-only by design — board grouping is `status`/`workflowCategory` only (`teamIssuesDisplay.ts:23,67-70`). | `orvilo-grouped-by-cycle.png` |
| Team issues → Display options popover | Live-verified Linear-parity chrome: Layout (Board/List), Grouping (Workflow state), Ordering, Completed issues, Sub-issues, Empty columns, Display properties, Reset. | `orvilo-display-popover.png` |

### Cycles read-model that DOES ship in Orvilo (sync-fed, read-only)

Cycles exist as **imported data + a filter/grouping dimension**, not as a product:

- `team_cycles` table — `packages/database/src/schemas/team.ts:172`
  (comment: *"First-pass cycle record; full cycle planning is a later scope."*)
- `tasks.cycle_ref_id` FK — `packages/database/src/schemas/task.ts:131`,
  index `tasks_cycle_ref_idx`
- **Only write path is Linear sync**: `apps/server/src/services/linearSync/worker.ts`
  upserts `team_cycles` (`remoteCycleId`) and stamps `task.cycleRefId`
  (`worker.ts:2703-2808, 3108, 3334`). No user-facing create/edit/assign UI.
- TRPC: `team.team` bootstrap returns `cycles` (`apps/server/src/routers/lambda/team.ts:82-88`);
  `workAttention.cycleOptions` picker endpoint (`workAttention.ts:675-693`).
- Team Issues surface (`/teams/:teamId?tab=issues`):
  - `Cycle` `<Select>` inside the Filter popover, shown when the team has ≥1 cycle
    (`TeamIssuesControls.tsx:147-156`, label `teams.cycle` / `teams.cycleAll`)
  - `?cycle=<id>` URL param (`teamIssuesDisplay.ts:185,241-243`) — survives reload/back
  - Group-by `cycle` with `No cycle` bucket ordered by the team's own cycle list
    (`TeamIssuesSurface.tsx:448-461`)
  - Closable `Cycle: <name>` filter tag (`TeamIssuesSurface.tsx:548-552`)
- MyWork "Add filter" directory: `cycleId` field with `RepeatIcon`
  (`MyWorkFilterMenu.tsx:137`) exposing **nullary ops only** (`isNull`/`isNotNull`) —
  documented limitation: *"a cycle picker would need a team selector first"*
  (`myWorkFilters.ts:93-95`).
- SavedViews `WorkQueryFilterBuilder`: full cycle value picker via
  `workAttention.cycleOptions`, team-name prefixed cross-team
  (`src/features/SavedViews/WorkQueryFilterBuilder.tsx:144-162,232-234`).
- i18n shipped: `teams.cycle` / `teams.cycleAll` / `teams.noCycle` in
  `packages/locales/src/default/common.ts:1035-1048`, `locales/en-US/common.json:952-977`,
  `locales/zh-CN/common.json:952-977` (周期 / 全部周期 / 无周期).
- Field spec: `cycleId` → `ops: ['eq','isNull','isNotNull'], valueKind: 'cycle'`
  (`packages/types/src/workAttention.ts:399-403`); compiles to `tasks.cycleRefId`
  (`packages/database/src/models/workQuery.ts:206-208,722`).

**Seeded DB (`orvilo_linear_parity_20260922`)**: exactly 1 cycle —
`Parity Cycle 42` (`number=42`, `remote_cycle_id='parity-volume-cycle-42'`,
2026-09-16 → 2026-09-30) on `team_cLY7tmARmiU6` ("Parity Test Team"), with
**4 tasks** carrying `cycle_ref_id`.

## Classification of every observed outcome

| # | Finding | Classification | Rationale |
| --- | --- | --- | --- |
| 1 | No `/cycles` page/route in Orvilo vs Linear's reachable (empty) `/team/ORV/cycles` | **intentional-omission** | User ruling `Cycles → 不要` (`PAGE-INVENTORY.md:129`); `PARITY-MATRIX.md:46` Try group ⛔ 不做. Building the real product (cycle CRUD, cadence settings, current/upcoming lists, auto-rollup, issue assignment) is **out-of-scope-large** if ever revisited — not a bounded fix. |
| 2 | Sidebar `Try → Cycles` row absent in Orvilo | **intentional-omission** | Same ruling. The row isn't even navigation — it's an *enablement* affordance (`aria-label="Enable cycles for team…"`); Orvilo has no per-team cycles enablement toggle because cycles arrive via Linear sync, not a settings switch. |
| 3 | No "Cycles — Off" row in Orvilo team settings | **intentional-omission** | Same model difference as #2 — no enablement concept to toggle. |
| 4 | Cycle filter (`?cycle=`, Filter popover select, filter tag) + group-by-cycle on team issues | **already implemented; verified** | Orvilo ships this even though Linear ORV has cycles off — a superset for imported data. Live-verified with seeded `Parity Cycle 42` (screenshots `orvilo-filter-popover-cycle-select.png`, `orvilo-cycle-filtered.png`, `orvilo-grouped-by-cycle.png`). Prior gap "cycle 是组件态非 URL" (`PARITY-MATRIX.md:67`) is **already fixed** — `teamIssuesDisplay.ts` round-trips `?cycle=` and has tests (`teamIssuesDisplay.test.ts:31-116`). |
| 5 | MyWork "Add filter → Cycle" pane offers nullary ops only (no cycle value picker; Linear shows a cycle list) | **intentional-limitation, out-of-scope of this page** | Documented in code (`myWorkFilters.ts:93-95`): the directory pane has no `case 'cycle'` because cross-team cycle picking needs team context first. The fixable file belongs to the my-issues surface, not this audit's page — flagged for the my-issues agent rather than edited here (shared-file discipline). |
| 6 | No cycle field on Orvilo task/issue detail; no user mutation path for `cycleRefId` | **intentional-omission** | Consistent with #1 — cycles are read-only imported data. Linear's issue-detail Cycle picker exists only when the feature is enabled. Issue detail is also another agent's page. |
| 7 | Linear sidebar `Try → Initiatives` links to `/settings/initiatives` (settings, not a product page) | **documented context** | Confirms the Try group is an enablement surface, reinforcing that Orvilo's absence is structural, not a missing link. |

## Prior-art re-verification (stale claims checked)

- `PAGE-INVENTORY.md:61` "Cycles renders but is not an `<a>`" — **still true** (now known to be an enablement menu trigger).
- `PARITY-MATRIX.md:67` "layout/cycle/noProject 是组件态非 URL" — **now stale**: `?cycle=` is URL state (`teamIssuesDisplay.ts`), covered by tests.
- `team-pages/audit-2026-09-23.md:37` missing `triageCapable` in `team-tasks` mutate key — **fixed**: `TeamPage.tsx:110-123` now prefix-matches the key with a predicate.
- `TEAM-SURFACES-AUDIT.md:71` "Active cycle" card on TeamHome — **no longer present** in current `TeamHome.tsx` (removed/renamed since the audit).

## Environment notes

- Linear captures via shared CDP Chrome `:9222` (read-only; no clicks that mutate).
- Orvilo captures via standalone headless Chromium + real login (CDP browser was
  saturated mid-audit); `:3010` production build, workspace `agent-testing`.
- No product code changed; no `bun run check` needed (docs + evidence only).
