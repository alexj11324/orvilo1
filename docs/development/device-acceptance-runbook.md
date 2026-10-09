# Device acceptance runbook — remote Prime execution

How to bring up a **second, independent device** running the Prime harness for
the ≥2-device acceptance matrix, plus the Docker container recipe. Companion
to `device-execution-contract.md` — everything here is the landed behavior on
`feat/prime-device-execution` (PR #429).

## What a "Device" is here

A device = a stable `deviceId` + a live WebSocket channel into the device
gateway + a registered row in the server device registry. The connect daemon
(`orvilo connect`) is the device-side host: it owns the serialized
`agent_run_request` lifecycle and, for `type:'orvilo'` runs, launches the
shipped Prime runner artifact via `@orvilo/device-prime-host`
(`admitPrimeDeviceRun` in `apps/cli/src/device/primeRun.ts`).

Nothing binds device identity to host hardware: `deviceId` is derived from
`sha256(machineId | userId | salt)` (`packages/device-identity`), and an
explicit `--device-id` always wins — pin one per container/VM.

## Artifacts to ship

The bundled CLI is self-contained — no `node_modules` at runtime (tsdown makes
any unbundled import a build failure):

```bash
cd apps/cli
bun run build # tsdown + stagePrimeRunner
# → dist/index.js              (executable bundle, #!/usr/bin/env node)
# → dist/runner.mjs            (Prime harness artifact)
# → dist/runner.manifest.json  (artifact identity: bytes/sha256/upstream pin)
```

Copy all three to the device in the same directory layout —
`resolvePrimeRunnerArtifact` probes `<bundle-dir>/runner.mjs` first;
`ORVILO_PRIME_RUNNER=/abs/path/runner.mjs` overrides when they differ.
Runtime: Node.js ≥22.15 (`engines`; needs `node:zlib` zstd). No bun needed on
the device — `node index.js` runs everything.

## Enrolling the current Desktop in a workspace

Desktop sign-in connects and registers the machine in the user's personal device
pool. That alone does not enroll it in a workspace. In Orvilo Desktop:

1. Open the target workspace's **Settings → Devices**.
2. Choose **Private** for your own use, or **Workspace** to make the device
   available to workspace members.
3. Choose **Connect Device → Via Desktop → Connect this computer**.
4. Verify that the selected pool shows the real hostname, **Current device**,
   and an online Desktop channel. Confirm an overwrite only if the displayed
   visibility change is intended.

The overwrite confirmation names the target workspace and shows its current and
requested visibility. Canceling preserves the existing enrollment.

The wizard uses the existing personal registration and workspace sharing API.
Workspace enrollment has its own device ID; do not copy a personal ID into a
workspace agent binding. A connection or enrollment failure remains visible in
the wizard. The CLI enrollment method remains available for headless devices.

## Enrolling device B

### Auth

Two non-interactive options (containers can't do the browser device-code flow):

```bash
# A) API key — persists to the CLI home (~/.orvilo, or $ORVILO_CLI_HOME)
export ORVILO_CLI_API_KEY=<key>
node index.js login                    # validates key, saves serverUrl
# B) JWT per-process — nothing persisted
export ORVILO_JWT=<user-jwt>
```

Self-hosted backend: `node index.js login --server https://<host>` stores the
URL; `connect` then needs `--gateway <url>` too (custom serverUrl implies no
default gateway). Production defaults resolve automatically —
`https://orvilo.aspectlylabs.com` + `https://device-gateway.aspectlylabs.com`.

### Connect daemon

```bash
# Personal pool (device visible only to the enrolling user):
ORVILO_JWT= index.js < jwt > node connect --device-id < stable-id > --daemon
#   — OR after login, the stored credential is used:
node index.js connect --device-id < stable-id > --daemon

# Workspace pool (admin; all workspace members can dispatch):
ORVILO_JWT= index.js < admin-jwt > node connect \
  --workspace < workspaceId > --device-id < stable-id > --daemon
# add --public to enroll into the shared pool visible to every member
```

Flags that matter:

- `--device-id <id>` — always pass one in acceptance runs: deterministic
  identity, immune to the container/machine-id caveat below.
- `--gateway <url>` — override gateway (staging/custom deployments).
- `-d/--daemon` backgrounds it; `node index.js connect status|logs|stop`
  manage it. `connect service install` registers the systemd user unit on
  Linux hosts (device survives logout).

On start the daemon prints `Device ID / Hostname / Platform / Gateway / Mode`
and registers the row via `device.register` (personal) or
`device.registerWorkspaceDevice` (workspace). The WS then authenticates with
the login JWT (personal) or a minted workspace connect token carrying the
`workspace_id` claim (workspace).

### Verify it enrolled

```bash
node index.js device list    # DB-registered ∪ live gateway presence
node index.js connect status # local daemon state + gateway URL
```

The device appears in `device.listDevices` with `online: true` once the WS is
up; `listDevices` `online` = "has ≥1 live channel", so a running daemon is the
signal. In the product, the device picker surfaces `selectableDevices`
(scope+capability+version) and `runnableDevices` (+online) — see
`packages/types/src/agent/deviceExecution.ts`.

## What acceptance looks like

Control side initiates a run on the chosen device (task dispatch or chat with
the device selected). Server → `agent_run_request` on the WS, carrying the
`prime` descriptor: `{artifact:{sha256,bytes,commit,version,license},
broker:{credential}, lease:{ttlMs}, model:{id,maxOutputTokens},
subject:{task:{taskId,dispatchId}|conversation:{topicId}}}`.

Device side, observable evidence:

- `admitPrimeDeviceRun` → artifact digest+bytes re-verified against the
  descriptor, provenance pinned to `PRIME_EMBEDDED_PIN`;
- real spawn `node runner.mjs --operation-id <op>` with `cwd=<device workdir>`,
  `HOME=<stateDir>`, `TMPDIR=<stateDir>`;
- `harness.init` ack re-verifies pin+protocol; activation POSTs to
  `${serverUrl}/api/agent/prime-broker/activate` with
  `{artifact identity, runtime{supervisorId:'orvilo-device-prime-host',
treeId:'device-pg-<pid>'}, sessionId}`;
- inference streams through `broker.infer` →
  `${serverUrl}/api/agent/prime-broker/infer` (Bearer = bound op credential,
  `prime:infer` capability, `device_id` claim must match);
- runner writes session state inside the device state dir —
  `~/.orvilo/prime-state/<operationId>/.prime/agent/...` for the connect-daemon
  path (`primeExec` uses `$HOME/.orvilo/prime-state/<op>`);
- cancel: `agent_run_cancel`/op teardown → `session.abort` + process-group
  kill; daemon `heartbeat_ack` renews the bounded lease — a dead gateway link
  lapses side-effects on schedule (`lease.ttlMs`, 10s check tick).

Dispatch evidence to collect: operation ack (`accepted`/`rejected` with
reason), activation record (device pid/treeId prove the process env), files
created on the device, broker `/infer` request log (modelRoute + sessionId),
and cancel records in the operation trace.

## Manual pre-flight (no server dispatch)

```bash
ORVILO_JWT= \
  echo < any-nonempty > ORVILO_PRIME_RUNNER=/abs/runner.mjs \
  '{"descriptor":{...},"prompt":"say hi"}' | node index.js prime exec \
  --operation-id smoke-1 --topic t
```

Validates artifact resolution, digest verify, spawn, `harness.init`, and the
broker bridge before the dispatch path is exercised. (Ingest to the server
needs a real operation JWT; the launch path itself does not.)

## Docker as device B — feasibility call

**Yes — a container qualifies.** "Independent device process environment" is
about the _process environment_, not the hypervisor: separate PID/fs/net
namespace, own Node runtime, own CLI install, own `deviceId`, own state dir.
There is no TPM/hardware binding anywhere in the design — `deviceId` is a
deterministic hash or an explicit flag; artifact digest, lease, and operation
identity are all logical, not hardware. A container is strictly more isolated
than two processes on one host (no shared filesystem or socket bleed), so it
satisfies the "not a same-process mock" bar.

One caveat: `node-machine-id` reads `/etc/machine-id`, which container images
may share or lack — always pass explicit `--device-id` in containers.

Minimal Dockerfile:

```dockerfile
FROM node:22-bookworm-slim
WORKDIR /opt/orvilo
# Ship the three bundled artifacts; keep the layout (sibling probe).
COPY dist/index.js dist/runner.mjs dist/runner.manifest.json ./
# Fixed identity per container instance; JWT injected at run time.
ENV ORVILO_CLI_HOME=/data
ENTRYPOINT ["node", "index.js"]
```

```bash
docker build -t orvilo-device .
docker run -d --name device-b \
  -e ORVILO_JWT= device-b-data:/data \
  orvilo-device connect --device-id device-b-docker --daemon < user-jwt > -v

docker logs device-b      # connect daemon prints "Device ID: device-b-docker"
node index.js device list # from the control side — device-b-docker online
```

For a second device: `--name device-c -e ORVILO_JWT=... connect --device-id
device-c-docker` — distinct deviceId + isolated fs/volume = a genuinely
independent environment. Workspace enrollment works the same way (the admin
JWT mints the connect token at startup).

## Runtime truth semantics (post-acceptance fixes)

The device package's terminal-state contract — what acceptance re-verifies:

- **Session continuity** — `resumeSessionId` reuses a live same-device
  session (`run.reactivate` with the fresh broker credential, which also
  rotates the broker-bridge credential every later `/infer` carries); a dead
  session is an explicit rebuild (fresh runner +
  `resumeFallbackSystemContext`, the ingest finish carries
  `resumeSessionInvalidated: true`). A resumed turn that settles `error`
  invalidates the pointer the same way and closes the local session — the
  next turn rebuilds instead of trapping the topic on a broken session.
  An op whose runner stream closes mid-turn settles `cancelled` with an
  honest abort reason ("device lease lapsed — prime run stopped" vs
  "prime runner terminated") — never `done`, never a `running` zombie.
- **Binding-invalid contract** — `resolveDeviceDispatchAuthorizationFailure`
  re-checks the registry in BOTH scopes: a workspace dispatch whose device
  row vanished, or a personal-scope conversation dispatch whose device left
  the user's own registry, gets `DEVICE_BINDING_INVALID` + `repairCandidates`
  (other selectable devices in the SAME scope, cap 8). `DEVICE_NOT_FOUND` is
  reserved for transports that could not address a device at all.
- **Admission liveness** — `isDeviceAdmissionLive` treats `pending` as live:
  the ledger writes `pending` BEFORE the gateway call returns, so under
  await-ack semantics the device's `/activate` legitimately races the ack.
  The bound credential only exists inside the delivered request, so a pending
  admission plus a valid op JWT already proves device delivery.
- **Reject→settle reconcile** — `sweepDevicePrimeRunReconcile` runs in the
  task watchdog and covers what enqueue-ack swallows: a `prime` admission
  (`remoteAdmission.harness`) still `pending`/`acknowledged` past
  `activateDeadlineMs` (default 120s) settles `error` with
  `DEVICE_PRIME_NO_ACTIVATION` + ledger `unknown`; an activated conversation
  run whose producer went stale (`updatedAt` past the 5-min stale bound)
  settles `interrupted`. Task-subject runs stay with
  `sweepTaskDispatchRecovery`'s richer convergence.
- **Invalid binding** — `resolveDeviceDispatchAuthorizationFailure` emits the
  contract code `DEVICE_BINDING_INVALID` plus `repairCandidates` (other
  workspace devices, cap 8), so callers can render the explicit-repair path
  instead of a bare "not found".
- **Runner resolution** — `defaultRunnerArtifact` resolves through an
  env-override + `import.meta.dirname`-guarded + cwd-candidate chain (and
  `defaultRunnerManifest` derives through it), while
  `resolvePrimeRunnerArtifact` (CLI) and `embeddedAcceptance`'s REPO_ROOT
  carry the same fallback — so bundlers that don't define
  `import.meta.dirname` (e.g. turbopack dev) still resolve the shipped
  runner.

## Known residuals

- Real cross-machine acceptance still wants one physical second host; the
  container path proves process-env independence but shares the host kernel.
- The broker (`/api/agent/prime-broker`) must be reachable from the device —
  staging deployments need `ORVILO_SERVER_URL`/`--gateway` aligned.
- `prime exec` stdout is reserved for the ingest stream; diagnostics go to
  stderr/log (`connect logs`).
- Prime runner tools are pinned `noTools: 'all'` pending the owner's §7
  capability work — a shipped gap, tracked outside this package.
- Hetero (non-prime) device-exec conversation runs share the same latent
  zombie risk the reconcile sweep closes for prime; the sweep keys on
  `harness === 'prime'` deliberately — widening it needs the hetero settle
  funnel's own audit.

Desktop enrollment waits for the native gateway to reach authenticated `connected` readiness before looking up or sharing the personal registration. Closing or reopening the wizard clears the previous session's error. Native popup hosts expose the same connect action through their window capability; browser popups retain download instructions.
