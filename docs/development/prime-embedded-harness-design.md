# Prime embedded harness design

Status: design only (recon + proposal). No implementation here.

Goal: consume upstream Prime (pinned `v0.9.8`, commit
`7d442aafa985f9342134fac16c2ef41f03fb45c1`, MIT) as an **in-process library** that
constitutes Orvilo's first-party agent harness — replacing the lobehub
client-side inference loop — rather than running it as an opaque ACP-supervised
binary. Third-party ACP agents (claude-code, codex, cursor, devin, droid …)
remain supervised binaries and are untouched.

## 1. Current control-plane runtime surface

### Contract layer — `packages/agent-execution/src/controlPlane/contracts.ts`

- `ExecutionFence` — `{tenantId, principalId, taskId, grantId, ownerId, leaseId,
epoch, policyRevision, stateRevision}`. Every runtime/broker call is checked
  against a live fence; mismatches return `stale_fence`.
- `ControlResult<T>` / `ControlErrorCode` — closed error taxonomy
  (`unauthorized`, `revoked`, `stale_fence`, `lease_expired`, `policy_denied`,
  `isolation_unavailable`, `not_quiescent`, `unsupported_capability`, …).
- `TypedAction` — `file.write | git.commit | task.transition | issue.update |
deploy`. Effects never run inside the runtime tree; they flow through
  `ActionGateway` to host-side executors with durable receipts
  (`DurableReceipt` → `FileDurableReceiptStore` / `SqlDurableReceiptStore`).
- `ExecutionRuntime` — `capabilities / start / resume / prompt /
cancel / shutdown`. `RuntimeEvent` today is `text | turn-ended | error` only —
  no tool-call vocabulary.
- `IsolationEvidence` — `{enforced, filesystem, network, processes,
sanitizedEnvironment, credentialsExcluded, supervisorId, treeId}`.
- `InferenceBroker` / `ProviderConfigurationBroker` — server-side BYOK ports
  (`InferenceRequest`, `ProviderBinding` with `secretReference` — never a
  credential).

### Runtime adapter — `primeRuntime.ts`

`PrimeExecutionRuntime` wraps upstream Prime as a **supervised ACP binary**:

- `PRIME_RUNTIME_PIN` = `{commit: 7d442aa…, version: '0.9.8', license: 'MIT'}`.
- `start()`: `authorize(fence)` → `verifyArtifact(executable, pin)` →
  `supervisor.launch(['--mode','acp'], sanitizedRuntimeEnvironment)` →
  `verifiedIsolation` shape check → `connect(treeId)` → ACP `initialize`
  (requires `agentInfo.name==='prime-agent'`, `version===0.9.8`,
  `loadSession===false`, `fs/terminal:false`) → `authorize` re-check →
  `session/new` → `authorize` re-check → register `RuntimeSession`.
- `prompt()` — serial per session (`entry.prompting` latch, reserved before any
  await), maps ACP `session/update` `agent_message_chunk` → `RuntimeEvent.text`,
  and `session/prompt` `stopReason` → `turn-ended` (`end_turn|cancelled|budget`).
  Unsupported stop reasons → error + termination.
- `cancel()/shutdown()` — `transport.close()` then `supervisor.terminate(treeId)`
  and requires `QuiescenceProof` (`remainingProcesses===0`,
  `pendingActions===0`, fresh `observedAt`).
- `resume()` — permanently `unsupported_capability` under stable ACP
  (`loadSession:false` is asserted in the handshake).

### Transport — `primeStdioTransport.ts`

Bounded ndjson JSON-RPC over supervisor-owned stdio: 1 MiB frame cap, 16 pending
requests, 30 s timeout, **reverse requests denied** (`-32601`), only
`session/update` notifications forwarded. `close()` settles everything but does
not prove tree exit.

### Supervisor — `dockerSupervisor.ts` / `isolation.ts`

