# Orchestrator: CAID-style Workspace Isolation + Integration Plan

## Context

Per CAID (Geng & Neubig 2026), the coordination loop is:

> dependency DAG → dispatch ready tasks → engineers work in **isolated git worktrees** →
> self-verify + commit → **merge back to main** → **recompute plan → reassign** → final review

Orvilo already owns: goal graph + frontier selection (`decideNextMove`), manager planning
turns (`gateOrTakeOver`), dispatch (`taskRunner` → `execAgent` → local/device/sandbox),
settle cascade (`taskLifecycle.onTopicComplete` → `cascadeOnCompletionMany`), verify/acceptance,
reviewer + steer.

**The missing CAID mechanism = branch-and-merge**: tasks share one checkout, so parallel
runs overwrite each other and there is no integrate step before the frontier advances.

## Design

### 1. Workspace binding (no migration)

`tasks.config.workspace` (jsonb, type-only):

```ts
interface TaskWorkspaceConfig {
  provider: 'git'; // v1: git worktree on a device
  repoPath: string; // source repo path on the device
  baseBranch?: string; // integration target; default = repo's current default
  deviceId?: string; // optional pin; else resolved per-run from agent binding
}
```

Resolution order: `task.config.workspace` → walk `parentTaskId` chain → none (non-repo task,
skip provisioning entirely). Sandbox runs already get an ephemeral checkout; v1 covers the
`device`/`local` execution path only.

### 2. Provisioning — `TaskWorkspaceService` (new, apps/server/src/services/taskWorkspace/)

`provisionForRun({ task, deviceId })` → `WorkingDirConfig`:

- branch: `task/<identifier>` (+ `-r<n>` on retry attempts)
- worktreePath: shared `deriveWorktreePath(repoPath, branch)` (`@orvilo/types`, already the
  UI convention `<repo>-<branch>`)
- `deviceGateway.addGitWorktree({ deviceId, path: repoPath, branch, worktreePath })` — RPC
  already exists and re-derives the target server-side
- returns `{ path: repoPath, repoType: 'git', git: { activeWorktree, branch, isWorktree: true } }`

Hook: `TaskRunnerService.runTask`, before `execAgent` — pass the result as
`appContext.initialTopicMetadata.{workingDirectory, workingDirectoryConfig}`.
`heteroDispatch` + `bindTopicWorkingDirectory` already honour initialTopicMetadata and pin it
onto the topic — zero changes in the dispatch path. Provisioning failure → task → `paused`
with error (precondition, not mid-run failure).

### 3. Integration — `TaskIntegrationService` + device RPC `mergeGitBranch`

New device RPC `mergeGitBranch({ path, branch, into?, worktreePath? })`:
checkout-aware merge of `branch` into `into` inside a given worktree; returns
`{ merged, sha?, conflicts?: string[], error? }`. Server wrapper next to
`deviceGateway.addGitWorktree`; device-side handler in `GitCtr` (desktop) and the
`lh connect` device daemon.

`TaskIntegrationService.integrateRun({ task, taskTopic, topic })`:

- only when `topic.workingDirectoryConfig.git` was provisioned by the runner
- integration worktree `<repo>-<base>-integration` on `baseBranch` (keeps the user's own
  checkout untouched); extend `addGitWorktree` with `createBranch?: false` for
  existing-branch checkouts
- `mergeGitBranch` result:
  - clean → record `{ state: 'integrated', sha, integratedAt }`
  - conflict → corrective continuation: `runTask({ continueTopicId, extraPrompt })` aimed
    at the integration worktree (engineer self-resolves — CAID semantics); N failed attempts →
    `paused` + brief
- persist on `task_topics.integration` jsonb column (migration):
  `{ state: 'pending'|'integrated'|'conflict'|'cleaned', branch, worktreePath, sha, attempts }`
- cleanup: `removeGitWorktree` task worktree after `integrated`; keep branch for audit

### 4. Settle gate — `taskLifecycle.onTopicComplete`

In the `reason === 'done'` branch, before the post-tick transition:
provisioned run → `integrateRun` first.

- `integrated` → proceed to normal settle; `cascadeOnCompletionMany` then fans out the next
  layer (replan = existing cascade, unchanged)
- `conflict` → hold settle: launch the corrective continuation and leave the task `running`
- integration infra error → brief + `paused`, never silently marked done

### 5. Phase C — sandbox (remote) branch contract

Device worktrees cover the `device`/`local` path; a run bound for the **cloud sandbox**
needs a remote contract instead — the clone is ephemeral, so the branch must live on the
GitHub remote for a later integrator run to land it.

- `TaskWorkspaceConfig.repo?: string` — GitHub coordinate (`owner/repo` or clone URL)
  alongside `repoPath` (now optional). A binding needs at least one of them.
- `TaskWorkspaceService.provision` picks the mode by where the run actually executes:
  `resolveExecutionTarget(...) === 'sandbox'` → remote contract; `repoPath` + device →
  worktree; otherwise unprovisioned (unchanged).
- Remote provision returns `repos: [repo]` → `initialTopicMetadata.repos` → topic
  `metadata.repos` → `heteroDispatch` → `spawnHeteroSandbox` pre-clones it into
  `/workspace/<dir>` (`repoToLocalDir` / `cloudSandboxRepoPath`, shared in
  `@orvilo/types` and now also used by `cloudHeteroContext`).
- The provision's `prompt` rides into `buildTaskPrompt`: create `task/<id>` off
  `origin/<base>`, commit + `push -u origin`, `gh pr create --base <base>`. The topic's
  `workingDirectoryConfig.git.upstream` records the published ref.
