# Prime runner upstream-capability unseal

Owner's call, verbatim: 上游有什么能力，我们就应该有什么能力 — complete unseal,
not selective. The vendored `@earendil-works/pi-*` SDK defaults become the
device defaults wherever a layer can carry them. What stays sealed is the
_credential architecture_ — zero-credential `AuthStorage`, a single-provider
`ModelRegistry` (`orvilo-broker` only), telemetry off, broker-only inference
egress, artifact pin verification, lease bounds — not capability.

Shipped in three layers: protocol v2 wire schema (additive) → runner unseal +
broker passthrough → host/pipeline/ledger/UI surfacing.

## Layer A — protocol v2 (`harnessProtocol.ts`)

`HARNESS_PROTOCOL_VERSION = 2`. The v1 wire was structurally text-only; v2 keeps
the sanitization property (no endpoints, no credentials, no absolute paths on
the wire) and expands expressiveness:

- `SanitizedContentBlock` — `text` / `thinking` / `image` / `toolCall` block
  forms; `SanitizedMessageContent = string | SanitizedContentBlock[]`.
- `SanitizedInferenceMessage` — `system` / `user` / `assistant` (blocks, incl.
  `toolCall`) / `tool` (result for a `toolCallId`) roles.
- `SanitizedInferenceRequest` — `tools` (tool schemas — without definitions on
  the wire the model could never emit `tool_calls`), `thinkingLevel`,
  `serviceTier`, `providerOptions` passthrough.
- `BrokerStreamEvent` — `thinking_delta`, `toolcall_start` / `toolcall_delta` /
  `toolcall_end`.
- `HarnessSessionEvent` — `thinking`, `tool_call`, `tool_progress`,
  `tool_result` (names + args + results). `tool-violation` survives only for
  calls outside the negotiated tool surface.
- `HarnessInitModel` — real metadata (`contextWindow`, `input` modalities,
  `reasoning`) resolved from `ProviderModelCapability`.
- `HarnessInitParams` — `stateDir`, `resumeSessionId`; forward methods
  `session.resume` / `session.list`.

## Layer B — runner + broker (`packages/prime-harness`)

- **Tools**: `noTools` / `tools:[]` / `customTools:[]` all dropped — upstream's
  default `initialActiveToolNames` applies (default `ipython`; extension and
  ACP-MCP surface rides along). `capabilities.tools` in the init ack is the
  _actual_ activated list (`getActiveToolNames()`), not a schema constant.
- **Sessions**: `SessionManager` persists under `<agentDir>/sessions`
  (`agentDir = init.stateDir ?? <workspace>/.prime/agent`). Init with
  `resumeSessionId` reopens `<sessionDir>/<id>.jsonl` via `SessionManager.open`
  — upstream ids are `uuidv7`, preserved across restarts. The ack's `sessionId`
  echo of the requested id is the truth oracle for "really resumed".
- **Resources**: real `DefaultResourceLoader` (+ `reload()`) against the device
  workspace/stateDir — the device workspace is the trust boundary.
- **MCP**: real `McpManager` — user/global MCP servers come from the real
  `SettingsManager` under `agentDir`; the connection store persists as
  `mcp-connections.json`. Orvilo-managed path only — no arbitrary device-side
  MCP config is minted.
