# Prime device execution — implementation plan (work package B)

Status: **blocked on the shared contract** — `docs/development/device-execution-contract.md`
and the contract types (`selectableDevices` / `runnableDevices`, resolution priority chain,
`DEVICE_REQUIRED` / `DEVICE_SELECTION_REQUIRED` / `DEVICE_BINDING_INVALID`,
`ResolvedRunIdentity`) are not yet on `feat/prime-cutover-data-ui` (PR #421 lands the
engine-retirement cutover only). This doc records the surveyed surfaces and the plan keyed
to the owner rules; code follows once the contract lands.

## Today's topology (surveyed)

- `resolveExecutionPlan` (`src/helpers/executionTarget.ts`) → `ExecutionPlan`
  `{ kind: 'sandbox' | 'device' | 'device-unrouted' | 'none' }` — the pre-contract resolver.
- `heteroDispatch.execAgent` (`apps/server/src/services/aiAgent/pipeline/heteroDispatch.ts`):
  the device branch is gated `heteroPlan.kind !== 'sandbox' && heteroType !== 'orvilo'` —
  `type:'orvilo'` can never reach `deviceGateway.dispatchAgentRun`. Orvilo task dispatches
  go to `resolveEmbeddedDispatchRoute` → `openEmbeddedDispatchHost` +
  `driveEmbeddedCanonicalRun` (in-process `CanonicalCoreRuntimeHost` +
  `PrimeEmbeddedRuntime` + `DockerProcessTreeSupervisor`). Chat runs fail loudly
  `EMBEDDED_CHAT_NOT_ADMITTED`.
- `embeddedDispatch.ts` hardcodes the machine-local assumptions the contract retires:
  `DEFAULT_EXECUTABLE = '/usr/local/bin/node'`, repo-relative
  `packages/prime-harness/dist/runner.mjs`, server `tmpdir` run dirs, and the docker image
  id from `ORVILO_PRIME_EMBEDDED_IMAGE_ID`. `PrimeEmbeddedRuntime` itself is already
  host-parameterized (artifact / executable / home / temp / runtimeWorkspace / supervisor /
  connect / authorize / verifyArtifact / initModel) — the hardcoding lives in this env
  composition, not the runtime.
- Prime wire protocol (`packages/agent-execution/src/controlPlane/harnessProtocol.ts`):
  host→runner `harness.init` / `session.prompt` / `session.abort`; runner→host
  `broker.infer` / `broker.cancel`; notifications `harness.event` / `broker.event`.
  `HarnessTransport` / `HarnessChannel` is stream-agnostic — reusable over a spawned
  child's stdio on any device.
- Device side today (external agents only): `agent_run_request`
  (`packages/device-gateway-client/src/types.ts`) → CLI `connect.ts` →
  `spawnHeteroAgentRun` (`apps/cli/src/device/agentRun.ts`) spawning
  `orvilo hetero exec --type X`, or Desktop `gatewayConnectionSrv` → `GatewayConnectionCtr`
  → `HeterogeneousAgentImpl.spawnOrviloHeteroExec`. Neither app depends on
  `@orvilo/agent-execution` or `@orvilo/prime-harness`; nothing device-side knows the
  NDJSON harness protocol.
- `agentRun.ts` lifecycle = the reuse skeleton: per-operation serialized admission,
  dedupe registry (same-op redelivery acks), generation supersede → confirmed-kill
  (SIGINT → SIGKILL → `waitForProcessGroupExit`), foreign-pid cmdline check. The launcher
  is the only replaceable seam.
- `DockerProcessTreeSupervisor` produces the `IsolationEvidence` the runtime's
  `verifiedIsolation` gate requires — one isolation implementation a device can offer;
  a bare spawn produces no evidence and the runtime fails closed, which is the desired
  posture (isolation stays real).
- Prime runner (`packages/prime-harness/src/runner.ts`) is a single-session in-memory
  process and hardcodes `agentDir: '/tmp/agent'` — see gaps.

## Plan (keyed to owner rules)

