import type { Context } from 'hono';

export interface OnVerifierCompletePayload {
  checkItemId: string;
  errorMessage?: string;
  hookId?: string;
  hookType?: string;
  operationId: string;
  parentOperationId: string;
  reason?: string;
  userId: string;
  workspaceId?: string;
}

/** Acknowledge stale legacy jobs without ledger writes or retrying the retired engine. */
export async function onVerifierComplete(c: Context) {
  return c.json({ success: true, skipped: 'legacy_verify_retired' });
}
