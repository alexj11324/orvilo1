# Heterogeneous Agent Debug Workflow

## Contents

1. Pipeline map
2. Capture raw CLI traces first (incl. in-app live traces)
3. Compare raw and adapted events
4. Check step boundaries before persistence
5. Check tool persistence invariants
6. Focused tests
7. Repro-to-fix workflow
8. Verify a structured-field classifier against a real trace

## 1. Pipeline Map

```
ACP endpoint process (vendor `*-acp` mode or upstream bridge binary)
  -> AcpStdioClient (Electron main, JSON-RPC stdio)
  -> AcpAgentSession subclass (initialize -> session/new|load -> session/prompt)
  -> session/update notifications -> AgentStreamPipeline -> adapter
  -> heteroAgentEvent broadcast
  -> executeHeterogeneousAgent(...)
  -> persistToolBatch / persistToolResult
  -> createGatewayEventHandler(...)
  -> UI hydration
```

Reverse requests (`session/request_permission`, `elicitation/create`) become
`AskUserBridge` intervention cards when a bridge is attached to the session.

Start at the leftmost broken layer. Do not jump straight to UI rendering unless raw and adapted events already look correct.

## 2. Capture Raw CLI Traces First

### In-app live traces (the faithful capture — prefer this)

The running app already records every agent session it spawns. This is the most
faithful trace you can get, because it captures the **exact** spawn command,
env keys, cwd, ACP prompt blocks, model, and `resumeSessionId` that the app used —
things a hand-rolled repro will not reproduce. Reach
for this before reproducing manually. The recorder lives in
`apps/desktop/src/main/controllers/HeterogeneousAgentCtr.ts`
(`createCliTraceSession`, `shouldTraceCliOutput`, `resolveTraceRootDir`).

When it records:

- **Dev build** (`!app.isPackaged`): always.
- **Packaged build**: only when the user flips the Help-menu developer toggle
  (`heteroTracingEnabled`). Off by default so normal runs aren't polluted.
- Never under `NODE_ENV=test`.

Where it writes:

- Toggle **off** (plain dev run): `<cwd>/.heerogeneous-tracing/` — i.e. inside
  the repo you're running against. (Yes, the dir name is misspelled
  `heerogeneous`; it is the real path.)
- Toggle **on**: `<appStoragePath>/heteroAgent/tracing/` — keeps traces out of
  the user's project. This is the only path packaged builds ever use.

Layout per session — `.../<agentType>/<YYYYMMDD-HHMMSS>-<sessionId>/`:

- `meta.json` — spawn `args`, `command`, `cwd`, `envKeys`, `model`,
  `resumeSessionId`/`agentSessionId`, attachment summaries. **Read this first**
  to know exactly which ACP endpoint was spawned (vendor binary, bridge
  binary, or a `bunx`/`npx` package-runner fallback) and with what env.
- `stdin.txt` — the `session/prompt` content-block array sent over JSON-RPC.
- `stdout.jsonl` — the raw ACP JSON-RPC stream from the agent (the trace you
  actually read: `session/update` notifications and request/response pairs).
- `stderr.log` — endpoint stderr (also carries skipped-config-option notes).
- `exit.json` — `{ code, signal, finishedAt }`.

`.heerogeneous-tracing/.last-live-trace` always points at the most recent
session dir, so the fast path to "what just happened" is:

```bash
dir=$(cat .heerogeneous-tracing/.last-live-trace)
cat "$dir/meta.json"      # how the CLI was spawned
wc -l "$dir/stdout.jsonl" # raw event count
```

Reproduce the same session yourself by reusing the recorded `meta.json`
`command`/`args`/`envKeys` — for ACP agents the endpoint speaks JSON-RPC, so
prefer driving it through `apps/cli`'s hetero exec path (`spawnAgent`) rather
than hand-writing `session/prompt` frames.

### What the wire looks like

Every ACP agent emits the same envelope:

