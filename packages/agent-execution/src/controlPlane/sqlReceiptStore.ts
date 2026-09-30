import { randomUUID } from 'node:crypto';

import type { DurableReceiptStore, RecoverableReceiptStore } from './actionGateway';
import type { DurableReceipt } from './contracts';

export interface ReceiptSql {
  query: <T>(sql: string, parameters?: unknown[]) => Promise<{ rows: T[] }>;
}

/** Same shape as journal 0199. Isolated tests may apply it when the migration has not run. */
export const ACTION_RECEIPT_SCHEMA_SQL = `
CREATE TABLE action_receipts (
  id text PRIMARY KEY,
  reservation_key text NOT NULL UNIQUE,
  owner_token text NOT NULL,
  receipt jsonb NOT NULL
);`;

/** Durable reservation ownership never expires: an ambiguous effect must be reconciled,
 * never automatically repeated by a new process. The token remains inside this adapter. */
export class SqlDurableReceiptStore implements DurableReceiptStore, RecoverableReceiptStore {
  private readonly owners = new Map<string, string>();

  constructor(private readonly database: ReceiptSql) {}

  async reserve(key: string, input: DurableReceipt) {
    const receipt = structuredClone(input);
    if (!key || !receipt.id || receipt.status !== 'prepared')
      throw new Error('Invalid receipt reservation');
    const token = randomUUID();
    // Conflict UPDATE locks and returns the committed winner even when two callers
    // race. A SELECT following ON CONFLICT DO NOTHING could miss a concurrent winner.
    const result = await this.database.query<{ owner_token: string; receipt: DurableReceipt }>(
      `
      INSERT INTO action_receipts (id, reservation_key, owner_token, receipt)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (reservation_key) DO UPDATE SET reservation_key=action_receipts.reservation_key
      RETURNING owner_token, receipt`,
      [receipt.id, key, token, JSON.stringify(receipt)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Receipt reservation returned no row');
    const claimed = row.owner_token === token;
    if (claimed) this.owners.set(key, token);
    return { claimed, receipt: row.receipt };
  }

  async save(key: string, input: DurableReceipt) {
    const token = this.owners.get(key);
    if (!token) throw new Error('Receipt reservation is owned by another instance');
    const receipt = structuredClone(input);
    // Only progress fields can differ. Identity, fence and digest remain immutable,
    // including any future fields not explicitly listed as mutable here.
    const result = await this.database.query<{ id: string }>(
      `
      UPDATE action_receipts SET receipt=$3::jsonb
      WHERE reservation_key=$1 AND owner_token=$2
        AND (receipt - ARRAY['status','updatedAt','evidence','error']) =
            ($3::jsonb - ARRAY['status','updatedAt','evidence','error'])
        AND ($3::jsonb->>'updatedAt')::numeric >= (receipt->>'updatedAt')::numeric
        AND CASE receipt->>'status'
          WHEN 'prepared' THEN $3::jsonb->>'status' IN ('applied','failed','outcome_unknown')
          WHEN 'applied' THEN $3::jsonb->>'status' IN ('verified','failed','outcome_unknown')
          ELSE false
        END
      RETURNING id`,
      [key, token, JSON.stringify(receipt)],
    );
    if (result.rows.length !== 1) throw new Error('Receipt owner, identity or transition changed');
  }
  async read(key: string) {
    const result = await this.database.query<{ receipt: DurableReceipt }>(
      'SELECT receipt FROM action_receipts WHERE reservation_key=$1',
      [key],
    );
    return result.rows[0]?.receipt;
  }

  async claimRecovery(key: string, expected: DurableReceipt) {
    const token = randomUUID();
    const result = await this.database.query<{ id: string }>(
      `
      UPDATE action_receipts SET owner_token=$3
      WHERE reservation_key=$1 AND receipt=$2::jsonb
        AND receipt->>'status' IN ('prepared','applied','outcome_unknown')
      RETURNING id`,
      [key, JSON.stringify(expected), token],
    );
    return result.rows.length === 1 ? token : undefined;
  }

  async finishRecovery(
    key: string,
    token: string,
    expected: DurableReceipt,
    verified: DurableReceipt,
  ) {
    if (verified.status !== 'verified' || !verified.evidence.length) return false;
    const result = await this.database.query<{ id: string }>(
      `
      UPDATE action_receipts SET receipt=$4::jsonb
      WHERE reservation_key=$1 AND owner_token=$2 AND receipt=$3::jsonb
        AND receipt->>'status' IN ('prepared','applied','outcome_unknown')
        AND (receipt - ARRAY['status','updatedAt','evidence','error']) =
            ($4::jsonb - ARRAY['status','updatedAt','evidence','error'])
        AND ($4::jsonb->>'updatedAt')::numeric >= (receipt->>'updatedAt')::numeric
      RETURNING id`,
      [key, token, JSON.stringify(expected), JSON.stringify(verified)],
    );
    return result.rows.length === 1;
  }
}
