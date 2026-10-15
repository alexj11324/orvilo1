# ACP standardization audit

Where Orvilo implements something itself that the Agent Client Protocol (or the
bridge's ACP surface) already provides. Goal: prefer the standard mechanism.
Evidence column cites what was actually read; "unverified" means not checked.

Audited against `@agentclientprotocol/claude-agent-acp@0.76.0` (the pinned
bridge, `acpRuntime.ts`), read from the published package.

## Done in this change

| Concern | Was | Now | Evidence |
| --- | --- | --- | --- |
| AskUserQuestion for `claude-code` | Mounted the `orvilo_cc` MCP `ask_user_question` tool (duplicate of the built-in tool) | Not mounted. The bridge routes the built-in `AskUserQuestion` through `canUseTool` → ACP `elicitation/create` (form) when the client advertises `elicitation.form`, which `StandardAcpSession` already does and renders (`respondToElicitation`) | `acp-agent.js` `handleAskUserQuestion`, `disallowedTools` is only set when the client lacks `elicitation.form` |
| Resuming a session | Always `session/load` (replays the full history as `session/update`s, which we then discard) | `session/resume` when the agent advertises `sessionCapabilities.resume`, else `session/load` | bridge advertises `sessionCapabilities.resume`; `resumeSession` restores without replay, `loadSession` calls `replaySessionHistory` |

`orvilo_cc` is still mounted for builtin server-backed tools (MCP is the
standard way to give an ACP agent tools) and for `qoder`'s `ask_user_question`.

## Still custom — keep, with reason

| Item | Why it stays |
| --- | --- |
| Cache keep-alive (inert `session/prompt`) | Provider prompt-cache workaround; not an ACP concept |
| `orvilo_cc` builtin tools | Server-backed tools exposed over standard MCP |
| `x.ai/ask_user_question` handling in the Grok session | Vendor extension method, no standard equivalent |

## Open — needs verification before changing

| Item | Question |
| --- | --- |
| `qoder` `ask_user_question` MCP | Does `qoder --acp` emit `elicitation/create` for its ask tool? Closed-source CLI, not checked. If yes, drop the mount like `claude-code` |
| Session-title linger (`SESSION_TITLE_LINGER_MS`) | Exists because the child is killed at turn end. ACP already delivers titles via `session_info_update`; a persistent child makes the linger unnecessary |
| `cursor` / `devin` / `droid` / `grok` / `trae` custom session classes | Each uses `session/load` and bespoke handling. Check whether each now offers a standard ACP entry (resume, elicitation, config options) and can be folded into `StandardAcpSession` |
| `session/load` in the non-standard session classes | Same as the resume change above, per agent capability |
| Permissions: `initialPermission` via `session/set_config_option` / modes | Already standard; confirm each bridge's mode vocabulary instead of the per-agent presets |
