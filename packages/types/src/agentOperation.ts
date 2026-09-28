export type AgentOperationStatus =
  | 'abandoned'
  | 'done'
  | 'error'
  | 'idle'
  | 'interrupted'
  | 'running'
  | 'waiting_for_async_tool'
  | 'waiting_for_human';

export type AgentOperationCompletionReason =
  | 'cost_limit'
  | 'done'
  | 'error'
  | 'interrupted'
  | 'lease_expired'
  | 'max_steps'
  | 'waiting_for_async_tool'
  | 'waiting_for_human';

/**
 * Statuses a run cannot leave on its own — safe to settle a child op against
 * its parent. `idle`, `running`, `waiting_for_async_tool` and
 * `waiting_for_human` are all live states: a child parked on human input or a
 * still-queued child must never be mistaken for finished.
 */
export const TERMINAL_AGENT_OPERATION_STATUSES = [
  'abandoned',
  'done',
  'error',
  'interrupted',
] as const satisfies readonly AgentOperationStatus[];

export const isTerminalAgentOperationStatus = (status: string | null | undefined): boolean =>
  (TERMINAL_AGENT_OPERATION_STATUSES as readonly string[]).includes(status ?? '');

/**
 * Lifecycle of a durable judgment launch registration
 * (`agent_operation_launches`). The row is claimed atomically BEFORE any
 * external side effect (`execAgent`), keyed on the stable business request
 * identity; retries for the same key adopt the recorded launch instead of
 * spawning a second writer.
 *
 * `claimed` — registered, `execAgent` may still be in flight or its ACK lost.
 * `dispatched` — an `operationId` was bound after execAgent resolved.
 * `cancel_requested` — a durable cancel intent persisted (timeout/abort/
 * hang); reconcile then interrupts whatever operation landed.
 * `settled` — the run produced its terminal result.
 * `failed` — the launch never produced a usable operation (dispatch lost).
 */
export type AgentOperationLaunchStatus =
  'cancel_requested' | 'claimed' | 'dispatched' | 'failed' | 'settled';

export const LIVE_AGENT_OPERATION_LAUNCH_STATUSES = [
  'cancel_requested',
  'claimed',
  'dispatched',
] as const satisfies readonly AgentOperationLaunchStatus[];