- `initialize` / `session/new` / `session/prompt` request+response pairs
- `session/update` notifications carrying `sessionUpdate` discriminators:
  `agent_message_chunk`, `tool_call`, `tool_call_update`,
  `config_option_update`, …
- reverse requests: `session/request_permission`, `elicitation/create`

If the raw `session/update` stream already merges tools or drops a
`tool_call_update`, the adapter is innocent. If the wire emits independent
updates but the UI collapses them, the bug is downstream.

## 3. Compare Raw And Adapted Events

In dev builds, `executeHeterogeneousAgent` stores raw lines plus adapted events on:

- `window.__HETERO_AGENT_TRACE`

Use that trace to compare:

- raw `session/update` entries (`tool_call`, `tool_call_update`, `agent_message_chunk`)
- adapted `stream_chunk { chunkType: 'tools_calling' | 'tool_state' | 'text' | 'reasoning' }`
- adapted `tool_result`
- adapted `tool_end`

For the standard-ACP agents, the usual mapping is:

- raw `tool_call` -> `tool_start` (+ `tools_calling` chunk)
- raw `tool_call_update` running -> `tool_state` chunk (`snapshotMode: 'replace'`)
- raw `tool_call_update` completed/failed -> `tool_result` + `tool_end`
- raw `agent_message_chunk` -> `stream_chunk(text)`
- raw `agent_thought_chunk` -> `stream_chunk(reasoning)`

If the raw trace is right but adapted events are wrong, fix the adapter before touching persistence.

## 4. Check Step Boundaries Before Persistence

This is the first thing to verify for "mixed tools in one assistant" bugs.

### Standard ACP agents (TraeAcpAdapter family)

Step boundaries come from the stream lifecycle in `AgentStreamPipeline` — a
`stream_end` + `stream_start { newStep: true }` pair is emitted when the step
index advances. Verify:

- one `tool_call` id maps to one stable `ToolCallPayload.id`
- a terminal `tool_call_update` emits exactly one `tool_result`/`tool_end`
- `tool_call_update` for a never-seen id still opens the tool row first
- `session_configured` model/usage baselines never surface as user-visible text

### Claude Code / Codex via bridges

Vendor-specific stream semantics (Claude `message.id` turn boundaries, Codex
`item.*` kinds) are normalized by the upstream bridge before they reach us —
when a boundary bug reproduces on the wire, compare the bridge's
`session/update` output against the adapter, not a vendor stream-json trace.

Relevant files:

- `packages/heterogeneous-agents/src/adapters/traeAcp.ts`
- `src/store/chat/slices/agentRun/actions/transports/hetero/heterogeneousAgentExecutor.ts`

## 5. Check Tool Persistence Invariants

Read `persistToolBatch` and `persistToolResult` before changing UI code.

### `persistToolBatch`

The expected order is:

1. Pre-register assistant `tools[]`
2. Create `role: 'tool'` messages
3. Backfill `result_msg_id` onto assistant `tools[]`

If tool rows are created before assistant `tools[]` are registered, orphan tool messages are likely.

### `persistToolResult`

`tool_result` must resolve the tool row through `toolMsgIdByCallId`.

Warning signs:

- `tool_result for unknown toolCallId`
- tool rows with empty content forever
- missing `result_msg_id`

For Claude Code, remember that tool results originate from raw `type: 'user'` events.

### Main vs subagent scope

- Main-agent tool state is per-step.
- `toolMsgIdByCallId` is global across main and subagent scopes.
- Subagent chunks must not be forwarded into the main gateway handler.

If subagent events leak to the main handler, the main bubble can inherit the wrong `tools[]` and content.

## 6. Focused Tests

Run the smallest useful test set first.

```bash
bunx vitest run --silent='passed-only' 'packages/heterogeneous-agents/src/adapters/codex.test.ts'
bunx vitest run --silent='passed-only' 'packages/heterogeneous-agents/src/adapters/claudeCode.test.ts'
bunx vitest run --silent='passed-only' 'src/store/chat/slices/agentRun/actions/__tests__/heterogeneousAgentExecutor.test.ts'
```