`DockerProcessTreeSupervisor` launches the pinned executable into a restricted
container: `--network none`, `--read-only` root, `cap-drop ALL`,
`no-new-privileges`, `--user 65534`, `--pids-limit 64`, memory+swap ceiling
(256 MiB–4 GiB), noexec 32 MiB tmpfs `/tmp`, read-only bind-mounted
`/workspace`, supervisor-owned label, exact environment allowlist
(`HOME/TMPDIR/LANG/PYTHONNOUSERSITE`). `connect()` exposes the attached
`docker start -a` client's stdio. `terminate()` = SIGKILL → `wait` → drain
broker actions → fresh daemon proof. `recover()` re-finds the tree by persisted
container name.

What this buys us today:

1. **Artifact verification** — `verifyArtifact(executable, pin)` + image pinned
   by `sha256:` digest with provenance labels checked host-side
   (`scripts/acceptance/prime-protocol.ts`), not by child self-attestation.
2. **Isolation evidence** — `IsolationEvidence` populated from supervisor
   launch truth, gated by `verifiedIsolation`.
3. **Quiescence proof** — `QuiescenceProof` from daemon inspection +
   `drainActions` (all non-terminal receipts must be absent) — not cooperative
   child exit.
4. **Fence/lease/revision** — `CanonicalRunAuthority.withRun` holds Postgres
   row locks (task → dispatch → grant → taskTopic → member, `FOR UPDATE
NOWAIT`) across admission and re-checks, plus `AgentDelegationService.
assertMayCommit` semantics.
5. **Crash recovery** — `CanonicalCoreRuntimeHost` journals binding, container
   name, isolation, session to a private control dir; `recoverStop()` and
   handoff (`handoff.ts` phases) recover or stop an unjournaled tree.

### Host composition — `apps/server/src/services/controlPlane/`

- `coreRuntimeHost.ts` — `CanonicalCoreRuntimeHost`: opt-in composition binding
  `CanonicalRunBinding` (registered run) → `PrimeExecutionRuntime` →
  `DockerProcessTreeSupervisor` → `ActionGateway(file.write)` +
  `CanonicalSessionSnapshots` + `CanonicalVerifyCompletion`. Currently
  referenced only by its own acceptance tests — no production dispatch path
  wires it yet.
- `canonicalRun.ts` — `CanonicalRunAuthority`, the row-locked fence resolver.
- `canonicalSessionSnapshot.ts` / `canonicalCompletion.ts` — recovery snapshot
  admission and trusted completion (`reconcileCompletion` needs server-loaded
  receipt mappings; `end_turn` never completes a task).

### Third-party agent path (stays as-is)

`packages/heterogeneous-agents` (spawn/adapters/registry → `agent-gateway-client`
`AgentStreamEvent` over WS) is untouched. Note: the builtin `type:'orvilo'`
harness today has **no binary of its own** — `resolveOrviloCliAgentType` borrows
`claude-code`/`codex` (`packages/types/src/agent/agencyConfig.ts:153`,
`docs/development/builtin-agent-harness-binding.md`). The embedded harness is
what finally gives `type:'orvilo'` a first-party execution substrate.

## 2. Upstream Prime v0.9.8 embeddability

Upstream = `github.com/PrimeIntellect-ai/prime-agent` @ `7d442aa` — a TypeScript
npm-workspaces monorepo (`packages/{ai,agent,coding-agent,tui}` +
`prime-agent-runtime/` Python), MIT license. It is the Prime-Intellect fork of
`pi` (badlogic), republished under `@earendil-works/pi-*` names.

### Can it be consumed as a library?

| Path                              | Verdict                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm registry                      | **No** — `@earendil-works/pi-coding-agent@0.9.8` is not published (registry tops out at 0.99.x, a different lineage); `prime-agent` name is not on npm at all.                                                                                                                                                                   |
| Release tarball                   | Yes — `install.sh`/`scripts/pack-prime-agent-release.mjs` produce `prime-agent-<v>.tgz` npm packages served from PrimeIntellect's release CDN (`PRIME_AGENT_DOWNLOAD_BASE_URL`). Could vendor the tarball, but availability/integrity control is weaker than source vendoring.                                                   |
| Git dependency                    | No — the repo root is `private:true` and the sub-packages are workspace members; npm/pnpm git deps can't address a sub-path.                                                                                                                                                                                                     |
| **Vendored source (recommended)** | Yes — vendor `packages/{ai,agent,coding-agent}` (+ `pi-tui` only if the import graph demands it) into `vendor/prime` or a private fork repo; `npm ci --ignore-scripts && npm run build` per the existing acceptance recipe (`scripts/acceptance/prime-protocol.md`). This is also what the current Dockerfile flow already does. |
| WASM                              | No — upstream ships Node/JavaScript only; no wasm target exists.                                                                                                                                                                                                                                                                 |

