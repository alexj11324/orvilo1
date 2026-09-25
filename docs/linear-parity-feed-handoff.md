# Linear parity — issue feed handoff

Branch `feat/linear-parity-feed` → PR #257 (base `devin/v6-linear-polish`, draft).
This PR lands M3/M7/M9 of the issue-detail feed parity: reactions, subscribers,
relation history events — plus fixes for the Devin Review round on it.

## What's in the PR

| Area                  | What landed                                                                                                                                                                                                                      | Where                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M3 reactions + attach | `TaskReactions` (quick emoji grid + emoji-mart Picker, base-ui Popover) and the "Attach images, files, or videos" link under the issue description footer                                                                        | `src/features/AgentTasks/AgentTaskDetail/TaskReactions.tsx`, `TaskInstruction.tsx`                                                                                                                           |
| M7 subscribers        | `TaskSubscribers` row under the comment composer: self Subscribe/Unsubscribe, avatar stack, "Change subscribers" member manager (real backend)                                                                                   | `TaskSubscribers.tsx`, `apps/server/src/routers/lambda/workAttention.ts`, `packages/database/src/models/taskSubscription.ts`                                                                                 |
| M9 relation events    | `relation` activity type: addDependency/removeDependency write a row on BOTH issues (`blockedBy`/`blocking` directions, `relates` without direction); rendered in issue feed, project activity feed, and agent prompt            | `packages/types/src/task/index.ts`, `packages/database/src/models/task.ts`, `apps/server/src/services/task/index.ts`, `TaskActivities.tsx`, `ProjectActivityPage.tsx`, `packages/prompts/src/prompts/task/*` |
| Issue Detail Align    | Left-align assignee & agent attributes along 232px rail, remove rogue `"0"` rendered under status (commit `ebcb26e08`)                                                                                                           | `TaskDetailSidebar.tsx`, `TaskDetailHeader.tsx`                                                                                                                                                              |
| Electron 8GB Heap     | Persist 8GB max-old-space-size in electron dev startup scripts and vite renderer config (commit `c40b25f93`)                                                                                                                     | `vite.renderer.config.ts`, `desktopRouter.shared.tsx`                                                                                                                                                        |
| Issue Row Status Mark | Exactly one canonical 14px status mark per issue row, redundant workflow badges removed from `/my-issues`, Team Kanban, etc. (commit `1d515a6e1`)                                                                                | `TaskItem.tsx`, `TaskContent.tsx`, `KanbanCard.tsx`                                                                                                                                                          |
| Team Home 1:1 Parity  | 1:1 Linear parity for Team Home Overview, NavHeader, and destinations (commit `a7c8a6358`). Removed redundant "最近的问题" (recent issues) block, added resources action icons, added settings to Go to rail, aligned NavHeaders | `TeamHomeOverview.tsx`, `TeamPage.tsx`, `TeamIssuesSurface.tsx`, `TeamProjectsSurface.tsx`, `TeamViewsSurface.tsx`, `teamHomeDestinations.ts`                                                                |

## User Policy Directive (STRICT)

**"Linear 有的我们也要有，Linear 没有的我们也不能有"** (Strict 1:1 parity with Linear: what Linear has, we must have; what Linear does not have, we must NOT have).
All upcoming page alignments must strictly follow this principle: do not keep Orvilo custom blocks if Linear does not have them; do not miss elements if Linear has them. Verification must be performed on headful Electron CDP (:9233) against Linear reference on Brave CDP (:9222).

Reactions are the one piece backed by fabricated state: a persisted zustand
store (`src/store/taskReactions.ts`, localStorage key `orvilo-task-reactions`,
keyed by task **database uuid**). The documented swap point for a real
`task_reactions` table is in `docs/linear-parity-feed.md`.

## Review round already handled (second commit)

Devin Review posted 4 findings + 2 flags; all addressed:

1. `collapseActivityLog` dropped relation rows (absent from/to read as a net
   no-op) → relation rows bypass merge and the noop filter entirely
   (`row.type === 'relation'` early-out + filter guard). Regression test in
   `collapseActivityLog.test.ts`.
2. `TaskSubscribers` kept the previous issue's roster while refetching →
   keyed by `activeTaskDatabaseId` at the call site.
3. relates→blocks upgrade left the old link in history → the dependency
   transaction now writes `removed` rows for the old type on both issues
   alongside the new `added` pair. Covered by a new test in
   `taskDependency.test.ts` ("dependency activity feed" describe).
4. Private-issue identifiers leaked onto the counterpart's public feed →
   `relationTargetIdentifier` is null when the **target** task is `private`
   (on both add and remove paths); `relationTargetTaskId` (opaque uuid) stays
   for internal joins. Covered by a new test.
5. Rapid subscribe toggles could persist out of order → per-user pending
   guard + roster reconcile after every settle in `TaskSubscribers`.
6. Flag: reaction picker used antd Popover while the subscriber manager used
   base-ui → both now on `@lobehub/ui/base-ui` Popover.
