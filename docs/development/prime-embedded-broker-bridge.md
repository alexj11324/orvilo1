# Prime embedded harness — broker inference bridge (phase 3)

Status: implemented on `feat/prime-embedded-broker` (stacked on
`feat/prime-embedded-harness`). Design context:
`prime-embedded-harness-design.md` §3 "BYOK credential injection" + "Contract
deltas needed".

Phase 3 wires the runner's `orvilo-broker` provider end-to-end so a
`session.prompt` that produces LLM traffic flows:

```
runner registerProvider({streamSimple})
  → IPC broker.infer (sanitized InferenceRequest)
  → host createInferenceBroker
  → SqlTrustedProviderBackend → provider /chat/completions (SSE)
  → broker.event notifications back over IPC
  → runner maps to AgentEvents → session.prompt events
```

## 1. Pieces

### Runner — `packages/prime-harness/src/broker.ts` (phase 2, unchanged)

`createBrokerBridge(link, sessionId)` builds the pi-ai `Provider`: each
`streamSimple(model, context, options)` issue a `broker.infer` link request
carrying a **sanitized** `InferenceRequest` — `{modelRoute, messages, budget,
requestId}` only. `broker.event` notifications arriving between request and ack
are queued and flushed into the `AssistantMessageEventStream` in order; events
for unknown request ids are dropped. `abortAll()` sends `broker.cancel` for
every in-flight request before the abort lands.

The registered `Model` carries inert placeholders upstream requires
(`baseUrl: 'orvilo-broker://local'`, `apiKey: 'embedded'`); `authStorage` stays
empty and the runner keeps `--network none`.

### Init pinning — `harnessProtocol.ts`, `runner.ts`

`HarnessInitModel {id, maxOutputTokens}` is a new required field on
`HarnessInitParams`; `isInitParams` rejects inits without it. The runner builds
the registered `Model` from the pinned init (`brokerModel(init)`), so the route
the runner asks for is exactly the route the host granted.

### Host composition — `apps/server/.../controlPlane/embeddedBroker.ts`

`createEmbeddedInferenceBridge(deps)` is the one place where binding, fence,
and capability are bound together:

1. `resolveOrviloProviderBinding(db, userId, engine, target)` — scans the
   caller's `providerBindings` for `selection.runtime === 'orvilo'` + matching
   target + `resolveOrviloEngine`-normalized engine; `list()`'s
   updatedAt-descending order means the most recently saved match wins.
2. `issueBindingExecution(db, claim)` — re-loads the row **inside the caller's
   transaction**, rejects on stale revision, and proves credential ownership
   (`ownsCredentialReference` — personal credentials only). `undefined` → the
   broker fails `'unavailable'` loudly; there is no env-key fallback.
3. Capability is pinned at composition: `backend.capabilities(pinned)` must
   contain the issued binding's `modelRoutes[0]` with `text === true`, else
   `unsupported_capability`.
4. `authority.resolve` is `CanonicalRunAuthority.withRun`: every resolution
   row-locks task → dispatch → grant → taskTopic → member and returns the live
   snapshot fence. Denial maps to a `grantRevoked` tombstone → `revoked`.

The returned `EmbeddedInferenceBridge` is `{buildInferenceRequest,
inferenceBroker, initModel}`; the runtime's `broker.infer` admission calls
`buildInferenceRequest` synchronously — no async work sits between admission
and the fence, and `request.modelRoute !== capability.modelRoute` is rejected
before any stream opens.

### Provider backend — `SqlTrustedProviderBackend` (exported)

`infer` POSTs `endpoint + /chat/completions` with `stream: true` +
`stream_options: {include_usage: true}`, parses SSE frames
(`parseCompletionFrame`: `data:` lines → text/usage/error; `[DONE]` → end),
and falls back to one JSON completion when the provider ignores `stream`.
The infer ceiling is `PROVIDER_INFER_TIMEOUT_MS = 300_000` (kept separate from
the 15 s catalog budget). An `AbortController` registered on the iterator is
aborted on early exit — cancelling the runner-side stream kills the in-flight
provider HTTP request instead of letting it burn tokens.

## 2. Fence / recheck semantics

- The fence is **host-attached**: `buildInferenceRequest` spreads
  `session.fence` into every `InferenceRequest`; the runner's payload carries
  no fence fields and the agent can never forge one.
- `createInferenceBroker.checkInference` resolves authority **per infer call
  and per streamed event**. Because `authority.resolve` re-issues the binding
  inside `withRun`'s row locks, any of these aborts the stream mid-flight:
  bumped `providerBindings.revision`, changed `secretReference`, expired
  grant/lease, or a stopped task. Denial → `revoked`; binding mismatch →
  `unauthorized`; fence key drift → `stale_fence`; dead lease →
  `lease_expired`.
- `broker.cancel` wakes the pump (`Promise.race(iterator.next(),
cancelLatch)` + `iterator.return()`), and session `cancel()` iterates open
  pumps before the transport close.

## 3. Contract deltas (minimal)

- `HarnessInitModel` on `HarnessInitParams` — required so the runner presents
  the _granted_ route; a stub id would never match `binding.modelRoutes`.
- `RuntimeEvent` gained `usage` — token/cost events were already on the wire
  via `broker.event`; the runtime surfaces them instead of dropping.

Everything else is unchanged: `tool_execution_*` stays fail-closed (tool-call
dispatch is phase 4+), `resume` stays `'none'`, and no credential-bearing field
enters the wire schema.

## 4. Test coverage

- `packages/prime-harness/src/broker.test.ts` (8) — real `RunnerLink` over
  in-memory streams: sanitized wire shape (no endpoint/credential fields),
  queued-before-ack event flush, host rejection + sanitize failure error
  paths, abort → `broker.cancel`, unknown/malformed `broker.event` drop,
  `abortAll`.
- `apps/server/.../embeddedBroker.test.ts` (6) — real `getTestDB` +
  `createCanonicalRunFixture` + real `SqlTrustedProviderBackend` + local SSE
  provider: no-binding composition failure, route pinning/admission, full
  round-trip with decrypted headers asserted on the wire, **mid-stream
  binding-revision revocation → `unauthorized`**, **mid-stream run
  revocation (stopped task) → `revoked`**, early iterator exit aborts the
  in-flight provider request.
- `apps/server/.../providerBinding/execution.test.ts` (7) — row-level
  resolution filtering and `issueBindingExecution` revision/credential
  fencing.
- `primeEmbeddedRuntime.test.ts` (+3) — `initModel` pinning in the handshake,
  `broker.cancel` unwinding the in-flight backend stream, session `cancel()`
  waking pumps before channel close.

## 5. Remaining phases

Host `CanonicalCoreRuntimeHost` option swap + image build (4), tool-call
dispatch + multi-session (5), resume policy. Out of scope here: P30 restore
surfaces (`src/features/Settings/provider`, `packages/model-runtime`,
`scripts/slimming/boundary.json` reason strings) are owned by a parallel
track.
