# Core isolation cloud evidence

Date: 2026-09-30. Workspace: `/workspace/orvilo1`, Linux executor. Original candidate
base: `28dc3bbad36e4661f8d09154ff8b017cf5cadaeb`. No Mac execution was used.

## Original recovery

`git apply --check /workspace/scratch/core-original/isolation.patch` passed before
applying the original two files. Original blob identities match the delivered patch:

- `isolation.ts`: `410a671dee0267745d6a8d72200b8df931bead84`
- `isolation.test.ts`: `ae6d766344f537117f36191d2c2b654731b8254f`

Original text and the patch remain in `/workspace/scratch/core-original`.

## Actual OS capability checks

`uname -s` returned `Linux`. `/proc/self/status` reported zero effective,
permitted, bounding and ambient capabilities and `Seccomp: 2`.
`bwrap`, `unshare` and `nsenter` executables are installed, but executable presence
is not evidence that namespace isolation can run.

Commands actually attempted:

```sh
unshare --user --map-root-user --net --pid --fork true
bwrap --unshare-all --ro-bind /usr /usr --symlink usr/bin /bin --proc /proc --dev /dev /bin/true
```

Results:

```text
unshare: cannot open /proc/self/uid_map: Read-only file system
bwrap: setting up uid map: Read-only file system
```

No permissions were changed and no escalation was attempted. No confined runtime
or descendant process was launched. Thus whole-tree shutdown, filesystem exclusion,
and outbound-network denial have **not** been accepted on this executor.

The existing heterogeneous agent sandbox runner is not an interchangeable approved
supervisor: its flow supports injecting user/operation JWT and GitHub credentials.
Those mechanisms must not be reused for a kernel whose contract excludes credentials.

## Implemented validation and tests

The recovered `verifiedIsolation` accepted truthy non-boolean enforcement flags and
threw on null/undefined. It now validates unknown runtime values, requires nonempty
string identities, and requires every enforcement flag to be exactly `true`.
This validates report shape only; it cannot authenticate an untrusted report or prove
OS enforcement. Reports must come from the trusted supervisor.

Regression command:

```sh
node node_modules/vitest/vitest.mjs run --config packages/agent-execution/vitest.config.mts packages/agent-execution/src/controlPlane/isolation.test.ts --environment node
```

Before the fix: 10 failed, 6 passed. After the fix: 16 passed, exit 0, at 16:22:27 UTC.
These tests prove admission report validation and default denial, not OS isolation.

The portable default remains `unavailableProcessTreeSupervisor`: launch returns
`isolation_unavailable`, termination returns `not_quiescent`. A production supervisor
and a capable acceptance environment remain required; no process-group-only fallback
or unconfined launcher was introduced.

Repository scoped lint also passed:

```sh
PATH=/workspace/.orvilo-tools/node_modules/.bin:$PATH /workspace/.orvilo-tools/node_modules/.bin/bun run check --lint packages/agent-execution/src/controlPlane/isolation.ts packages/agent-execution/src/controlPlane/isolation.test.ts
```

The checker formatted both files; after reviewing the resulting source, the same
Vitest command again passed all 16 tests at 16:23:32 UTC, exit 0.
