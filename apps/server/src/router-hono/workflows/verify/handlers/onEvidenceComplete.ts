import type { Context } from 'hono';

/** Acknowledge stale legacy jobs without ledger writes or retrying the retired engine. */
export async function onEvidenceComplete(c: Context) {
  return c.json({ success: true, skipped: 'legacy_verify_retired' });
}
