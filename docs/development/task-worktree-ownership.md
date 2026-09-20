# Task Worktree Ownership and Safe Recovery (R01)

`TaskWorkspaceService.provisionOnDevice` creates a linked git worktree on the
bound device for every task attempt. This document defines who owns a worktree
path, when it may be reused, and what recovery is permitted when a previous
provisioning attempt left debris. It is the contract the F01/F02 remediation
(R01) puts in place.

## Ownership

A path that matches the provisioning naming convention is **a hint, never
proof**. Ownership of a path at `<repoDir>/<repo>-<folded branch>@<taskId8>` is
established only by the on-device inspection RPC `inspectGitWorktreePath`,
which classifies the path as:

| kind             | meaning                                                                                   | provisioning decision                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listed`         | `git worktree list` knows the path; carries branch, head, lock, prune and dirty state     | reuse **only** when the listed branch equals this attempt's branch AND the tree is clean AND unlocked AND not prunable; any other listed occupant blocks provisioning and is preserved |
| `absent`         | no git record and no directory                                                            | `worktree add`                                                                                                                                                                         |
| `orphan-safe`    | unregistered directory that is empty, or holds only the `.git` gitfile of a crashed add   | `clearOrphanedWorktreePath`, re-inspect, then add                                                                                                                                      |
| `orphan-foreign` | unregistered directory containing anything else (files, a `.git` _dir_, a non-dir entry)  | block — preserved for manual resolution                                                                                                                                                |
| `unknown`        | the git listing itself failed, or the device client does not implement the inspection RPC | block — a failed list is never treated as an empty list                                                                                                                                |

Replays of the same attempt (same task id, same seq) land on the same branch
and path and are the only case where reuse is legal. A dirty, locked, or
different-branch occupant — even under a path named exactly like ours — is
someone else's work and is never removed. `removeGitWorktree({force: true})`
is no longer called from provisioning; a human resolves blocked paths.

## Orphan recovery

`clearOrphanedWorktreePath` re-inspects the target on the device before
deleting, removes only `orphan-safe` directories via `fs.rm(recursive)`, and
re-verifies the path is gone. It refuses `listed` and `orphan-foreign` targets
and never invokes `git worktree remove`, so it can never delete a registered
worktree or user content.

When `worktree add` itself fails, the service re-inspects once instead of
blindly clearing: a leftover `task/...` branch under our convention may carry
unverifiable work, so an `already exists` branch error stops provisioning with
an explicit "resolve or rename the leftover branch manually" message rather
than looping `add -b` or deleting the branch.

## Device contract

Two new device RPCs (`inspectGitWorktreePath`, `clearOrphanedWorktreePath`)
are registered in `packages/device-control/src/dispatch.ts`, implemented in
`packages/local-file-shell/src/git/worktrees.ts`, mirrored for the desktop IPC
layer (`GitCtr` + `packages/electron-client-ipc/src/types/git.ts`) and typed in
`@orvilo/types` (`DeviceGitWorktreePathInspection`). Older device clients that
lack the methods return `undefined`, which the service treats as `unknown` —
provisioning blocks instead of falling back to the old force-remove path.
