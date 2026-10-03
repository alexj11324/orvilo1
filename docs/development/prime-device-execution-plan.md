# Prime device execution — implementation plan (work package B)

Contract landed: `docs/development/device-execution-contract.md` +
`packages/types/src/agent/deviceExecution.ts` (RunSubject, adapter map,
selectable/runnable predicates, DEVICE\_\* codes, priority chain) — all on
`feat/prime-cutover-data-ui` @ `294170729`. This doc supersedes the earlier
survey draft; it is the plan reported to the integration lead before the
launcher swap is written.

## Today's seams (surveyed, post-contract head)

- `heteroDispatch` is already device-first: `heteroPlan.kind !== 'sandbox'` →
  `deviceGateway.dispatchAgentRun` for **all** types incl. `orvilo`. The
  embedded fork only fires on non-device plans (`resolveEmbeddedDispatchRoute`).
- **The transitional embedded fence** = device-side refusal: `orvilo` is
  unspawnable on devices today — `apps/cli/src/commands/hetero.ts` refuses
  `--type orvilo`, `HeterogeneousAgentImpl.startSession` throws
  "Prime adapter is not packaged for device execution yet", `BinaryCtr`
  reports no CLI binary. Orvilo runs stay embedded because no device can
  admit them. The flip commit deletes these refusals + pins a flip test.
- `agent_run_request` (`packages/device-gateway-client/src/types.ts`) is
  CLI-shaped: `agentType` + `args` + `prompt`/`cwd`/`env`/`jwt` +
  `operationId`/`runGeneration`/`idempotencyKey`/`workspaceId`/`ingestWorkspaceId`.
  It carries no Prime descriptor (model route, broker access, subject,
  artifact expectation).
- `HarnessTransport`/`HarnessChannel` (`packages/agent-execution/src/controlPlane/harnessTransport.ts`)
  is stream-agnostic — reusable over a spawned child's stdio on any device.
  Wire vocab (`harnessProtocol.ts`): host→runner `harness.init`/`session.prompt`/
  `session.abort`; runner→host `broker.infer`/`broker.cancel`; notifications
  `harness.event`/`broker.event`.
- `PrimeEmbeddedRuntime` is already host-parameterized (artifact / executable /
  home / temp / runtimeWorkspace / supervisor / connect / authorize /
  verifyArtifact / initModel). The hardcoding lives in `embeddedDispatch.ts`'s
  env composition (`/usr/local/bin/node`, repo-relative `runner.mjs`, server
  tmpdir, `ORVILO_PRIME_EMBEDDED_IMAGE_ID`), not the runtime.
- Inference bridge (`embeddedBroker.ts` + `createInferenceBroker` +
  `SqlTrustedProviderBackend` + `CanonicalRunAuthority`) is fully in-process
  today — a device runner's `broker.infer` has no remote endpoint.
- `agentRun.ts` lifecycle = the reuse skeleton: per-operation admission Map,
  dedupe registry (same-op redelivery acks), generation supersede →
  confirmed-kill (SIGINT → SIGKILL → `waitForProcessGroupExit`), foreign-pid
  cmdline check. Only the launcher swaps.
