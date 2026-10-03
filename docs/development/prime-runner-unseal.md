# Prime runner upstream-capability unseal

Owner directive: upstream parity — the Prime runner exposes every capability
the vendored `@earendil-works/pi-*` stack provides by default, end to end
(「上游有什么能力，我们就应该有什么能力」). The credential architecture stays
sealed: zero-credential `AuthStorage`, the single `orvilo-broker` provider as
the only inference egress, telemetry off, artifact pin verification, and
bounded leases are unchanged.

This document tracks the three-layer delivery.

## Layer map

### Layer A — harness protocol v2 + contracts (this PR, additive)

`packages/agent-execution/src/controlPlane/harnessProtocol.ts` and
`contracts.ts` gain the shapes the wire needs to carry tools and thinking.
No behavior change lands here: the shipped runner still speaks the text-only
subset and no sender produces the new shapes yet.

- `HARNESS_PROTOCOL_VERSION` bumps `1 → 2`. The runner and the host validate
  the version at `harness.init`; a v1 runner against a v2 host (or the
  reverse) fails init honestly instead of silently degrading on the wider
  wire.
- `SanitizedInferenceMessage` gains the content-block form
  (`text` / `thinking` / `image` / `toolCall`, mirroring pi-ai
  `Message.content`) and the `tool` role (`toolCallId`, `toolName`,
  `isError`). Plain-string content stays valid.
- `SanitizedInferenceRequest` gains `tools` (the tool schemas the model may
  call — without them the model cannot emit `tool_calls`), `thinkingLevel`,
  `serviceTier`, and an opaque `providerOptions` pass-through for whatever
  the issued binding grants.
- `BrokerStreamEvent` gains `toolcall_start` / `toolcall_delta` /
  `toolcall_end` (index-keyed for parallel calls) and `thinking_delta`.
- `HarnessSessionEvent` gains `thinking`, `tool_call`, `tool_progress`,
  `tool_result`. `tool-violation` survives only as the fail-closed invariant
  for _undeclared_ tools — a tool event outside the negotiated allowlist
  still means upstream escaped the sandbox.
- `HarnessInitModel` carries `reasoning`, `input` modalities and
  `contextWindow`, resolved from `ProviderModelCapability` (which gains
  `reasoning` + `contextWindow` in `contracts.ts`).
- `HarnessInitParams.resumeSessionId` plus the `session.resume` /
  `session.list` forward methods are registered — implemented in layer B.
- `InferenceMessage`/`InferenceRequest`/`InferenceEvent`/`RuntimeEvent` are
  widened to parity, and `toInferenceMessage` preserves the discriminated
  union across the broker seam (the old `.map(({ role, content }))`
  silently dropped `toolCallId`).

### Layer B — runner unseal + broker passthrough (PR2)

`packages/prime-harness` boots the upstream default session:

- `noTools:'all'`/`tools:[]`/`customTools:[]` are dropped → upstream default
  toolset (the session-level default is `ipython`; bash/edit factories exist
  upstream but are not wired into the default session set).
- `EmptyResourceLoader` → `DefaultResourceLoader` on the device workspace +
  stateDir. The workspace mount on the device is the trust boundary.
- `SessionManager.inMemory` → persistent `SessionManager` under the device
  stateDir → real resume: `HarnessInitParams.resumeSessionId` reopens the
  `<stateDir>/sessions/<id>.jsonl` file via `SessionManager.open`; the ack's
  `sessionId` reports the true upstream id so the host detects
  resumed-vs-rebuilt by comparison.
- `SettingsManager` becomes persistent under `agentDir` with
  `setTelemetryEnabled(false)` applied (telemetry stays sealed through the
  persisted settings file).
- `McpManager` becomes real: `getUserServers → getGlobalMcpServers()`, a
  persistent `McpConnectionStore` under `agentDir`. Orvilo has no managed
  MCP registry today, so the managed settings file under the host-owned
  `agentDir` is the managed path — no arbitrary device-side config is
  invented.
- `agentDir` = device stateDir; `thinkingLevel` falls back to the upstream
  default clamped by `model.reasoning`; `brokerModel.reasoning` /
  `input` / `contextWindow` become passthroughs of `HarnessInitModel`.
- `broker.ts` `sanitizeMessages` carries block-form content + `tool` roles
  both directions and relays `tools`/`thinkingLevel`/`serviceTier`/
  `providerOptions` to `broker.infer`; `broker.event` `toolcall_*` and
  `thinking_delta` pump into the upstream `AssistantMessageEventStream`.
- `events.ts` maps `tool_execution_*` → `tool_call`/`tool_progress`/
  `tool_result`, `thinking_delta` → `thinking`; `toolUse` stopReason reports
  an honest `Run ended on unexecuted tool calls` error.
- `capabilities.tools` in the init ack advertises the actual enabled tool
  names (`session.getActiveToolNames()`).
- `session.resume`/`session.list` handlers implemented.
- Server side: `SqlTrustedProviderBackend` sends `tools` and parses
  `delta.tool_calls` (+ non-SSE `message.tool_calls`) into `toolcall_*`
  inference events; `capabilities.tools`/`reasoning` go honest;
  `primeBroker.isInferBody` accepts the v2 shapes and `toBrokerEvent` relays
  them.

Deferred consciously: `sessionStartEvent`, `thinkingBudgets` beyond the
upstream default clamp, `autonomous` policy, and the RLM/subagent runtime
host surface — none have a host contract consumer in this package; enabling
them without a consumer invents wire surface. They are candidates for a
follow-up package once the ledger/UI wants them.

### Layer C — host/pipeline/ledger/UI surfacing (PR3)

`primeEmbeddedRuntime` drops the `tools.length !== 0` handshake rejection;
`primeDeviceRun`/`embeddedDispatch`/`embeddedChatDispatch`/
`devicePrimeDispatch` consume `ProviderModelCapability.tools/images` and
advertise real capabilities; tool activity lands on the ledger the same way
hetero `ToolCallPayload`s do (`stream_chunk{tools_calling}` /
`tool_state` / `tool_end`); Prime tool calls render in the conversation
feed at parity with hetero.

## ipython runtime provisioning (honest capability)

The upstream default toolset is literally `{ipython}` — an IPython kernel
the SDK provisions lazily on first tool call: it installs `uv` via
`curl -LsSf astral.sh/uv/install.sh | sh`, then `uv python install`, then
`uv pip install prime-agent-runtime` (preferring the vendored runtime
source when present), all under `$PRIME_AGENT_KERNEL_VENV` (default
`~/.prime/agent/kernel-venv`). The shipped `node:22-bookworm-slim` image
lacks both python and `curl`; the Dockerfiles gain `curl` so the lazy
provisioner can run. Whether `uv` can actually reach astral.sh and PyPI
inside the device sandbox is an acceptance-matrix question — the report
states which builtins are runnable rather than guessing.

## Boundaries that did not move

- All inference still exits through the host broker — `streamSimple` is the
  only provider path; `broker.infer` carries the widened request shape, the
  runner still holds zero credentials.
- `providerOptions`/`serviceTier`/`thinkingLevel` are _pass-throughs_: the
  host decides what the issued binding grants; the runner forwards what the
  session negotiated.
- `session.resume`/`session.list` are forward methods (host → runner); no
  host-mediated tool execution is introduced — tools execute inside the
  runner on the device.