1. **Dispatch resolves Device first.** Drop the `heteroType !== 'orvilo'` bypass so
   orvilo plans flow through the lead's resolution chain (`selectableDevices` /
   `runnableDevices` / `DEVICE_*` errors). A `device` plan →
   `deviceGateway.dispatchAgentRun` carrying a harness descriptor; the device host then
   picks the adapter (orvilo → Prime, codex → Codex, claude-code → Claude Code).
   The existing embedded fork becomes the "this machine" device implementation —
   same runtime composition, device-supplied paths instead of repo-relative ones —
   once the contract defines how the server's own device identity is represented.
2. **Wire contract for Prime admission.** `AgentRunRequestMessage` needs a harness
   descriptor (harnessId, artifact manifest/digest expectation, modelRoute + init params,
   broker endpoint + short-lived bound credential). `operationId` + `runGeneration` +
   `idempotencyKey` + `cwd` already exist. Descriptor shape should come from the
   contract's `ResolvedRunIdentity`, not invented here.
3. **Device-side Prime host** (shared module consumed by CLI `connect.ts` and Desktop
   `GatewayConnectionCtr`): reuse the `agentRun.ts` lifecycle verbatim — admission map,
   stale-process cleanup, kill-confirm — with only the launcher swapped: spawn
   `runner.mjs` under a device-local supervisor via `HarnessTransport` over stdio;
   `harness.init` (protocolVersion + pin + model + workspace) → `session.prompt`;
   `session.abort` on cancel; `harness.event` → existing `heteroIngest`; runner→host
   `broker.infer` / `broker.cancel` → device-side broker bridge to the trusted broker.
   No parallel gateway/cancel-registry/settle — `cancelHeteroTask(operationId)` maps to
   `session.abort`; settle stays server-side via `heteroFinish`.
4. **Ship the artifact.** Bundle `packages/prime-harness` `dist/runner.mjs` +
   `runner.manifest.json` into CLI and Desktop builds; the device host verifies digest
   via `embeddedArtifactVerifier(manifest)` before launch and reports verified
   version + digest + protocol capabilities in its capability report; re-verify per
   launch. No dev-repo relative paths.
5. **Isolation stays real.** On Linux devices the Docker supervisor is one valid
   implementation producing `IsolationEvidence`; devices without it report the
   capability absent and admission fails closed (or runs under a contract-defined
   weaker profile) — never a bare spawn presented as isolated.
6. **Inference creds stay bound.** The `agent_run_request` carries a short-lived
   credential bound to subject + operation + device + TTL that the device broker
   bridge uses to reach the trusted broker — no raw API keys in agent config or
   gateway messages.
7. **Bounded lease.** The device-side run holds a lease renewed over the gateway
   channel; losing renewal stops new side-effects (abort prompt + deny further
   `broker.infer`) then kills the tree per the defined policy.

## Open questions / gaps for the lead

- **Contract doc + types absent** — all dispatch wiring waits on the landed
  resolution chain and `ResolvedRunIdentity`; nothing here mints competing semantics.
- **`agent_run_request` harness descriptor** — the wire shape for Prime admission
  (artifact identity, modelRoute, broker endpoint + bound credential) needs a
  contract-owned shape; extending the message ad hoc would be a competing semantics.
- **Chat admission** — today chat fails `EMBEDDED_CHAT_NOT_ADMITTED` because the
  embedded host is task-shaped (CanonicalRunAuthority locks task rows). What device
  context does a chat run carry under `ResolvedRunIdentity`?
- **`agentDir: '/tmp/agent'` hardcode** in `runner.ts` — contract says the device host
  supplies state dir; needs a runner `harness.init` param or spawn arg.
- **Remote broker bridge** — a device runner's `broker.infer` must reach the trusted
  broker across machines; contract needs to define the endpoint + credential plumbing
  (today the bridge is in-process `SqlTrustedProviderBackend`).
- **Local isolation profile** — embedded dispatch requires a pinned docker image for
  `IsolationEvidence`; what does "this machine" as a device do when docker is absent?
- **Package deps** — CLI/Desktop need `@orvilo/agent-execution` (+ bundled
  `@orvilo/prime-harness` artifact); placement of the shared device-host module should
  be coordinated with the lead.
