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
   `deviceId:repoCommonDir::canonicalWorktreePath` — both halves proven by the
   device inspection (`git rev-parse --git-common-dir` resolved through
   realpath, and the worktree path canonicalized through its deepest existing
   ancestor), never the raw requested spellings. Every alias — symlink,
   `..`/`./` segment, case variant — of the same physical directory collapses
   onto one claim. The row carries `taskId`, `dispatchId`, `generation`, a
   random `ownerToken`, `baseBranch`, `expectedBaseSha`, and `issuedAt`. The
   insert is `ON CONFLICT DO NOTHING` — a row held by another dispatch is a
   claim conflict: the occupant is preserved, a recovery request is queued,
   and the provision fails. Git state alone never proves ownership, and an
   existing directory without a live claim is never adopted by minting one
   after the fact.

2. **A device inspection.** The on-device `inspectGitWorktreePath` RPC
   classifies the path, proves its canonical identity
   (`canonicalWorktreePath`, `repoCommonDir`, `repoRoot`), and reports writer
   presence (`activeWriter`). An inspection answer without the identity fields
   means a stale host — provisioning blocks on it rather than keying a claim
   on unproven spellings.

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

Replays never re-resolve: a live claim owned by this dispatch supplies
`expectedBaseSha`/`baseBranch` verbatim — whether the replay finds the
worktree still `listed` or must re-add to an `absent` path. Only a fresh
attempt (no own claim) resolves a new base. So when `worktree add` succeeds
but its ACK is lost and the remote ref moves A → B before the dispatch
replays, the replay still takes over base A.

On the sandbox path (`provisionOnRemote`) `getRemoteBranchSha` resolves the
same pin before the cloud clone; a failure there also blocks.

## Cleanup contract

`discardUnregistered` operates on the immutable claim carried by the
`ProvisionedWorkspace` — its `key`, the `ownerToken` minted with THAT
provision, and the dispatch/generation triple — never the row's current
token, which a newer dispatch may already own. Cleanup first re-reads the
claim row: a different `ownerToken` means the path was reclaimed, and the
stale cleanup leaves it alone entirely (no remove, no release). Then it
requires `activeWriter === null` from a fresh inspection — an `undefined`
answer blocks the cleanup. The remove RPC itself carries `claimToken`: the
host must verify writer absence before deleting and reports that fact back
as `claimTokenVerified: true` on the result. A removal that answers success
without verification (a stale host silently ignoring the token) does NOT
release the claim — it stays live so a later retry against an upgraded host
completes the proof. Only a verified removal (or an already-absent path)
releases the claim, and release is fenced on the original token.

## Rollback

Reverting this change stops new claim/recovery writes; existing rows and
in-flight writers stay — reads, reconciliation and cancellation keep working
against the claim rows. Both migrations are additive (`0178` creates the
tables, `0180` adds `repo_common_dir`/`base_branch`); drop
`task_workspace_claims` and `task_workspace_recoveries` only if the rollback
must be schema-clean. Rolling the server back without the host leaves old
clients unable to prove identity — they fail closed on the unsupported
capability check instead of keying claims on unproven spellings.

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
the CLI daemon scans its persisted `taskRegistry.json` — both compare the
canonical form of each path (`canonicalizePath`), so a run registered under a
symlinked or aliased cwd still owns the same physical directory. A dep-less
host simply omits the field, which the server reads as "cannot prove safe".

`removeGitWorktree` accepts an optional `claimToken`; when present the host
must prove no live writer owns the path before removing and reports
`claimTokenVerified: true` on the result — a claimToken remove on a
registry-less host refuses rather than treating "no registry" as "no
writer". A request without the token keeps the legacy behavior for callers
outside the claim lifecycle.

`listGitRemoteBranches` now emits `%(refname:short) %(objectname)` so each
remote ref carries its current `sha` — the physical pin for `expectedBaseSha`.