Especially useful places:

- `packages/heterogeneous-agents/src/adapters/codex.test.ts`
- `packages/heterogeneous-agents/src/adapters/claudeCode.test.ts`
- `src/store/chat/slices/agentRun/actions/__tests__/heterogeneousAgentExecutor.test.ts`

Claude Code-specific assertions worth adding when fixing bugs:

- same `message.id` does not emit `newStep`
- changed `message.id` does emit `stream_end` plus `stream_start { newStep: true }`
- partial text/thinking is emitted once
- `tool_result` from `user` events reaches the right tool row
- subagent chunks carry `subagent.parentToolCallId`
- TodoWrite result synthesizes `pluginState.todos`

When the bug comes from a real trace, distill it into the closest existing test file instead of relying on manual UI-only repros.

## 7. Repro-To-Fix Workflow

1. Capture a raw trace and save it under `.heerogeneous-tracing/`.
2. Confirm whether the bug appears in raw events, adapted events, or persistence.
3. Add or update the narrowest failing test near the broken layer.
4. Fix the smallest layer that can explain the symptom.
5. Re-run focused tests.
6. Only then do an Electron smoke test under the acceptance process (`.agents/acceptance/`) if UI confirmation is still needed.

Do not start with a broad Electron repro if a raw trace or adapter test can prove the fault zone faster.

## 8. Verify A Structured-Field Classifier Against A Real Trace

Whenever the adapter **branches on a structured field** from the raw stream —
`status`, `usage`, `rateLimitType`, `stop_reason`, `parent_tool_use_id`,
`subtype`, etc. — do not trust your mental model of the wire format. The field
you key on almost always also appears on **benign / non-target** events, and a
classifier that ignores the surrounding state will misfire on those.

The procedure (recurring — run it every time):

1. Pull the most recent real session: `dir=$(cat .heerogeneous-tracing/.last-live-trace)`.

2. Grep the field across **every** event state, not just the failing one, and
   count by co-occurring state. Example:

   ```bash
   # Which event statuses carry a rate_limit_info block?
   grep -o '"status":"[a-z]*"' "$dir/stdout.jsonl" | sort | uniq -c
   grep -c 'rate_limit_info' "$dir/stdout.jsonl"
   ```

3. If the field rides on states you did not account for, the classifier needs an
   extra gate. Add the trace as a fixture/assertion to the adapter test so the
   regression can't come back.

### Worked example: CC usage-limit vs. transient throttle (`fix/cc-rate-limit-quota-misclassify`)

- **Symptom:** an unrelated terminal failure (e.g. an `ECONNRESET` network drop)
  rendered a bogus "usage limit reached, resets at X" guide.
- **What the trace showed:** Anthropic stamps a `rate_limit_info` block —
  carrying `resetsAt` and `rateLimitType` (e.g. `seven_day`) — onto events even
  when the request **goes through** (`status: "allowed"`). In real traces those
  reset-window fields appear on \~all `rate_limit_info` blocks, the vast majority
  of which are `allowed`, not `rejected`. So the window is rolling-window
  _metadata for an allowed call_, NOT evidence the limit was hit.
- **The bug:** `isUserQuotaRateLimit` keyed only on the presence of a reset
  window (`info.resetsAt != null || info.rateLimitType != null`). A later
  terminal error inherited the last allowed event's window → false positive.
- **The fix:** require `status === 'rejected'` **and** a concrete reset window.
  A bare `rejected` with no window is the transient server throttle → leave it
  to the overloaded (retry) classifier. Status codes (429 / 529) and message
  text are deliberately not consulted — only this structured signal decides the
  guide.
  - `packages/heterogeneous-agents/src/adapters/claudeCode.ts` →
    `isUserQuotaRateLimit`
  - regression assertions in
    `packages/heterogeneous-agents/src/adapters/claudeCode.test.ts`

The general lesson: a field's **presence** is not its **meaning**. Confirm which
event states a discriminator field co-occurs with in a real recorded trace
before branching on it.
