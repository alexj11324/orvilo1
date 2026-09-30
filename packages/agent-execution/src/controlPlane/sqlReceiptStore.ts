import { randomUUID } from 'node:crypto';

import type { DurableReceiptStore } from './actionGateway';
import type { DurableReceipt } from './contracts';

export interface ReceiptSql {
  query: <T>(sql: string, parameters?: unknown[]) => Promise<{ rows: T[] }>;
}

/** Candidate DDL only. Applied explicitly to isolated test databases; not a migration. */
export const ACTION_RECEIPT_SCHEMA_SQL = `
CREATE TABLE action_receipts (
  id text PRIMARY KEY,
  reservation_key text NOT NULL UNIQUE,
  owner_token text NOT NULL,
  receipt jsonb NOT NULL
);`;

/** Durable reservation ownership never expires: an ambiguous effect must be reconciled,
 * never automatically repeated by a new process. The token remains inside this adapter. */
export class SqlDurableReceiptStore implements DurableReceiptStore {
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
}