- **Thinking**: `thinkingLevel` is not pinned `off` — upstream resolves
  saved-session → settings default → `DEFAULT_THINKING_LEVEL`, then clamps to
  `model.reasoning` (which now rides `HarnessInitModel.reasoning` from the
  issued binding's `ProviderModelCapability`).
- **Broker bridge** (`broker.ts`): carries the v2 block shapes both directions.
  Upstream content is sequential — at most one text/thinking block open; tool
  calls own provider `index` keys (falling back to `toolCallId`). A pump that
  saw `tool_calls` reports `stopReason:'toolUse'`; tool calls are NOT executed
  host-side — they run inside the runner's agent session on the device.
- **Events** (`events.ts`): `tool_execution_start/_update/_end` →
  `tool_call`/`tool_progress`/`tool_result`; `thinking_delta` → `thinking`;
  `toolcall_*` assistant events stay internal (they reconstruct the assistant
  message, not ledger rows). `toolUse` stop → error ("Run ended on unexecuted
  tool calls") — a tool ending up unexecuted is a real anomaly, not a normal
  end.

## Layer C — contracts (`contracts.ts`)

`InferenceMessage` / `InferenceRequest` / `InferenceEvent` / `RuntimeEvent`
mirror the v2 wire richness (blocks, tool_calls, thinking, `toolcall_*`,
`serviceTier`, `providerOptions`). `RuntimeCapabilities.resume` gains honest
tiers (`'none' | 'acp-load' | 'session-path' | 'rpc-switch'`) +
`resume({session, sessionPath?})` — embedded runtime stays `'none'`; the device
path resumes via `HarnessInitParams.resumeSessionId`.

## Layer D — host/pipeline

- `composeDevicePrimeRun` maps `ProviderModelCapability` → descriptor `model`
  (`input` = `['text','image']` when `images` capability, `contextWindow`,
  `reasoning`) → `HarnessInitModel`.
- `providerBinding/controlPlane.infer` passes `tools` → OpenAI `tools`,
  `reasoning_effort`, `service_tier`, `providerOptions`; both stream and
  non-stream paths surface `tool_calls` + `reasoning_content`.
- `admitPrimeDeviceRun` rebuild branch locates the persisted session
  (`~/.orvilo/prime-state/*/sessions/<resumeSessionId>.jsonl`) and reuses its
  stateDir so a restart is a real resume — `resumeOutcome` flips
  `rebuilt`→`resumed` on the ack-echo oracle.
- `primeEmbeddedRuntime` drops the `tools.length !== 0` handshake rejection and
  maps the new harness events onto `RuntimeEvent`.

## Layer E — ledger + chat surfacing

`packages/agent-execution/src/controlPlane/primeStreamMapping.ts` translates
the v2 surfacing events into the exact `AgentStreamEvent` vocabulary the
heterogeneous adapters emit, so Prime activity lands on the same ledger rows
and chat renders it unchanged — the ingest reducers are agentType-agnostic:

- `thinking` → `stream_chunk{chunkType:'reasoning'}` (persisted to
  `messages.reasoning`).
- `tool_call` → `stream_chunk{chunkType:'tools_calling', toolsCalling:[…cumulative]}` +
  `tool_start{toolCalling, toolCallId}` — cumulative per turn like the pi
  adapter's `stepToolCalls`; each payload is
  `{apiName, arguments, id, identifier:'orvilo', type:'default'}` and lands on
  `messages.tools`.
- `tool_progress` → `stream_chunk{chunkType:'tool_state', toolCallId,
pluginState, snapshotMode:'replace', snapshotSeq}` — seq monotonic per
  `toolCallId`.
- `tool_result` → `tool_result{content, isError, toolCallId, state?}` +
  `tool_end{isSuccess, toolCallId, result, payload:{toolCalling}}` — the
  re-attached payload lets the renderer resolve the call by id.

Both producers consume the one mapper: the embedded drive loop maps
`RuntimeEvent`s inside `driveEmbeddedCanonicalRun`, and the device-side session
pump in `apps/cli/src/device/primeRun.ts` maps `HarnessSessionEvent`s per op
(`PrimeStreamOperation.streamState` — per-turn bookkeeping). `tool-violation`
never reaches the mapper: it remains a fail-closed error at each call site for
calls outside the negotiated surface.

## SDK surface enabled vs deferred

Enabled: default builtin toolset, persistent sessions + resume, real
resource loader (skills/AGENTS.md context), MCP manager (user/global servers +
persistent connection store), settings manager (telemetry pinned off, default
thinking level), `getActiveToolNames` capability advertisement, stream
`reasoning`/`serviceTier`/`thinkingBudgets` provider options.

Deferred (conscious, reported): `sessionStartEvent` (no host contract
consumer), `thinkingBudgets` beyond the provider-options passthrough (no UI
surface), `autonomous` continuation policy (host owns turn lifecycle; no
contract field), RLM/`subagentRuntimeHost` (a real sub-agent host surface would
invent wire contracts the ledger has no vocabulary for — needs its own
package).

## Runnable builtins in the shipped image

- `ipython` — runnable: the tool self-provisions a `uv` venv + `prime-agent-runtime`
  kernel lazily on first use; the image now carries `curl` + `ca-certificates`
  for that bootstrap (needs outbound PyPI access at first run — degrades to a
  clear tool error, never a silent de-tool).
- Extension/ACP-MCP tools — conditional: whatever MCP servers the device
  settings declare, plus extension-registered builtins; the ack's
  `capabilities.tools` reports the actually-activated set per run.
- `bash`/`edit` style shell builtins — present in the vendored SDK's builtin
  catalog but NOT in the default session's active set upstream; we match
  upstream (not special-casing them in).

## Still sealed — non-negotiable

Zero credentials in `AuthStorage` (`apiKey:'embedded'` is the upstream-required
non-empty sentinel, never a real credential); `orvilo-broker` is the only
registered provider (its `streamSimple` IS the broker bridge — all inference
exits through the host); telemetry off; artifact pin (version + sha256 +
provenance commit) re-verified at every spawn; leases stay bounded.
