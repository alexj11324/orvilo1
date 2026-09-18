export type HatchetDispatchStatus =
  'cancelled' | 'completed' | 'failed' | 'pending' | 'queued' | 'running';

/** Sensitive workflow input stays in Postgres; Hatchet receives only the row id and opaque lane. */
export interface HatchetDispatchPayload {
  body: unknown;
  headers?: Record<string, string>;
  path: string;
  workflowRunId: string;
}
