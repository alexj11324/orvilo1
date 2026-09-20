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
