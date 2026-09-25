# Linear parity — issue feed handoff

Branch `feat/linear-parity-feed` → PR #257 (base `devin/v6-linear-polish`, draft).
This PR lands M3/M7/M9 of the issue-detail feed parity: reactions, subscribers,
relation history events — plus fixes for the Devin Review round on it.

## What's in the PR

| Area                  | What landed                                                                                                                                                                                                           | Where                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M3 reactions + attach | `TaskReactions` (quick emoji grid + emoji-mart Picker, base-ui Popover) and the "Attach images, files, or videos" link under the issue description footer                                                             | `src/features/AgentTasks/AgentTaskDetail/TaskReactions.tsx`, `TaskInstruction.tsx`                                                                                                                           |
| M7 subscribers        | `TaskSubscribers` row under the comment composer: self Subscribe/Unsubscribe, avatar stack, "Change subscribers" member manager (real backend)                                                                        | `TaskSubscribers.tsx`, `apps/server/src/routers/lambda/workAttention.ts`, `packages/database/src/models/taskSubscription.ts`                                                                                 |
| M9 relation events    | `relation` activity type: addDependency/removeDependency write a row on BOTH issues (`blockedBy`/`blocking` directions, `relates` without direction); rendered in issue feed, project activity feed, and agent prompt | `packages/types/src/task/index.ts`, `packages/database/src/models/task.ts`, `apps/server/src/services/task/index.ts`, `TaskActivities.tsx`, `ProjectActivityPage.tsx`, `packages/prompts/src/prompts/task/*` |

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

- **Endpoint test coverage** (review nit left open): `workAttention.subscribers` /
  `setSubscriber` branches (FORBIDDEN without workspace task, NOT\_FOUND for
  non-member target, self-toggle, manage-others) have no tests yet — precedents
  in `apps/server/src/routers/lambda/__tests__/workAttention.*.test.ts`.

- **Avatar stack "+N" overflow** (review nit left open): the stack caps at 5
  with no overflow count.

- **CI**: watch `git_pr_checks` for #257; the dedup race is fixed (#256) so
  failures now are real.

- **Independent light review** session `7a5a4ed6e090439ab52c0a896eb17101`
  was reviewing f4fd99d3 when this landed — its verdict predates the review
  fixes; fold in anything it reports.

- Then mark #257 ready and merge (squash).

## Decisions still pending with the user

- J3: Linear's "Slack channel" row on the project rail — build or skip.
- J4: project subscribe bell — deferred.
- The user's screenshot complaint (faded Assignee/Agent rows + duplicate
  "In progress" + Set schedule row) matched pre-#250 layout — i.e. a stale
  leftover dev server on this machine, not the current branch. Confirm in the
  Electron pass that the rail renders the current field set.

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
