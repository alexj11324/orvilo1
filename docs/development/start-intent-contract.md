# Start-intent contract (R05 / F09)

Under ACP there is exactly one way a run starts: `execAgent` prepares the turn
and dispatches through `dispatchHeteroAgent`, which writes the durable
`agent_operations` row already `status: 'running'` (`recordStart`). There is no
step queue and no durable "prepared but not started" intent — a legal queued
start is always a fresh `execAgent` dispatch, never a release of a parked row.

That makes the retired lobehub-era surfaces compatible only as an
**ensure-started** contract. This document pins the semantics.

## `execAgent` / `execAgents` — the `autoStart` flag

`autoStart` is a retired deferred-start flag kept on the wire schema for shape
compatibility. Every accepted run is dispatched inside the call, so the
contract is binary:

| `autoStart`  | Result                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| omitted/true | Run is dispatched; `autoStarted: true` in the result.                                                                                                                                                                                   |
| `false`      | Rejected **before any side effect** — no thread, message, topic or `agent_operations` row, no dispatch. `execAgent` → `BAD_REQUEST`; `execAgents` reports the task as `success: false` in `results` (batch calls never throw per-task). |

To run later, schedule a new run (`scheduleAgentRun`) — there is nothing to
"start" retroactively.

## `aiAgent.startExecution` — ensure-started assertion

`startExecution` can never mint a new run. Its outcomes:

| Operation state                                          | Result                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `running`, `waiting_for_human`, `waiting_for_async_tool` | `{ success: true, scheduled: false, alreadyStarted: true }` — idempotent ack. Repeat intents return the same ack and never dispatch a second run.            |
| `done`, `error`, `interrupted`, `abandoned`              | `AgentStartError('terminal')` → `CONFLICT`.                                                                                                                  |
| `idle` row or orphan metadata                            | `AgentStartError('never_dispatched')` → `PRECONDITION_FAILED`. The intent was prepared but no dispatch exists to release — the caller must submit a new run. |
| Unknown operation id                                     | `AgentStartError('not_found')` → `NOT_FOUND`.                                                                                                                |

`scheduled` is always `false` in a success result: there is no queue to
schedule onto. Callers must not read `success: true` as "a run was just
started" — only `alreadyStarted: true` exists, meaning the operation's single
run is live.

## Why rejection instead of deferred dispatch

An `idle` operation row carries no dispatch inputs — prompt, resolved agent
config, tool surface and device binding are all produced inside `execAgent`'s
preparation pipeline and were never persisted for a later release.
Reconstructing them would require new durable start-intent machinery; the rest
of the system already treats a prepared-but-never-dispatched row as
unrecoverable (see `InterventionService`, which classifies such rows as
`missing`). Failing closed keeps one truth: **an accepted start request either
is a real dispatch or an explicit, typed rejection — never a silent no-op.**