### Embeddable API surface (beyond ACP stdio)

- **`createAgentSession(options)` → `AgentSession`** (`sdk.ts`) — the real
  embedding entrypoint: `prompt`/`promptUntilAccepted`/`promptAndWait`,
  `subscribe(AgentSessionEvent)`, `abort`, `dispose`, `setModel`, `steer`,
  `followUp`. Construction knobs: `cwd`, `agentDir`, `authStorage`,
  `modelRegistry`, `settingsManager`, `sessionManager`, `resourceLoader`,
  `mcpManager`, `tools` allowlist / `noTools`, `customTools`, `autonomous`.
- **`AgentSessionRuntime` + `InProcessAgentConnection implements AgentConnection`**
  (`core/agent-session-runtime.ts`, `modes/agent-connection/`) — upstream's own
  daemon-facing session abstraction already has an in-process form; the daemon
  mode spawns supervised _session workers_ on private framed sockets
  (`modes/daemon/`, `modes/session-worker/private-framing.ts`) — the same shape
  we want, under their protocol instead of ours.
- **`ModelRegistry.registerProvider(name, config)`** (public, `model-registry.ts:1759`)
  and extension `pi.registerProvider({streamSimple})` — the supported
  interception point for ALL inference (ordinary streaming **and** the
  `completeSimple` calls from compaction/branch-summarization/refinement, per
  `core-prime-inference-integration.md`). Inline factories via
  `resourceLoaderOptions.extensionFactories` allow registration without any
  file-based extension; `noExtensions` disables discovered extensions.
- **`AuthStorage.inMemory()`** and **`SessionManager.inMemory(cwd)`** — no
  `auth.json`/`models.json` files, no persisted session dir required.
- **Credentials today**: `AuthStorage` reads `auth.json`/`models.json` under
  `agentDir`; the Python kernel can also read them
  (`prime-agent-runtime/src/rlm/mcp_base.py`). Embedding must supply in-memory
  storage with **zero** credentials — model traffic exits only through the
  broker provider's `streamSimple`.
- **Process sprawl to contain**: `kernel/repl-manager.ts` spawns
  `python -m rlm.repl`; bash tool spawns shell children; MCP managers spawn
  servers. Under the supervised tree these stay inside the PID/mem/net cgroup,
  but v1 should disable bash/ipython/MCP regardless (read-only root + noexec
  tmpfs already neuter them).
- Telemetry exists (`telemetry.enabled`, `PRIME_AGENT_TELEMETRY=0`); with
  `--network none` it cannot egress, but set it off explicitly anyway.

## 3. Embedding design

### Recommended model: embedded-in-harness-runner (Option B)

Introduce `@orvilo/prime-harness` — a first-party Node runner that **is the
container PID 1**, replacing `prime-agent --mode acp` + ACP entirely:

```
apps/server (trusted)                        Docker tree (untrusted)
─────────────────────                        ─────────────────────
CanonicalCoreRuntimeHost                     @orvilo/prime-harness (PID 1)
  PrimeEmbeddedRuntime          stdio/IPC      createAgentSession({
    supervisor.launch ──────────>  authStorage: inMemory(empty)
    connect(treeId)  <──ndjson──   sessionManager: inMemory
    ── harness proto ──            modelRegistry: only 'orvilo-broker'
  createInferenceBroker  <──IPC──  registerProvider('orvilo-broker',
    SqlTrustedProviderBackend        {streamSimple → host IPC})
  ActionGateway            <──IPC──  customTools: orvilo.* tools only
}) — upstream file/bash/ipython/MCP disabled
```

