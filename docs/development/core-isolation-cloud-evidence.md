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
or descendant process was launched. This blocked direct user-namespace execution; it did not rule out Docker-daemon-managed isolation. The Docker acceptance below supersedes the initial broader limitation.

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
`isolation_unavailable`, termination returns `not_quiescent`. The default remains fail closed unless a trusted supervisor is explicitly configured. A Docker-backed implementation was subsequently added and exercised as recorded below; no process-group-only fallback or unconfined kernel launcher was introduced.

Repository scoped lint also passed:

```sh
PATH=/workspace/.orvilo-tools/node_modules/.bin:$PATH /workspace/.orvilo-tools/node_modules/.bin/bun run check --lint packages/agent-execution/src/controlPlane/isolation.ts packages/agent-execution/src/controlPlane/isolation.test.ts
```

The checker formatted both files; after reviewing the resulting source, the same
Vitest command again passed all 16 tests at 16:23:32 UTC, exit 0.

## Docker daemon acceptance (subsequent discovery)

The Docker daemon is available even though direct namespace creation is blocked.
An inert container with `--network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 16 --memory 64m` ran successfully.

`DockerProcessTreeSupervisor` now creates only new, labelled containers from an
immutable image ID, with user 65534, network none, read-only root and workspace,
all capabilities dropped, no-new-privileges, PID/memory limits, and a bounded
noexec temporary filesystem. Runtime arguments are argv entries, not host shell
code. `/usr/bin/env -i` constructs the exact approved runtime environment.
Image-declared writable volumes are rejected. Docker clients carry no inherited
credential environment; no socket, host home or control-plane checkout is mounted.
The trusted host must supply a dedicated credential-free workspace and approved
credential-free image; the supervisor cannot infer that arbitrary workspace contents
are safe.

The supervisor returns only its owned live container streams. Termination uses
Docker SIGKILL and wait, rechecks stopped state and PID zero, then requires the
trusted broker's action-drain callback to report zero before proving quiescence.
Ownership labels permit termination recovery with a stable supervisor ID; in-memory
transport reattachment after host restart is not provided.

Actual integration tests passed 3/3 at 16:45:10 UTC. They exercised read-only root
and workspace, hidden host files/socket, missing credential variables, non-root UID,
only loopback network interface, daemon configuration, an actual sleep descendant,
whole-container termination, stopped/PID-zero inspection, environment/workspace
rejection, foreign-container rejection and nonzero action-drain denial. Broker drain
is a controlled test boundary; production action admission must supply the callback.

Command:

```sh
node node_modules/vitest/vitest.mjs run --config packages/agent-execution/vitest.config.mts packages/agent-execution/src/controlPlane/dockerSupervisor.test.ts --environment node
```

Fixture image: Alpine 3.22 from `public.ecr.aws/docker/library/alpine:3.22`, resolved
and used solely by immutable image ID
`sha256:c83674e1999044d33d751661371b873539f47e5b5c5ca3320c7e0377acca6238`.
Docker Hub pull hit an unauthenticated rate limit; ECR succeeded. The tests validate
this fixture and supervisor, not the pinned Prime artifact or provider integration.
No pre-existing containers were stopped or modified.

The pinned Prime runtime required more than the default 256 MiB. The supervisor
now accepts a **trusted host-only** `memoryMiB` budget, default 256, restricted to
safe integers from 64 through 4096. Memory and memory-plus-swap ceilings are equal.
The child cannot set this option. Actual Docker tests passed 11/11 at 16:49:20 UTC,
including invalid limits and daemon inspection confirming an explicit 1024 MiB cap.

The actual Prime handshake exposed a graceful-exit race: closing ACP could stop
PID 1 between Docker inspection and SIGKILL. A failed kill is now reconciled only
when a fresh owned-container inspection proves exited state, PID zero and not
running. The normal stopped inspection and broker drain still run. Actual
Docker tests passed 12/12 at 16:50:11 UTC including closing stdin during shutdown.