7. Flag: verification evidence was pending → see "Still open" below.

Independent light review (session `7a5a4ed6e090439ab52c0a896eb17101`, reviewed
f4fd99d3) added one blocking finding, fixed in 38a0b459:

8. `setSubscriber` manage-others never checked the task's workspace —
   caller-scoped `findById` also returns personal/private tasks, so a caller
   could stamp subscriptions the target can't read and pollute `workQuery`'s
   subscribed filter. Now FORBIDDEN unless `task.workspaceId === ctx.workspaceId`.

Nits it raised, also fixed in 38a0b459: shared `actionLinkStyles` for the three
feed buttons, `EMPTY_REACTIONS` constant on the selector (no per-render array),
`handleSelect` delegates to `handleToggleChip`, bell icon follows subscribe
state, and "Change subscribers" hides when the workspace roster is empty
(personal mode would 403 anyway).

9. E2E fix (f6a3f3f7): the `task-prerequisites` scenario had been failing on
   the base branch since #256 — the step clicked
   `Add relation to Prerequisite issues`, but #250 renamed the rail group to
   `Blocked by`. The locator now expects `Add relation to Blocked by`
   (verified against the failure screenshot in the #256 run's e2e-artifacts).
   Note `Test Web App` is path-filtered: pushes that only touch e2e/docs skip
   it, so the scenario re-runs on the next content-bearing push.

## Still open for the next agent

- **Visual verification on Electron** (the user requires Electron, not the
  web SPA, for product verification): Electron 43.7.5 dist is already
  downloaded in this worktree
  (`node_modules/.pnpm/electron@43.7.5_*/node_modules/electron/dist`).
  `apps/desktop` `pnpm install` was running at handoff — let it finish, then:

  ```bash
  cd <worktree>
  CDP_PORT=9233 ELECTRON_LOG=/tmp/electron-feed.log \
    .agents/acceptance/scripts/electron-dev.sh start
  ```

  Then sign in via the scripted OIDC flow (see
  `acceptance-dockerless-env` skill → "Scripted Electron OIDC sign-in"):
  LoginStep → "Connect to your own Orvilo server instance" → the Next port of
  the running env (parity env: `http://localhost:3010`, database
  `orvilo_linear_parity_20260922`, seeded via
  `init-dev-env.sh seed-parity`). Safari hops handle better-auth + consent;
  desktop polls the handoff and lands signed-in.
  Open `/ws-useragenttes/task/VYG-2`, screenshot the feed (reactions row,
  attach link, subscribers row, relation events), compare against the Linear
  reference browser (Chrome CDP :9222, profile `~/linear-ref-profile`,
  workspace `bdiverifier`, e.g. ORV-24), and attach the comparison to #257
  with the commit SHA.

- **Visual verification on Electron**: Already verified for Issue Detail, `/my-issues`, Team Kanban, and Team Home overview on headful Electron CDP (:9233).

- **Next Pages in Scope for Parity (/goal 完成所有页面对齐)**:
  1. Project Detail (`/project/:id`) and Project List (`/projects`) — check against Linear `/project/:slug/overview` and `/projects/all`.
  2. Saved Views (`/views/:id`) — check against Linear views.
  3. Settings (`/settings`) — check against Linear workspace & team settings.
  4. WorkInbox (`/inbox`) & Reviews (`/reviews`).

- **Endpoint test coverage**: `workAttention.subscribers` / `setSubscriber` branches.

- **Avatar stack "+N" overflow**: cap at 5 with overflow count.

- **Strict Requirement for All Subsequent Alignment**:
  - **"Linear 有的我们也要有，Linear 没有的我们也不能有"** (Strict 1:1 parity with Linear).
  - All visual verification must be captured and confirmed on headful Electron (:9233), not web SPA proxy.

## Local environment notes

- Worktree `/Users/devin/repos/orvilo1-maincol2` = this branch. Sibling
  worktrees' dev servers were killed and their node\_modules removed to fix a
  full disk; `orvilo1-parity-issue` (the seeded reference env) is untouched
  and still has node\_modules.
- Seed data: `DATABASE_DRIVER=node ORVILO_PARITY_SEED_TARGET=local bunx tsx
scripts/seedLinearParity` (wired into `init-dev-env.sh seed-parity` by #246);
  `DATABASE_DRIVER=node` is mandatory — the default neon driver can't reach
  local pg.
- macOS `timeout` doesn't always kill `tsgo`; run it without the wrapper or
  watch it yourself. `bun run check` = lint + related tests; full-repo
  typecheck is `NODE_OPTIONS=--max-old-space-size=12288 bunx tsgo --noEmit`.
- Several ports on this box are/were in use: parity env Next :3010 /
  Vite :37935 / s3rver :29000; signed-in Chrome CDP :9223 (localhost-scoped
  cookies); Linear reference Chrome CDP :9222 (read-only).