- "In-process" is satisfied where it matters: `AgentSession` runs inside an
  Orvilo-owned process with full API access (no ACP ceiling on methods, event
  vocabulary, or session loading). The **process-tree boundary is unchanged** —
  same `DockerProcessTreeSupervisor`, same evidence types.
- Rejected: embedding `createAgentSession` directly inside `apps/server`.
  Untrusted agent code + tools (bash/ipython/MCP/extensions) in a process
  holding `DATABASE_URL`/`KEY_VAULTS_SECRET` voids `credentialsExcluded`,
  `filesystem`, `network`, `processes` — the entire `IsolationEvidence` model
  and revocation quiescence guarantees. Not recoverable by code review.
- Rejected: `worker_threads` — threads share the process: no fs/net/pid
  isolation, no cgroup limits; containment inside the runner adds nothing over
  in-process `AgentSession` disposal.
- Rejected (for now): upstream `daemon` mode — it already supervises
  session-worker processes on private sockets, but adopting it means adopting
  their supervision/lease model instead of ours (fence, drainActions,
  quiescence proof, handoff). Our supervisor must own the tree either way.

### Session lifecycle mapping

| `ExecutionRuntime`  | Embedded equivalent                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`             | `authorize` → artifact-verify the runner → `supervisor.launch(['harness'])` → `connect` → harness init handshake (protocolVersion, pin echo, capabilities) → `createAgentSession` with in-memory auth/session managers and broker-only registry → `authorize` re-checks → register session id (runner-generated UUID echoed in init ack). |
| `prompt`            | `session.prompt*` over transport; runner maps `AgentEvent`s (`message_update` → text deltas, `tool_execution_*` → new event kinds or fail-closed, `agent_end` → `turn-ended`). Same `prompting` latch + interrupt semantics as today.                                                                                                     |
| `cancel`/`shutdown` | transport close → `session.abort()` → `dispose()` → supervisor `terminate` + `drainActions` → `QuiescenceProof` (unchanged).                                                                                                                                                                                                              |
| `resume`            | Now _implementable_ (`SessionManager` file/session-path, `switchSession`) — but sessions die with the container's tmpfs; keep `resume:'none'` in v1. A later phase can export the session journal over IPC before quiescence and re-import on successor start (that's genuinely new capability vs ACP).                                   |

### Fencing / lease / revision hooks

Unchanged ports: `authorize(fence)` still runs `CanonicalRunAuthority`
row-lock validation before start/prompt; `drainActions` still blocks quiescence
on non-terminal receipts. New rule: every host-bound IPC call carries the
**runner-bound fence** — attached at launch by the host, never from agent
payload — and the host re-resolves authority on each call (the
`createInferenceBroker` streaming-recheck pattern).

### BYOK credential injection

`provider_bindings` (db row: `providerId`, `modelRoutes`, `endpoint`,
`secretReference`, `revision`) → host `SqlTrustedProviderBackend.resolveConnection`
→ `CredentialModel.decryptPayload` (AES-256-GCM via `KeyVaultsGateKeeper`,
`KEY_VAULTS_SECRET`) → `{endpoint, Authorization/x-api-key or kv-header map,
model}`. The provider call executes **host-side** inside
`createInferenceBroker` (per-event grant/lease/binding-recheck).

The harness's `streamSimple` handler receives a sanitized `InferenceRequest`
(modelRoute, messages, budget, requestId) — never the endpoint, headers, or
secret. Stub `baseUrl`/`apiKey` fields that upstream requires for provider
registration get inert placeholders (`orvilo-broker://local`, `key:"embedded"`)
that cannot reach a network (container is `--network none` anyway).

### Contract deltas needed

- `RuntimeEvent`: add `tool-call`/`tool-result`/`thinking`/`usage` variants (or
  declare them fail-closed for v1 — current contract cannot represent Prime's
  tool turns; see `core-prime-inference-integration.md` "Contract gap").
- `PrimeAcpTransport` → generalize to an Orvilo harness protocol (ndjson
  JSON-RPC is fine to keep; vocabulary is ours): session methods +
  host→runner tool dispatch + runner→host `broker.*` requests. Keep the
  bounded-frame machinery (`PrimeStdioTransport` limits) as the base.