- Prime runner (`packages/prime-harness/src/runner.ts`) is single-session
  in-memory and hardcodes `agentDir: '/tmp/agent'` — needs a device-supplied
  state dir (contract: "the device host supplies executable path, state dir,
  workdir").
- `ResolvedRunIdentity` is doc-only — no TS type exists; the request fields
  carry the same data (operationId, agentId, deviceId, harnessId, modelRoute,
  executionGeneration, subject) rather than minting a competing shared type.
- `RunSubject` type IS landed; canonical bindings carrying `subject` are on
  `feat/prime-cutover-chat` @ `0f9982944` (not on this base yet) — leases/
  auth key on `subject.taskId`, never a synthesized id; `taskId` is null for
  chat subjects.

## Plan

### Server side

1. **Wire descriptor** (`device-gateway-client/types.ts`): extend
   `AgentRunRequestMessage` with optional `prime` —
   `{ model: { id, maxOutputTokens }, artifact: { commit, version, sha256,
bytes }, broker: { endpoint, credential, expiresAt }, subject: RunSubject,
deviceLease: { ttlMs } }`. `agentType` stays `'orvilo'`; the device picks
   the adapter via `resolveHarnessAdapter(agentType)` → `'prime'`. Optional
   for wire-compat: old devices ignore it and refuse `orvilo` as today.
2. **Admission** (`heteroDispatch` device branch): when the plan resolves
   device + `heteroType === 'orvilo'`, compose the Prime descriptor before
   `dispatchAgentRun` — resolve provider binding + `issueBindingExecution`
   (same chain as `embeddedBroker`), mint a short-lived credential bound to
   `{subject, operationId, deviceId, modelRoute, exp}`, embed the trusted
   artifact manifest pin (server reads its own packaged `runner.manifest.json`
   / build-time constant — never a repo-relative runtime path).
   `subject = {kind:'task', taskId, dispatchId}` for task runs,
   `{kind:'conversation', topicId}` for chat.
3. **Remote broker endpoint** (new, `apps/server`): bounded route the
   device-side bridge calls to answer the runner's `broker.infer` /
   `broker.cancel` — credential check (subject+operation+device+expiry), then
   the same authority chain as the embedded bridge (`withRun` canonical locks
   → `issueBindingExecution` → `createInferenceBroker.infer`), streaming
   `InferenceEvent`s back. No raw keys ever cross — vault-side resolution
   stays server-side. (Coordination point with the lead — see gaps.)

### Device side — new `packages/device-prime-host/`

Shared by `apps/cli` (`connect` daemon) and `apps/desktop` (gateway path);
deps: `@orvilo/agent-execution` + `@orvilo/device-gateway-client` +
`@orvilo/types`.

4. **`primeDeviceHost.launch`**: locate the _shipped_ `runner.mjs` +
   `runner.manifest.json` in the app's resource dir → verify digest via
   `embeddedArtifactVerifier(manifest)` → spawn under a device-local
   supervisor with device-supplied `executable`/`home`/`temp`/`workdir` →
   attach `HarnessTransport` over stdio → `harness.init`
   `{protocolVersion, pin, model, workspace, stateDir}` → expose
   `{session, prompt(), abort(), events}` to the lifecycle caller.
5. **Broker bridge**: reverse-handler for `broker.infer`/`broker.cancel` —
   POST to the broker endpoint with the bound credential, stream
   `InferenceEvent`s back into `broker.event`; deny once the device lease
   lapses. No API keys on device.
6. **Bounded lease**: renewed over the existing gateway channel; lapsed
   renewal → `session.abort` + deny further `broker.infer` + kill the tree
   (the defined policy stops new side-effects — never uncontrolled running).
7. **Isolation, honest**: Docker supervisor is ONE implementation a device
   may offer (`DockerProcessTreeSupervisor` + pinned image, reusing
   `isolation.ts` evidence + `verifiedIsolation`). A device without docker
   reports `isolation: 'none'` — no bare spawn presented as isolated; server
   admission policy decides whether none-isolation is admissible (gap below).
8. **`agentRun.ts` launcher swap** (`spawnHeteroAgentRun`): when
   `resolveHarnessAdapter(agentType) === 'prime'` → the new host path
   instead of `orvilo hetero exec`. Admission map, dedupe, generation
   supersede, kill-confirm, `ORVILO_*` env / ingest sink all unchanged.
   `harness.event` → mapped `AgentStreamEvent`s → existing heteroIngest;
   `heteroFinish` stays the sole settle path. No parallel gateway/cancel
   registry.
9. **Desktop path**: `HeterogeneousAgentImpl` 'orvilo' refusal → the same
   host (Electron `ELECTRON_RUN_AS_NODE` executable for the runner spawn,
   same pattern as existing child spawns).
10. **Artifact shipping**: `packages/prime-harness` `dist/runner.mjs` +
    `runner.manifest.json` bundled in the CLI build and Desktop resources
    (asar-unpacked/extraResources); device loads the manifest from the
    install dir — no dev-repo relative paths.
11. **Capability report**: device reports
    `prime: { version, digest, protocolVersion, isolation }` verified locally
    at startup (in system-info/hello) and re-verified per launch via
    `verifyArtifact` — a heartbeat alone never proves runner availability.
12. **Runner state-dir fix**: `agentDir` comes from `harness.init` (additive
    `stateDir` field on `HarnessInitParams`, default keeping `/tmp/agent`
    behavior absent the field) — container paths stay out of device
    conventions.

### The flip commit (after ≥2-device acceptance passes)

13. Delete the refusal fence: `hetero.ts` `--type orvilo` guard,
    `HeterogeneousAgentImpl` throw, `BinaryCtr` "no CLI binary" for orvilo →
    adapter-aware paths; pin a flip test proving an orvilo device plan takes
    the Prime-adapter path and no device-resolved run reaches the embedded
    fork.

### Acceptance (owner bar)

- ≥2 independent device **process environments** (e.g. a second `orvilo
connect` daemon in a Linux container + this machine's daemon — separate
  processes, separate deviceIds, real files created on the chosen device);
  control initiates, verify device identity / artifact digest / operation /
  cancel records. No same-process mock.

## Gaps / questions for the lead

- **Remote broker endpoint + credential minting** — new server surface;
  proposing the authority chain above (canonical locks + binding issuance,
  credential bound to subject+operation+device+TTL). If you're minting a
  device-capability credential for another package, I'll consume yours
  instead — flag before I write the endpoint.
- **Non-docker isolation policy** — contract requires honest isolation
  evidence but doesn't say whether a `none`-isolation device may admit a
  run. Proposal: fail closed in v1 (device reports capability absent; run
  blocked with a clear reason) until policy says otherwise.
- **`stateDir` protocol field** — additive on `harness.init` (protocolVersion
  stays 1); old runners ignore it → `/tmp/agent` fallback kept server-side.
- **`agent_run_request.prime` descriptor shape** — drafted above; names
  follow the contract vocabulary (`modelRoute`, `subject`, `deviceLease`).
- **Chat subject path** — `agent_run_request.subject` uses the landed
  `RunSubject`; canonical-side subject lands with `feat/prime-cutover-chat`.
  Leases/auth key on `subject.taskId` for task runs only — never a
  synthesized taskId on conversation subjects.

## Landed implementation (this branch)

- **`agent_run_request.prime`** — `PrimeRunDescriptor` on
  `packages/device-gateway-client/src/types.ts` + `http.ts`: artifact pin
  (commit/version/license/sha256/bytes), bound broker credential, lease TTL,
  model route, `RunSubject`. Server mints it in
  `services/controlPlane/devicePrimeDispatch.ts`: resolves + issues the
  provider binding, reads the runner manifest, registers the canonical run
  under owner `orvilo-device:<deviceId>` (task subjects,
  `deviceRunBinding.ts`), signs an op JWT with `prime:infer` capability +
  `device_id`/`model_route` claims (`internalJwt.ts`). A run with no
  workspace scope fails closed before dispatch.
- **Remote broker surface** — `router-hono/agent/handlers/primeBroker.ts`
  mounted under `primeOperationAuth()` (Bearer → `prime:infer` + `device_id`
  - `model_route`): `/activate`, `/infer`, `/cancel`. Task subjects resolve
    through the canonical binding and the `TaskExecutionControlModel` lease;
    conversation subjects through the op's live `agent_run_request` admission
    (narrower fence, bounded by op liveness + credential TTL — flagged in the
    file header). Inference streams NDJSON `{event,requestId}` lines through
    `SqlTrustedProviderBackend` + `createInferenceBroker`.
- **Device host** — new `packages/device-prime-host/` (light closure: utils +
  device-gateway-client + link'd agent-execution). `openPrimeDeviceRun`
  verifies the shipped `runner.mjs` digest + manifest + `PRIME_EMBEDDED_PIN`,
  spawns `<executable> runner.mjs --operation-id <op>` detached, opens
  `HarnessTransport` over stdio, sends `harness.init` with device-supplied
  `stateDir` + `workspace`, pins the ack, POSTs `/activate`, and answers
  `broker.infer`/`broker.cancel` via `createBrokerReverseHandler` (NDJSON
  pump → `broker.event` notifications). Bounded lease: `renewLease` on
  heartbeat_ack; lapse kills the process group — no new side-effects.
  Isolation is honest: `treeId=device-pg-<pgid>` — a bare spawn claims no
  container isolation.
- **Launcher swap** — `agentRun.ts` keeps admission/dedupe/kill lifecycle;
  `prime` descriptor presence routes to `admitPrimeDeviceRun`
  (`device/primeRun.ts`), which resolves `runner.mjs` from the packaged
  sibling (`import.meta.dirname`, dist or Resources/bin), an
  `ORVILO_PRIME_RUNNER` override, or the dev-repo path. Non-prime adapter
  types with a descriptor are rejected.
- **Shipping artifacts** — `apps/cli` build stages `runner.mjs` +
  `runner.manifest.json` next to `dist/index.js` (`stagePrimeRunner.ts`,
  building the harness/vendored prime when absent); electron-builder copies
  both into `resources/bin` for the packaged CLI. `orvilo prime exec` is the
  one-shot device entry (`--input-json` carries descriptor+prompt); Desktop
  `HeterogeneousAgentImpl` spawns it for prime runs, `GatewayConnectionCtr`
  forwards `request.prime`.
- **Runner** — `agentDir` honors `harness.init.stateDir` instead of the
  hardcoded `/tmp/agent` (old runners keep the default when the field is
  absent; protocolVersion unchanged).
- **Ingest** — `TrpcIngestSink`/`aiAgent` ingest schemas accept
  `agentType:'orvilo'`; runs authenticate with `ORVILO_OPERATION_JWT`.
- **Fence flip** — `orviloDeviceFencedToEmbedded` deleted
  (`heteroErrors.ts`, the `heteroDispatch` device-branch gate, and the
  flip-pin describe in `execAgent.device.test.ts`); a device-resolved orvilo
  plan composes the descriptor and dispatches through the gateway like every
  other adapter. Interactive desktop `startSession`/`hetero exec` refusals
  stay — prime runs use `prime exec` / the connect-daemon path, not ACP.
- **Pin provenance** — `PRIME_EMBEDDED_PIN` moved to
  `primeEmbeddedArtifact.ts` (re-exported from `primeEmbeddedRuntime`) so
  device hosts pin the same upstream identity without the supervisor stack;
  `controlPlane/contracts` + `controlPlane/primeEmbeddedArtifact` added to
  the package exports map.

### Verification status

`bun run check` clean (37 files, 329 tests); scoped `tsc` clean on
apps/server diffs, apps/cli diffs, apps/desktop, device-prime-host,
device-gateway-client. The ≥2 independent device **process environments**
acceptance still needs a second real device — local evidence can cover two
independent processes but not a second machine; flagged for the lead.
