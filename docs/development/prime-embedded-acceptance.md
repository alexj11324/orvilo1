# Prime embedded harness — acceptance evidence

Phase 6 of the embedded harness (`@orvilo/prime-harness`, vendored
`pi-coding-agent@0.9.8` @ `7d442aafa985f9342134fac16c2ef41f03fb45c1`, MIT).
The suites below run **real processes, a real PGlite database, real
credential crypto, and a real HTTP stub provider** — the only doubles are at
the supervisor port where Docker is genuinely unavailable (see
[Docker gap](#docker-image-gap)), and each names its substitution inline.

```
bunx vitest run --project server --silent='passed-only' \
  apps/server/src/services/controlPlane/embeddedAcceptance.protocol.test.ts \
  apps/server/src/services/controlPlane/embeddedAcceptance.inference.test.ts \
  apps/server/src/services/controlPlane/embeddedAcceptance.isolation.test.ts \
  apps/server/src/services/controlPlane/embeddedAcceptance.dispatch.test.ts \
  apps/server/src/services/controlPlane/embeddedAcceptance.compaction.test.ts
```

Result on the acceptance branch: **19/19 tests green** (5 files, \~33s).
Set `PRIME_ACCEPTANCE_TRANSCRIPT_DIR=<dir>` when running the protocol suite
to also emit `protocol-handshake.jsonl` — the verbatim ndjson transcript of
`harness.init` → `session.prompt` → `broker.infer`/`broker.event` →
`harness.event` used as PR evidence.

## Evidence matrix

| Design-doc acceptance item                                                                          | Test                                                                         | What is real                                                                                                                                                                                     | Result                                  |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Protocol: `harness.init` handshake (protocolVersion, pin echo, capabilities)                        | `embeddedAcceptance.protocol.test.ts` "completes init handshake…"            | Real `dist/runner.mjs` child over production `HarnessTransport`; ndjson transcript                                                                                                               | Pass                                    |
| Protocol: `session.prompt` → `broker.infer` → text round-trip, `modelRoute` host-pinned             | same test                                                                    | Real child; transcript asserts exactly one `broker.infer` with `modelRoute === init.model.id`                                                                                                    | Pass                                    |
| Protocol: quiescence / clean exit (close transport → exit 0 within 10s)                             | same test                                                                    | Real child process exit code                                                                                                                                                                     | Pass                                    |
| Protocol: `session.abort` → `broker.cancel` → cancelled result                                      | "cancels an in-flight prompt…"                                               | Real child; cancel observed on wire                                                                                                                                                              | Pass                                    |
| Protocol fail-closed: bad handshake / unknown method / malformed frame                              | 3 cases in same file                                                         | Real child; error/no-reply behavior                                                                                                                                                              | Pass                                    |
| Inference: bridge → `SqlTrustedProviderBackend` → provider HTTP/SSE bytes                           | `embeddedAcceptance.inference.test.ts`                                       | Real `InferenceBroker` + `SqlTrustedProviderBackend` on PGlite `getTestDB`; real `CredentialModel.decryptPayload` (`KEY_VAULTS_SECRET` beforeAll/afterAll); real node `http` stub provider (SSE) | Pass                                    |
| Inference: cancel propagates — `broker.cancel`/stop → backend aborts upstream fetch (socket closed) | "cancel propagates…"                                                         | Real AbortSignal through `pumpBrokerEvents` → `SqlTrustedProviderBackend.controller.abort()`; stub counts aborted `/chat/completions`                                                            | Pass (regression for BUG #2)            |
| Inference: `CanonicalRunAuthority.withRun` fence re-issued per call/event                           | inference bump test                                                          | Real binding `revision` UPDATE mid-stream → subsequent `broker.event` gets `unauthorized`                                                                                                        | Pass (also the real-DB revocation case) |
| Inference: provider failure surfaces as `runtime_failed`, not a silent hang                         | "provider error…"                                                            | Stub returns HTTP 500 → assistant `error` event                                                                                                                                                  | Pass                                    |
| Isolation: artifact hash/byte equality vs `runner.manifest.json`                                    | `embeddedAcceptance.isolation.test.ts` "artifact verifier"                   | Real `dist/runner.mjs` + manifest sha256                                                                                                                                                         | Pass                                    |
| Isolation: tampered artifact denied at `authorize` (`policy_denied`), zero launches                 | "tampered artifact"                                                          | Real verifier over an XOR-tampered copy                                                                                                                                                          | Pass                                    |
| Isolation: runner env carries no endpoint/headers/secrets (`sanitizedRuntimeEnvironment`)           | "launch env"                                                                 | Real `IsolatedLaunch` env captured by supervisor seam; deep-equality + regex over args                                                                                                           | Pass                                    |
| Isolation: denied network — runner opens no outbound socket except stdio                            | "netguard"                                                                   | Real child under `prime-embedded-netguard.mjs` (patches `net`/`tls`/`dgram`/`fetch` → ENETUNREACH + JSONL audit); real prompt driven through the stub broker — zero `net` entries                | Pass                                    |
| Isolation: mid-stream `requestStop`/stopped task → `withRun` denial kills stream                    | isolation stop test                                                          | Real fence transition mid-prompt → `revoked`                                                                                                                                                     | Pass                                    |
| Dispatch: `prime_embedded_dispatch` **on** → `heteroType:'orvilo'` reaches embedded composition     | `embeddedAcceptance.dispatch.test.ts`                                        | Real env flag flip (`FEATURE_FLAGS` + `vi.resetModules` + dynamic import — no `vi.mock`); real DB rows (task fence 2, gen 1); `driveEmbeddedCanonicalRun` → real child via supervisor seam       | Pass                                    |
| Dispatch: hetero (`claude-code`,`codex`) and ACP dispatches provably do NOT route to embedded       | route matrix in same file                                                    | Real flag flip, real `resolveEmbeddedDispatchRoute` — non-orvilo → `null`                                                                                                                        | Pass                                    |
| Dispatch: flag **off** → embedded route inert (default-deny)                                        | same matrix                                                                  | Real flag flip                                                                                                                                                                                   | Pass                                    |
| Revocation: binding bump mid-compose/mid-stream → `unauthorized` before further inference           | inference bump test (real DB)                                                | Real `provider_bindings.revision` UPDATE; per-event `withRun` recheck                                                                                                                            | Pass                                    |
| Compaction: vendored `completeSimple` summarization exits via `broker.infer` only                   | `embeddedAcceptance.compaction.test.ts` "an over-window…"                    | Real child; seeded history + reported-usage threshold compaction → `broker.infer` frame whose `messages[0]` is `SUMMARIZATION_SYSTEM_PROMPT` verbatim                                            | Pass                                    |
| Resume: v1 deferral fail-closed                                                                     | "resume returns unsupported_capability"                                      | Real `PrimeEmbeddedRuntime` — `capabilities().resume === 'none'`                                                                                                                                 | Pass                                    |
| Frame bounds / pending-request caps / timeout                                                       | covered inside protocol fail-closed cases + `HarnessTransport` unit coverage | `HARNESS_MAX_FRAME_BYTES`, `HARNESS_MAX_PENDING_REQUESTS`, `HARNESS_REQUEST_TIMEOUT_MS`                                                                                                          | Pass                                    |

## Substituted doubles (honest names)

- **`realProcessSupervisor`** (in `embeddedAcceptance.support.ts`): implements
  the supervisor port by spawning the runner as a plain child process instead
  of a Docker container. Filesystem and network isolation claims are marked
  `ASSERTED` in its recorded launches — it does **not** claim container-grade
  confinement; the netguard test supplies the actual no-socket evidence.
- **Stub provider** (`startStubProvider` in the same file): a node `http`
  server bound to `127.0.0.1` on a random port answering `GET /models` and
  `POST /chat/completions` with SSE frames, tracking sockets so cancel tests
  can prove the upstream connection was aborted. Stands in for a real
  provider endpoint; the wire format is the OpenAI-compatible SSE shape the
  production `SqlTrustedProviderBackend` speaks.
- **Broker answerer** in protocol/compaction suites: the host-side reverse
  handler returns `{accepted: true}` + scripted `broker.event`s, standing in
  for `createEmbeddedInferenceBridge` (covered for real in the inference
  suite).

## Docker-image gap

This box has no Docker. The suites substitute a plain child process at the
supervisor port and instrument the child directly (netguard). A real
container run is the only way to prove:

- **Kernel-level confinement** — read-only rootfs, tmpfs scratch, dropped
  capabilities, seccomp, no-new-privileges, and PID/user namespacing set by
  `DockerProcessTreeSupervisor`/`prime-harness` Dockerfile flags. The
  netguard test proves the _child does not attempt_ sockets; it does not
  prove the kernel _denies_ them.
- **Image provenance** — the pinned `runner.mjs` + `runner.manifest.json`
  inside a built image layer vs the file on this dev box (the verifier logic
  itself is tested on the real files).
- **Cgroup lifecycle** — tree-kill on `requestStop`, OOM/reap behavior, and
  drain semantics under container teardown rather than `SIGKILL` on a child.
- **Docker network isolation** — `--network none` enforcement; the suite's
  denied-network evidence is instrument-level (patched calls logged +
  denied), not kernel-level.

Residual risk is confined to the supervisor boundary — the wire protocol,
broker auth/fencing, inference path, and artifact verification are all
exercised end-to-end here.

## Flag-flip checklist — `prime_embedded_dispatch`

Gate: `isPrimeEmbeddedDispatchEnabled` ← `getServerFeatureFlagsFromRuntimeConfig`
← `parseFeatureFlag(process.env.FEATURE_FLAGS)` (`'+prime_embedded_dispatch'`
enables, `'-prime_embedded_dispatch'` disables; default off). The flag
provider caches for 5s — expect one cache TTL of propagation delay.

Before flipping in prod:

1. Image: build and pin `prime-harness` image + `runner.manifest.json` in the
   deploy environment (Docker gap items above must hold there).
2. Secrets: `KEY_VAULTS_SECRET` present — bindings cannot resolve without it.
3. Bindings: `provider_bindings` rows for orvilo-harness principals must
   resolve via `resolveOrviloProviderBinding` — a missing/invalid binding
   fails the dispatch pre-launch (`unavailable`), never mid-run.
4. Smoke: one `heteroType:'orvilo'` dispatch on a staging task; confirm the
   operation reaches `done` and `terminatedTrees` cleaned up.
5. Rollback is the same flag off — in-flight runs are unaffected (the route
   is chosen at dispatch-compose time); new dispatches fall back to the
   previous harness path.
6. Watch for `stale_fence`/`unauthorized` errors on first traffic — they
   indicate fence/binding revision drift, not transient failures.

## Earlier-phase fixes found by this suite

Acceptance evidence exposed two real bugs, fixed minimally in this branch:

- **BUG #1 — error event shape drift.** `InferenceEvent` nests the error
  (`{type:'error', error:{code,message}}`) while the wire `BrokerStreamEvent`
  is flat (`{type:'error',code,message}`). The pump forwarded the nested
  object; the runner's `isBrokerStreamEvent` dropped it, leaving the stream
  hanging. Fixed by translating at the notify site in
  `primeEmbeddedRuntime.ts`. Regression: inference "provider error" test.
- **BUG #2 — cancel could not reach a suspended backend.** V8's
  async-iterator close semantics: `iterator.return()` on the broker generator
  suspended at a pending `await` never runs `AsyncIteratorClose` on the inner
  backend iterator, so the upstream provider fetch was never aborted.
  Fixed by threading `options.signal` through
  `InferenceBroker.infer`/`TrustedProviderBackend.infer` to the backend's own
  `AbortController` (`pumpBrokerEvents` cancels it on the cancel latch and on
  the stopped early-exit). Regression: inference "cancel propagates" test.

## Merge recipe — `feat/byok-execution-chain` (#367) after this stack

`providerBinding/execution.ts` diverged on both lines; the resolver keeps
**canonical + compat** (this file) verbatim — do not take any #367 hunk of
`execution.ts`. Everything #367's callers need is already in the compat
superset, so the merge resolves to zero compile breaks for `execAgent`.

### Files resolved by keeping canonical + compat verbatim

- `apps/server/src/services/providerBinding/execution.ts` — take this side.
  The #367 caller surface is overlaid as leading overloads:
  - `resolveOrviloProviderBinding(db, userId, engine, target: OrviloBindingTarget)`
    → `OrviloBindingResolution` (`none` / `unavailable` / `applied:{execution}`).
    The canonical `(…, target: string, match?)` overload is declared **last**
    so `typeof resolveOrviloProviderBinding` in `embeddedBroker.ts` keeps the
    canonical signature — preserve the ordering if the file is ever refactored.
  - `issueBindingExecution(db, userId, candidate:{id,revision}, engine, target)`
    → `IssuedByokSpawnExecution | undefined`; canonical `(db, claim)` stays last.
  - `OrviloBindingTarget`, `OrviloBindingResolution`, `IssuedByokSpawnExecution`,
    `selectOrviloProviderBinding`, `buildByokExecutionCredentials` — same names
    \#367's tests/consumers reference (`IssuedByokSpawnExecution` is the only
    rename; #367 imported no name for this return type).
- `apps/server/src/services/providerBinding/controlPlane.ts` — take this side;
  `resolveProviderCredentialHeaders` is exported (same function #367 added —
  both sides now share it).
- `packages/database/src/models/providerBinding.ts` — take this side;
  `setEnabled` is present (verbatim from #367).
- `apps/server/src/services/deviceGateway/index.ts`,
  `packages/device-gateway-client/src/{http,types}.ts`,
  `apps/cli/src/{commands/connect.ts,device/agentRun.ts}`,
  `apps/desktop/src/main/controllers/{GatewayConnectionCtr,HeterogeneousAgentImpl}.ts`,
  `apps/server/src/services/heterogeneousAgent/sandboxRunner.ts` — the `env`
  param chains are identical additive hunks on both sides; either side or a
  trivial both-keep resolves them.

### #367 hunks that still need manual porting

In `heteroDispatch.ts` the resolver keeps the canonical file (embedded-dispatch
block intact) and re-applies #367's additions:

1. `import { resolveOrviloEngine } from '@orvilo/types'` and
   `import { resolveOrviloProviderBinding } from '…/providerBinding/execution'`.
2. The `byokTarget` / `byokResolution` block (unavailable →
   `finalizeHeteroDispatchError` + `PROVIDER_BINDING_UNAVAILABLE` return).
3. The `agentOperations.metadata.byok = {bindingId, revision}` pin update.
4. `heteroExecArgs` composed with `byok?.model` + `byok?.execArgs` — keep it
   after the resolution block (canonical moved the provider-effective block
   up; the merge must restore #367's ordering since `byok` is built there).
5. `env: byok?.env` in **both** dispatch call sites:
   `deviceGateway.dispatchAgentRun({…, env: byok?.env})` and
   `spawnHeteroSandbox({…, env: byok?.env})` — both params exist on this side.

Expected result: `execAgent` compiles unchanged; `byok?.env`/`execArgs`/`model`
`bindingId`/`revision` all resolve to the compat return shape.

### Deliberate semantic mapping (not bugs)

- **Sandbox arm returns `applied` with `env: {}` and `execArgs: []`.** On
  \#367 the sandbox path minted provider env into the cloud sandbox; canonical
  serves sandbox credentials through the embedded inference broker instead.
  A byok-bound sandbox run that is not embedded-admitted spawns without BYOK
  env — it fails at the provider (loud), never silently on another account.
- **`enabled` gate is stored-JSONB truth.** `config.enabled` is typed
  `literal(false)`; the compat path reads `Boolean(row.config.enabled)` so
  post-verification `enabled:true` rows resolve — same as #367.
- \*\*`issueBindingExecution` compat arm fences on `{id, revision}` + ownership
  - `enabled` at mint time\*\* — identical to #367's fence; the canonical claim
    arm (`bindingId`/`bindingRevision`/`ownerId`/`tenantId`) is untouched.

Coverage: `execution.compat.test.ts` runs the #367-side expectations against
this file (device arm keeps full env/execArgs assertions; sandbox arm asserts
the empty-surface descriptor contract).