## 4. P30 restore interaction

The P30 restore (`feat/restore-provider-p30`; related code exists on
`work/acp-P30-a01` / `feat/acp-P30-ui`) brings back three surfaces:

| Surface                                                                                                                                                                                    | Interacts with embedded harness?                                                                                                                                                                                                                                                    | Disposition                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `streamingExecutor` (`transports/client/streamingExecutor.ts` — client `AgentRuntime`/`GeneralChatAgent` loop, `modelRuntimeConfig` built from client-side `aiModelSelectors` + key vault) | **Superseded** — this IS the lobehub client-side inference loop the harness replaces for `type:'orvilo'` runs. Keep only if P30 intentionally preserves a local-browser BYOK mode; otherwise it becomes a dead second inference path that violates "credentials never into client". | Drop from restored surface or gate to legacy-local mode. |
| `src/features/Settings/provider` UI                                                                                                                                                        | **Kept, repointed** — the UI still collects provider/endpoint/model/credential, but must write `provider_bindings` + `credentials` via the existing `providerBinding` tRPC router instead of hydrating `user.keyVaults` to the client.                                              | Repoint writes to server-owned storage.                  |
| keyVault — server `KeyVaultsEncrypt` + `credentials`/`CredentialModel`                                                                                                                     | **Kept** — this is the vault backing `secretReference`.                                                                                                                                                                                                                             | Kept as-is.                                              |
| keyVault — client `user.keyVaults` selectors                                                                                                                                               | **Superseded** for cloud runs — raw secrets must not hydrate to the renderer.                                                                                                                                                                                                       | Remove from the restore's cloud path.                    |

`checkProviderBinding` (`providerBinding/configuration.ts`) already exposes the
"does this binding really work" check the settings UI needs — the embedded path
adds nothing new there.

## 5. Risks

| Risk                    | Detail                                                                                                                                                                                                    | Mitigation                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream drift          | Fork is moving fast; 0.9.8 unpublished on npm; vendoring freezes us.                                                                                                                                      | Treat `vendor/prime` like the current pin: PRIME_RUNTIME_PIN → source pin + vendored hash manifest; re-vendor cadence + a compat test suite (handshake/events/tools) that runs on bump PRs.                                                                                                                                  |
| License                 | MIT (Mario Zechner / Prime Intellect) — compatible; keep LICENSE + NOTICE attribution in the vendored dir.                                                                                                | None needed beyond attribution.                                                                                                                                                                                                                                                                                              |
| Bundle size / install   | `coding-agent/src` ≈ 6.6 MB TS; deps include `undici`, `@modelcontextprotocol/sdk`, `photon-node` (native), `marked`, `cli-highlight`, optional `@mariozechner/clipboard`; a `postinstall` script exists. | Vendor only needed packages; `npm ci --ignore-scripts`; bundle the runner (esbuild/tsx) to a single artifact that `verifyArtifact` hashes; image size delta \~10–30 MB.                                                                                                                                                      |
| Sandbox parity          | In-sandbox runner is a bigger, Orvilo-written PID 1; upstream spawns Python kernel, bash children, MCP servers, extension loaders, catalog fetchers.                                                      | Same supervisor evidence model; v1 disables bash/ipython/MCP/extensions (`tools` allowlist, `noExtensions`, empty MCP manager, no catalog fetch); `--network none` + read-only root already contain the rest. Extension/skill auto-loading from the workspace mount must be explicitly off — workspace content is untrusted. |
| Inference coverage gaps | `Agent.streamFn` override alone misses `completeSimple` in compaction/branch-summary/refinement (already documented).                                                                                     | Register the broker as the _provider_ (`registerProvider` → modelRegistry) so all paths route through `streamSimple`; acceptance suite covers compaction + child sessions.                                                                                                                                                   |
| Contract gap            | `RuntimeEvent`/`InferenceEvent` lack tool-call/usage/thinking vocabulary.                                                                                                                                 | Extend contracts deliberately (new event kinds) or fail closed; do not silently flatten tool turns.                                                                                                                                                                                                                          |
| Two harness models      | During transition, `type:'orvilo'` can still borrow claude/codex CLIs.                                                                                                                                    | Keep `resolveOrviloCliAgentType` as fallback until embedded harness reaches acceptance parity; then flip the default binding for orvilo-harness agents.                                                                                                                                                                      |
| Resume expectations     | Embedded makes resume _possible_, which invites pressure to ship it early.                                                                                                                                | Keep `resume:'none'` until session export/import + handoff acceptance exist; a session bound to dead tmpfs is not resumable anyway.                                                                                                                                                                                          |
| Python runtime          | ipython/RLM need the `prime-agent-runtime` Python tree + venv bootstrap.                                                                                                                                  | v1 disables ipython; defer Python venv decision until a later phase (if ever — Orvilo tool surface may never need it).                                                                                                                                                                                                       |

