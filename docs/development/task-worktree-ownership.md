# Task Worktree Ownership and Safe Recovery

`TaskWorkspaceService.provisionOnDevice` creates a linked git worktree on the
bound device for every task attempt. This document defines who owns a worktree
path, when it may be reused, and what recovery is permitted when a previous
provisioning attempt left debris. It is the contract the F01/F02/F07
remediation (SA01) puts in place.

## Ownership

A path that matches the provisioning naming convention is **a hint, never
proof**. Ownership is established by two independent proofs, both required:

1. **A durable claim.** Before touching the path the server mints a row in
   `task_workspace_claims`, keyed by the physical identity
   `deviceId:repoPath::worktreePath`, carrying `taskId`, `dispatchId`,
   `generation`, a random `ownerToken`, `expectedBaseSha`, and `issuedAt`. The
   insert is `ON CONFLICT DO NOTHING` — a row held by another dispatch is a
   claim conflict: the occupant is preserved, a recovery request is queued,
   and the provision fails. Git state alone never proves ownership.

2. **A device inspection.** The on-device `inspectGitWorktreePath` RPC
   classifies the path and reports writer presence (`activeWriter`):

   | kind             | meaning                                                                                      | provisioning decision                                                                                                                                                                                                                                                           |
   | ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `listed`         | `git worktree list` knows the path; carries branch, head, lock, prune and dirty state        | reuse **only** when the persisted claim matches this dispatch AND the listed branch equals this attempt's branch AND `head == claim.expectedBaseSha` AND the tree is clean/unlocked/not-prunable AND `activeWriter` is `null`; anything else is preserved for manual resolution |
   | `absent`         | no git record and no directory                                                               | `worktree add` pinned to `expectedBaseSha`                                                                                                                                                                                                                                      |
   | `orphan-safe`    | unregistered directory that is empty, or holds only the `.git` gitfile of a crashed add      | queued for manual cleanup — **never auto-deleted**                                                                                                                                                                                                                              |
   | `orphan-foreign` | unregistered directory containing anything else, or a symlink at the path                    | queued for manual cleanup                                                                                                                                                                                                                                                       |
   | `unknown`        | the listing failed, or `stat`/`readdir` errored (EACCES, EIO, …) — only `ENOENT` is `absent` | queued for manual cleanup (`inspection_unknown`)                                                                                                                                                                                                                                |

   `activeWriter` is a three-state signal: `null` = host verified no run writes
   inside the path, an object = a live writer (`operationId`, `pid`,
   `topicId`), `undefined` = the host cannot answer (older client / no run
   registry) — treated as "cannot prove safe", never "free".

   An unanswered RPC (`undefined` result) is an explicit capability failure —
   the older host predates inspection — and blocks with an "unsupported
   capability" error, distinct from "directory absent".

## Base pinning (F07)

`resolveBase` resolves `expectedBaseSha` **before** `worktree add`: the remote
branch listing carries `%(objectname)` per ref, and an explicit or default
`origin/<base>` must resolve to a concrete SHA — a listing that answers
without one (lookup failure, older device client) blocks the provision. The
`worktree add` checks out the pinned SHA, not the mutable ref, so a fetch
racing the add cannot shift the checkout. After the add (or after a
claim-matched reuse) the worktree is re-inspected and `HEAD` must equal
`expectedBaseSha`; a drifted checkout fails the provision — the run never
records whatever HEAD happens to be as its base.

On the sandbox path (`provisionOnRemote`) `getRemoteBranchSha` resolves the
same pin before the cloud clone; a failure there also blocks.

## Orphan recovery

There is no automatic recursive delete anywhere in the provisioning path.
`clearOrphanedWorktreePath` was removed entirely: unknown or orphaned
directories produce a row in `task_workspace_recoveries` (kind +
device + path, deduplicated by key; a recurring failure re-opens the resolved
row) and the provision stops. A human resolves the queue.

Classification never follows unvalidated symlinks: `lstat` on the raw path
keeps a symlink foreign on its face, `stat`/`readdir` errors map only `ENOENT`
to `absent` — everything else is `unknown`.

## Device contract

`inspectGitWorktreePath` is registered in
`packages/device-control/src/dispatch.ts`, implemented in
`packages/local-file-shell/src/git/worktrees.ts`, mirrored for the desktop IPC
layer (`GitCtr` + `packages/electron-client-ipc/src/types/git.ts`) and typed
in `@orvilo/types` (`DeviceGitWorktreePathInspection`). Writer presence is
answered by a new `DeviceControlDeps.getActiveWorktreeWriter` hook: the
desktop gateway scans its in-memory `platformTasks` registry by entry `cwd`,
the CLI daemon scans its persisted `taskRegistry.json` — a dep-less host
simply omits the field, which the server reads as "cannot prove safe".

`listGitRemoteBranches` now emits `%(refname:short) %(objectname)` so each
remote ref carries its current `sha` — the physical pin for `expectedBaseSha`.
