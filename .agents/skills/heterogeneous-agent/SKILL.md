---
name: heterogeneous-agent
description: 'Use for Claude Code/Codex external-agent adapters, IPC, event mapping, sessions, persistence and tool-call chains.'
---

# Heterogeneous Agent Development

Use this skill when the bug or feature lives in the external CLI agent pipeline, not the normal server-side agent runtime.

## Use This Skill For

- Adding or changing a driver under `apps/desktop/src/main/modules/heterogeneousAgent/drivers/`
- Editing an adapter under `packages/heterogeneous-agents/src/adapters/` or an ACP session under `packages/heterogeneous-agents/src/spawn/`
- Debugging the ACP stdio pipeline (`AcpStdioClient`, `session/update` notifications, `heteroAgentEvent` broadcast), `window.__HETERO_AGENT_TRACE`, or `executeHeterogeneousAgent`
- Fixing adapter bugs such as duplicate partial/full chunks, broken message/turn boundaries, missing `tool_result`, TodoWrite state drift, or subagent thread routing
- Fixing step-boundary, tool persistence, subagent thread, or resume bugs in ACP-agent flows
- Reproducing multi-tool mixing, orphan tool messages, or stuck tool-result loading

## Pipeline Map

1. Electron main resolves the ACP endpoint via `resolveAcpSpawnTarget` — native `*-acp` modes (`kimi acp`, `opencode acp`, `qoder --acp`, `codebuddy --acp`) or upstream bridge binaries (`claude-agent-acp`, `codex-acp`, `amp-acp`, `pi-acp`, falling back to a pinned `bunx`/`npx` package run when the bridge isn't installed)
2. `AcpStdioClient` spawns the endpoint and speaks JSON-RPC; an `AcpAgentSession` subclass runs `initialize` → `session/new`|`session/load` → `session/prompt`
3. `session/update` notifications feed `AgentStreamPipeline`; the adapter selected by the agent type maps them into `HeterogeneousAgentEvent`
4. Main broadcasts `heteroAgentEvent`; `executeHeterogeneousAgent` persists assistant/tool messages and forwards stream events
5. `createGatewayEventHandler` hydrates the UI
6. Reverse requests (`session/request_permission`, `elicitation/create`) become `AskUserBridge` intervention cards when a bridge is attached
7. Only after this path looks correct should you move on to `agent-tracing` or context-engine debugging

## Read These Files First

- `apps/desktop/src/main/controllers/HeterogeneousAgentCtr.ts`
- `apps/desktop/src/main/controllers/HeterogeneousAgentImpl.ts`
- `packages/heterogeneous-agents/src/spawn/acpRuntime.ts` (per-agent ACP endpoint registry)
- `packages/heterogeneous-agents/src/spawn/standardAcpSession.ts` (shared ACP session)
- `packages/heterogeneous-agents/src/spawn/acpStdioClient.ts` (stdio JSON-RPC transport)
- `packages/heterogeneous-agents/src/spawn/agentStreamPipeline.ts` (update → event boundary)
- `src/store/chat/slices/agentRun/actions/transports/hetero/heterogeneousAgentExecutor.ts`
- `src/store/chat/slices/agentRun/actions/__tests__/heterogeneousAgentExecutor.test.ts`

## Default Debug Order

1. Prove whether the raw ACP wire output is correct before touching UI code. The app records every real session — read the most recent one via `cat .heerogeneous-tracing/.last-live-trace` rather than hand-rolling a `claude -p` repro (see references/debug-workflow\.md §2). `stdout.jsonl` in the trace dir is the exact JSON-RPC stream.
2. If wire output is correct, compare it with adapter output. In dev, `executeHeterogeneousAgent` exposes `window.__HETERO_AGENT_TRACE`.
3. If adapted events look correct, inspect `persistToolBatch`, `persistToolResult`, step transitions, and subagent routing.
4. Turn the repro into a focused test before fixing.
5. Only after the transport/adapter/executor path looks sound should you debug later-stage message processing.

## Critical Invariants

- One raw tool item must map to one stable `ToolCallPayload.id`.
- A new main-agent step must emit a boundary signal before events are forwarded to the new assistant.
- In Claude Code, multiple assistant events with the same `message.id` are one turn, not multiple turns.
- In Claude Code, `tool_result` lives in `type: 'user'` events, not assistant events.
- In Claude Code partial mode, `message_delta.usage` is authoritative; do not trust echoed usage on every assistant block.
- `persistToolBatch` must pre-register assistant `tools[]` before creating tool messages.
- Every tool message must keep `parentId` equal to the owning assistant and `tool_call_id` equal to the tool id.
- `tool_result` must resolve an existing `toolMsgIdByCallId`.
- Subagent chunks must stay in thread scope and must not be forwarded into the main assistant stream.
- Never clear the global `toolMsgIdByCallId` map at main step boundaries.

## Common Bug Patterns

- Claude Code duplicates text or thinking:
  check whether partial deltas and the later full assistant block are both being emitted.
- Claude Code opens too many assistant messages:
  check whether the adapter is cutting steps on every assistant event instead of only on `message.id` changes.
- Claude Code tool results never land:
  check whether `type: 'user'` `tool_result` blocks are being ignored because the code only inspects assistant events.
- Claude Code TodoWrite cards look stale:
  check whether synthesized `pluginState.todos` is being attached at tool-result time.
- Claude Code subagent transcript leaks into the main bubble:
  check `parent_tool_use_id` handling and whether subagent chunks are being forwarded to the main gateway handler.
- Multiple Codex tools collapse into one assistant message:
  first check whether the adapter emits a usable step boundary such as `newStep` or an equivalent turn-change signal.
- Orphan tool messages:
  first check step-transition ordering and whether `persistToolBatch` Phase 1 ran before tool message creation.
- Tool bubble stays loading:
  look for `tool_result for unknown toolCallId` and missing `result_msg_id` backfill.
- Subagent tools show up in the main bubble:
  check for subagent chunks reaching the main gateway handler.
- Wrong terminal-error guide (e.g. "usage limit reached" shown for a network drop):
  a classifier is branching on a structured field whose mere presence isn't its meaning.
  Grep the field across all event states in a real trace before trusting it — see
  references/debug-workflow\.md §8 (CC `rate_limit_info` rides on `status: "allowed"` too).

## References

- For commands, trace capture, invariants, and focused test commands, read [references/debug-workflow.md](./references/debug-workflow.md).
- Live official-model compatibility checks are available only through explicit
  user invocation of `/testing-heterogeneous-agents` in Claude Code or
  `$testing-heterogeneous-agents` in Codex. Do not automatically load or run that
  skill during diagnosis. Its failed-cell evidence can be used here for diagnosis
  or a code fix.