## 6. Recommended path + effort

**Path**: Option B — `@orvilo/prime-harness` runner embedding
`@earendil-works/pi-coding-agent` (vendored at `7d442aa`, MIT) as the
supervised PID 1, with broker-only inference over host IPC and the existing
fence/supervisor/quiescence machinery untouched.

Phased estimate (Devin sessions):

1. **Vendor + runner skeleton** — vendor packages, build recipe, empty-runner
   boots under `DockerProcessTreeSupervisor`, init handshake, no tools.
   \~1 session.
2. **`PrimeEmbeddedRuntime`** — implement `ExecutionRuntime` on the harness
   transport (start/prompt/cancel/shutdown, text events); reuse
   `primeRuntime.test.ts` fixtures; parity with `capabilities()`.
   \~1 session.
3. **Broker bridge** — `registerProvider`/`streamSimple` → IPC →
   `createInferenceBroker`; `InferenceRequest` plumbing; streaming-recheck;
   contract extension for tool events or fail-closed v1.
   \~1–2 sessions (contract design dominates).
4. **Host integration** — `CanonicalCoreRuntimeHost` option swap, image build,
   drain/recovery parity, `provider_bindings` → fence wiring, settings flow.
   \~1 session.
5. **Dispatch + P30 reconciliation** — route `type:'orvilo'` runs to the
   embedded harness; repoint provider settings writes; retire the client loop
   from the cloud path.
   \~1 session.
6. **Acceptance evidence** — protocol + inference + isolation suites on the
   new runner (equivalent of `prime-protocol.md` evidence, plus revocation,
   compaction-path and denied-network cases).
   \~1 session.

**Total: \~6–8 sessions** to production-parity; a runnable text-only skeleton
(phases 1–2) lands in \~2.

## Appendix — evidence index

| Fact                                 | Where                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------- |
| ACP pin + handshake assertions       | `packages/agent-execution/src/controlPlane/primeRuntime.ts:18–22,153–176` |
| Reverse-request denial, frame limits | `primeStdioTransport.ts:104–127`                                          |
| Container confinement flags          | `dockerSupervisor.ts:129–163`                                             |
| Row-lock fence authority             | `apps/server/src/services/controlPlane/canonicalRun.ts:86–279`            |
| Journaled host/recovery              | `coreRuntimeHost.ts:196–247,707–719`                                      |
| Broker-side credential resolve       | `apps/server/src/services/providerBinding/controlPlane.ts:80–128`         |
| Upstream library entrypoint          | `sdk.ts` (`createAgentSession`, `CreateAgentSessionOptions`) @ `7d442aa`  |
| Provider interception point          | upstream `extensions/types.ts:1198–1225`, `model-registry.ts:1759`        |
| completeSimple bypass paths          | `core-prime-inference-integration.md` (compaction/refinement table)       |
| In-memory auth/session               | upstream `auth-storage.ts:311`, `session-manager.ts:2694`                 |
| Python kernel spawn                  | upstream `kernel/repl-manager.ts:374`, `kernel/bootstrap.ts:431`          |
| No `orvilo` binary today             | `packages/types/src/agent/agencyConfig.ts:153–167`                        |
| npm 0.9.8 unpublished                | `npm view @earendil-works/pi-coding-agent@0.9.8` → 404                    |