- Integration: `TaskTopicIntegration.repo` marks a remote record. On task-run completion
  the service verifies the merge on the remote (`findBranchPr` merged → else compare
  `base...head` ancestry) via the new `githubRepo` service (Market `github` cred token,
  shared with `heteroDispatch`). Not landed → a corrective **sandbox** run
  (`workspaceOverride.repos`) performs `merge --no-ff` + push (or `gh pr merge`),
  re-entering the same gate. Merged → `integrated` + `prUrl` + `pushedToRemote` on every
  row tracking the branch; exhausted attempts → `blocked`.

### 6. Non-goals (v1)

- Desktop in-process `local` runs (same provisioning via GitCtr IPC)
- Cross-repo / multi-repo tasks

## File touch list (Phase A+B)

| File                                              | Change                                                         |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `packages/types/src/task/task.ts`                 | `TaskWorkspaceConfig` type                                     |
| `packages/types/src/device.ts`                    | `provisioned`/`integration` fields on `WorkingDirGitState`     |
| `apps/server/src/services/taskWorkspace/`         | new `TaskWorkspaceService`                                     |
| `apps/server/src/services/taskIntegration/`       | new `TaskIntegrationService`                                   |
| `apps/server/src/services/taskRunner/index.ts`    | provision + `appContext.initialTopicMetadata`                  |
| `apps/server/src/services/taskLifecycle/index.ts` | integration gate in `onTopicComplete`                          |
| `apps/server/src/services/deviceGateway/index.ts` | `mergeGitBranch` wrapper; `addGitWorktree` `createBranch` flag |
| `apps/desktop/src/main/controllers/GitCtr.ts`     | device-side merge handler                                      |
| `packages/database/src/schemas/task.ts`           | `task_topics.integration` jsonb column                         |
| `packages/database/migrations/`                   | migration for the column                                       |
| tests                                             | provision/merge/lifecycle gate unit tests                      |

## Status

- [x] Plan
- [x] Phase A: binding + provisioning
  - `TaskWorkspaceConfig` in `packages/types/src/task/index.ts`; `TaskWorkspaceService`
    resolves the binding (inherited via `parentTaskId`), pins the device
    (`config.deviceId` ?? assignee `agencyConfig.boundDeviceId`), creates
    `task/<identifier>` (+`-r<N>` on retry) under `deriveWorktreePath`, and feeds the
    topic via `appContext.initialTopicMetadata`
- [x] Phase B: merge RPC + integration + settle gate
  - `mergeGitBranch` / `finalizeGitMerge` device RPCs (local-file-shell impl +
    device-control dispatch + GitCtr + deviceGateway wrapper); `addGitWorktree`
    gained `ref`/`detach`, `pushGitBranch` gained `remoteBranch`
  - `TaskIntegrationService` merges in a detached `<repo>-integration-<base>`
    worktree, pushes `HEAD:refs/heads/<base>` when a remote exists, cleans the
    task worktree; conflict → corrective `runTask` bound to the integration
    worktree (`workspaceOverride` + `integrationSeed`), capped at 3 attempts →
    `blocked`; settle gate lives in `onTopicComplete` ('done'), records persist on
    `task_topics.integration` (migration 0164)
- [x] Phase C: sandbox contract
  - `TaskWorkspaceConfig.repo` (GitHub coordinate) + `TaskTopicIntegration.repo`/`prUrl`
    mark remote records; device fields went optional (jsonb, no migration)
  - `TaskWorkspaceService.provisionOnRemote`: `repos` → topic metadata (sandbox
    pre-clone at `cloudSandboxRepoPath`), contract prompt (branch/push/PR),
    `git.upstream` on `workingDirectoryConfig`; gated by `resolveExecutionTarget`
    mirroring the server's own plan resolution
  - `apps/server/src/services/githubRepo`: `parseGithubRepo`, GitHub REST helpers
    (`getRepoDefaultBranch` / `findBranchPr` / `isBranchMergedInto`) and
    `resolveGithubAccessToken` — now shared with `heteroDispatch`
  - `TaskIntegrationService`: remote records verify the merge via the GitHub API and
    hand unfinished merges to a corrective **sandbox** run (`workspaceOverride.repos`),
    skipping all device RPCs; publish/cleanup stamps `pushedToRemote` on all rows
- [ ] Phase D: cleanup + UI surface
  - D1 (`feat/orchestrator-worktree-cleanup`, stacked on Phase C):
    `TaskIntegrationService.cleanupTaskWorktrees` removes **task-scoped** device
    worktrees for stale records (pending/merging/conflict or `worktreeCleaned`
    false) and flags them so a failed removal retries on a later pass. Wired into
    run cancel/remove, task terminal-status transitions (`canceled|completed|
failed`), the cascade update, and both task-delete paths (router + agent
    tool runtime). The shared per-(repo, base) integration worktree is never
    removed by task-scoped cleanup — deleting it could destroy another task's
    in-flight merge on the same base. Remote records skip device RPCs.
  - D2 (`feat/orchestrator-integration-ui`, stacked on Phase C):
    `TaskDetailActivity.integration` mirrors `task_topics.integration` through
    `TaskTopicModel` + `TaskService`; `RunIntegrationTag` renders the run's
    merge state chip (pending/merging/conflict/blocked/integrated/skipped) on
    `TopicCard` + `TopicChatDrawer` with a tooltip carrying branch→base,
    attempts, conflicts, lastError and the PR link. en-US + zh-CN keys.
