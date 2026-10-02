# Prompt-cache keep-alive

External agent CLIs run over ACP (`initialize → session/new|session/load →
session/prompt`). Provider-side prompt caches expire on inactivity, and a
cached prefix refreshes for free each time a request _reads_ the same prefix.
When a session sits idle between turns, the cache dies and the next real turn
re-pays a full prefix write — the cost pattern that burned Claude Code users
when Anthropic cut the default TTL 1h → 5m in March 2026.

Orvilo keeps the cache warm **per engine, per its own TTL economics**: after a
turn settles, the child process stays alive and a scheduler sends an _inert_
`session/prompt` turn on the SAME ACP session just under the TTL. The next
real prompt retires the keeper and spawns fresh — the new process's
`session/load` replays the same conversation prefix against the still-warm
provider cache (provider caches key on request content, not process identity).

## Where it lives

| Piece                        | Location                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Per-engine policy table      | `packages/heterogeneous-agents/src/spawn/cachePolicy.ts`                                                                                                                 |
| Scheduler (injectable clock) | `packages/heterogeneous-agents/src/spawn/cacheKeepalive.ts`                                                                                                              |
| Lifecycle hook               | `AcpAgentSession.run()` — arms after `settlePrompt` + `idle` status; `run()` resolves at turn end as before and the keeper owns the child until disarm                   |
| Keeper retirement            | `HeterogeneousAgentCtr.sendPromptWithStandardAcp` / `sendPromptWithDevinAcp` close the armed keeper before spawning the next turn's process                              |
| Telemetry                    | `HeterogeneousAgentRuntimeStatus.cacheKeepalive` (`pings`, `disarmReason`, `lastUsage`) on the `closed` status; `idleDeadlineAt` on `idle`; `exit.json` in the CLI trace |

## Engine policy table

| Engine                                                                                                      | TTL          | Ping interval | Break-even                         | Max window | Status                                                                                                  |
| ----------------------------------------------------------------------------------------------------------- | ------------ | ------------- | ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `claude-code` (+ `claude-sdk`, Prime-via-claude)                                                            | 300s         | 270s          | 12 pings (1.25× write / 0.1× read) | 56min      | verified Anthropic docs                                                                                 |
| `codex` (+ `codex-app-server`, Prime-via-codex)                                                             | 1800s        | 1650s         | 5 pings (1.25× / 0.25× assumed)    | \~2.3h     | GPT-5.6+ exact 30m TTL; earlier codex models \~5–10m — falls back gracefully                            |
| `devin`                                                                                                     | 300s assumed | 270s          | 12 pings                           | 56min      | **unverified** — own stack; `verify` flag in the policy, confirm via usage counters                     |
| `kimi-code`, `opencode`, `pi`, `qoder`, `amp`, `codebuddy`, `cursor`, `droid`, `grok-build`, `trae`, remote | —            | —             | —                                  | —          | `supportsKeepalive: false` pending per-adapter audit (provider caching unknown or no persistent prefix) |

`maxPings = floor(cacheWriteCostFactor / cacheReadCostFactor)` — computed,
not hardcoded. Residency ends at whichever comes first: `maxPings` pings
("breakeven") or `maxKeepaliveWindowMs` wall clock ("window").

## The inert turn

The ping is a real `session/prompt` on the live session — only a real request
refreshes the cache chain, and it must share the session's prefix shape or it
builds a separate chain that helps nothing. The prompt is a fixed minimal
text block asking for a single `.` reply. During an inert turn:

- `session/update` notifications are suppressed — nothing leaks into the
  run's event stream, UI, or history;
- `session/request_permission` answers `cancelled` and `elicitation/create`
  answers `cancel` — fail-closed, a ping never invokes tools;
- the `session/prompt` result's `usage` block (cache_read/cache_write
  counters when the provider surfaces them) is captured into
  `cacheKeepalive.lastUsage` telemetry.

The inert turn DOES append a minimal user turn to the agent's transcript —
that is what refreshes the chain; it is suppressed from our UI only.

## Disarm conditions (fail closed)

Any of: next real turn (`activity`), break-even reached (`breakeven`),
residency cap (`window`), ping failure (`ping_failed`), session end /
interrupt / error (`closed`/`error`). On disarm the child is closed and the
`closed` runtime status carries the telemetry.

## Boundaries

- **Between-turns only.** ACP sessions are spawned per turn, so the live
  process only exists after a settled turn. Mid-turn idles (permission asks,
  elicitation, long tool runs, rate-limit backoff) CANNOT be pinged — one ACP
  session does not accept concurrent `session/prompt`s and tool-running
  states are fail-closed by design. The keeper only warms the
  between-turns window.
- **Cross-resume cold start is out of scope.** A brand-new process's first
  turn still pays the resume write once; keep-alive prevents the _repeat_
  write that pure idle would cause.
- **CLI `hetero exec` runs** construct sessions with
  `cacheKeepalive: {enabled: false}` — the bridge process exits at turn end
  so a keeper could never ping again; it would only hold the event loop (or
  orphan the agent) for the residency window.

## Configuration

Enabled by default for capable engines. Env overrides:

| Variable                                        | Effect                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ORVILO_CACHE_KEEPALIVE=0` (`off`/`false`/`no`) | Global kill switch                                                                                                              |
| `ORVILO_CACHE_KEEPALIVE_<ENGINE>=0`             | Per-engine disable (`<ENGINE>` = uppercased agent type, `-`→`_`, e.g. `ORVILO_CACHE_KEEPALIVE_CLAUDE_CODE`)                     |
| `ORVILO_CACHE_KEEPALIVE_<ENGINE>_INTERVAL_MS`   | Ping cadence override                                                                                                           |
| `ORVILO_CACHE_KEEPALIVE_<ENGINE>_WINDOW_MS`     | Residency cap override                                                                                                          |
| `ORVILO_CODEX_PROMPT_CACHE_KEY=1`               | Opt-in: apply codex `prompt_cache_key` = ACP session id via `session/set_config_option` (codex-rs support pending verification) |

Per-session programmatic overrides live on `AcpAgentSessionOptions.cacheKeepalive`
(tests inject a fake `CacheKeepaliveClock` there).

## Verifying the win

Watch `heteroAgentRuntimeStatus` / the CLI trace `exit.json`: each `closed`
status reports `cacheKeepalive.pings` and `lastUsage`. On engines that report
cache counters (claude-code surfaces `cache_read_input_tokens` /
`cache_creation_input_tokens`), a warm turn should show high cache-read and
\~zero cache-creation on the resumed prefix. For `devin`, that telemetry is
the confirmation path for the assumed TTL.
