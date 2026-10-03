import { createHash, randomUUID } from 'node:crypto';

import type {
  AcceptedMcpEvent,
  McpEventBinding,
  McpEventInbox,
  McpInboxDelivery,
} from './deliveryTypes';

/** Uses the application's PostgreSQL connection; query parameters must stay bound. */
export interface McpInboxSql {
  query: <T>(sql: string, parameters?: unknown[]) => Promise<{ rows: T[] }>;
  transaction?: <T>(work: (database: McpInboxSql) => Promise<T>) => Promise<T>;
}

/** Proposed DDL for review, NOT an automatically applied production migration. */
export const MCP_EVENT_INBOX_SCHEMA_SQL = `
CREATE TABLE mcp_event_inbox (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  subscription_id text NOT NULL,
  event_id text NOT NULL,
  connector_id text NOT NULL,
  schema_id text NOT NULL,
  payload_hash text NOT NULL,
  delivery jsonb NOT NULL,
  received_at bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','dead')),
  attempts integer NOT NULL DEFAULT 0,
  available_at bigint NOT NULL,
  lease_token text,
  lease_until bigint,
  last_error text,
  UNIQUE (tenant_id, subscription_id, event_id)
);
CREATE INDEX mcp_event_inbox_ready ON mcp_event_inbox (status, available_at, lease_until);
`;

interface InboxRow {
  attempts: number;
  available_at: string | number;
  delivery: Omit<
    McpInboxDelivery,
    'id' | 'status' | 'attempts' | 'availableAt' | 'leaseToken' | 'leaseUntil' | 'lastError'
  >;
  id: string;
  last_error: string | null;
  lease_token: string | null;
  lease_until: string | number | null;
  status: McpInboxDelivery['status'];
}

const fromRow = (row: InboxRow): McpInboxDelivery => ({
  ...row.delivery,
  id: row.id,
  status: row.status,
  attempts: row.attempts,
  availableAt: Number(row.available_at),
  leaseToken: row.lease_token,
  leaseUntil: row.lease_until === null ? null : Number(row.lease_until),
  lastError: row.last_error,
});

/** Durable SQL inbox. It does not invoke tools or start task execution. */
export class SqlMcpEventInbox implements McpEventInbox {
  constructor(
    private readonly database: McpInboxSql,
    private readonly options: { maxPending?: number } = {},
  ) {}

  async accept(input: AcceptedMcpEvent) {
    const maxPending = this.options.maxPending ?? 1000;
    if (!Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 10_000)
      throw new Error('Invalid inbox queue bound');
    if (!this.database.transaction) throw new Error('Transactional inbox storage required');
    return this.database.transaction(async (database) => {
      // Lock one source before taking the quota snapshot in a NEW statement.
      // A count in the INSERT statement's CTE would retain its pre-lock MVCC
      // snapshot and could overshoot under concurrent webhook delivery.
      const bound = await database.query<{ id: string }>(
        `SELECT id FROM mcp_event_bindings WHERE id=$1 AND tenant_id=$2 AND connector_id=$3
          AND state='active' AND binding->>'schemaId'=$4 AND binding->>'eventName'=$5
          AND (binding->>'revision')::integer=$6
          AND ((binding->>'expiresAt') IS NULL OR (binding->>'expiresAt')::bigint > $7)
          FOR UPDATE`,
        [
          input.subscriptionId,
          input.tenantId,
          input.connectorId,
          input.schemaId,
          input.event.name,
          input.bindingRevision,
          input.receivedAt,
        ],
      );
      if (!bound.rows[0]) throw new Error('Inbox binding unavailable');
      const existing = await database.query<{ id: string }>(
        `SELECT id FROM mcp_event_inbox WHERE tenant_id=$1 AND subscription_id=$2 AND event_id=$3`,
        [input.tenantId, input.subscriptionId, input.event.eventId],
      );
      if (!existing.rows[0]) {
        const capacity = await database.query<{ pending: number }>(
          `SELECT count(*)::integer AS pending FROM mcp_event_inbox
            WHERE tenant_id=$1 AND subscription_id=$2 AND status IN ('pending','processing')`,
          [input.tenantId, input.subscriptionId],
        );
        if (capacity.rows[0].pending >= maxPending) return 'overloaded' as const;
      }
      // Duplicates remain acknowledged even when the queue is at capacity.
      return new SqlMcpEventInbox(database, this.options).acceptStored(input);
    });
  }

  private async acceptStored(input: AcceptedMcpEvent) {
    const { rawBody, ...event } = input;
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    const delivery = {
      ...event,
      payloadHash,
      rawBodyBase64: Buffer.from(rawBody).toString('base64'),
    };
    // Receipt and cursor commit together inside the source's quota transaction.
    const result = await this.database.query<{
      inserted: boolean;
      payload_hash: string;
      connector_id: string;
      schema_id: string;
    }>(
      `
      WITH bound AS (
        SELECT id FROM mcp_event_bindings WHERE id=$3 AND tenant_id=$2 AND connector_id=$5
          AND state='active' AND binding->>'schemaId'=$6 AND binding->>'eventName'=$11
          AND (binding->>'revision')::integer=$10
          AND ((binding->>'expiresAt') IS NULL OR (binding->>'expiresAt')::bigint > $9)
        FOR UPDATE
      ), received AS (
        INSERT INTO mcp_event_inbox (id,tenant_id,subscription_id,event_id,connector_id,schema_id,payload_hash,delivery,received_at,available_at)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9 FROM bound
        ON CONFLICT (tenant_id,subscription_id,event_id) DO UPDATE SET event_id = mcp_event_inbox.event_id
        RETURNING (xmax = 0) AS inserted, payload_hash, connector_id, schema_id
      ), watermark AS (
        UPDATE mcp_event_bindings SET binding=binding || jsonb_build_object('cursor',$12::text)
        WHERE id IN (SELECT id FROM bound) AND $13::boolean
          AND EXISTS (SELECT 1 FROM received WHERE inserted AND payload_hash=$7 AND connector_id=$5 AND schema_id=$6)
        RETURNING id
      ) SELECT * FROM received`,
      [
        randomUUID(),
        input.tenantId,
        input.subscriptionId,
        input.event.eventId,
        input.connectorId,
        input.schemaId,
        payloadHash,
        JSON.stringify(delivery),
        input.receivedAt,
        input.bindingRevision,
        input.event.name,
        input.event.cursor ?? null,
        input.event.cursor !== undefined,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Inbox commit returned no row');
    if (
      row.payload_hash !== payloadHash ||
      row.connector_id !== input.connectorId ||
      row.schema_id !== input.schemaId
    )
      return 'conflict' as const;
    return row.inserted ? ('accepted' as const) : ('duplicate' as const);
  }

  async claim(now: number, leaseMs: number, limit = 20, tenantId?: string) {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger(leaseMs) ||
      leaseMs < 1
    )
      throw new Error('Invalid inbox lease');
    const result = await this.database.query<InboxRow>(
      `
      WITH ready AS (
        SELECT id FROM mcp_event_inbox
        WHERE ((status = 'pending' AND available_at <= $1)
           OR (status = 'processing' AND lease_until <= $1))
          AND ($5::text IS NULL OR tenant_id=$5)
        ORDER BY received_at, id LIMIT $2 FOR UPDATE SKIP LOCKED
      )
      UPDATE mcp_event_inbox AS inbox SET status='processing', attempts=attempts+1,
        lease_token=$3, lease_until=$4
      FROM ready WHERE inbox.id=ready.id RETURNING inbox.*`,
      [now, limit, randomUUID(), now + leaseMs, tenantId ?? null],
    );
    return result.rows.map(fromRow);
  }

  async renew(id: string, leaseToken: string, now: number, leaseMs: number) {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1) throw new Error('Invalid inbox lease');
    const result = await this.database.query<{ id: string }>(
      `UPDATE mcp_event_inbox SET lease_until=$4
      WHERE id=$1 AND status='processing' AND lease_token=$2 AND lease_until > $3 RETURNING id`,
      [id, leaseToken, now, now + leaseMs],
    );
    return result.rows.length === 1;
  }

  async settle(
    id: string,
    leaseToken: string,
    now: number,
    outcome: Parameters<McpEventInbox['settle']>[3],
  ) {
    if (outcome.status !== 'completed' && !/^[a-z][a-z0-9_]{0,63}$/.test(outcome.errorCode))
      throw new Error('Invalid inbox error code');
    const result = await this.database.query<{ id: string }>(
      `
      UPDATE mcp_event_inbox SET status=$4, available_at=$5, last_error=$6, lease_token=NULL, lease_until=NULL,
        attempts=CASE WHEN $7::boolean THEN GREATEST(attempts-1,0) ELSE attempts END
      WHERE id=$1 AND status='processing' AND lease_token=$2 AND lease_until > $3 RETURNING id`,
      [
        id,
        leaseToken,
        now,
        outcome.status,
        outcome.status === 'completed' ? now : outcome.availableAt,
        outcome.status === 'completed' ? null : outcome.errorCode,
        outcome.status === 'pending' && outcome.preserveAttempts === true,
      ],
    );
    return result.rows.length === 1;
  }
}

export const MCP_EVENT_BINDING_SCHEMA_SQL = `
CREATE TABLE mcp_event_bindings (
 id text PRIMARY KEY, tenant_id text NOT NULL, connector_id text NOT NULL,
 callback_token text NOT NULL UNIQUE, state text NOT NULL,
 remote_subscription_id text, binding jsonb NOT NULL
);
CREATE TABLE mcp_event_challenges (
 id text PRIMARY KEY, binding_id text NOT NULL REFERENCES mcp_event_bindings(id) ON DELETE CASCADE,
 webhook_id text NOT NULL, challenge_hash text NOT NULL, received_at bigint NOT NULL,
 UNIQUE(binding_id,webhook_id), UNIQUE(binding_id,challenge_hash)
);`;

interface BindingRow {
  binding: McpEventBinding;
}
interface BindingScope {
  connectorId: string;
  tenantId: string;
}

export class SqlMcpEventBindingRepository {
  constructor(private readonly database: McpInboxSql) {}

  async get(scope: BindingScope, id: string) {
    const result = await this.database.query<BindingRow>(
      'SELECT binding FROM mcp_event_bindings WHERE tenant_id=$1 AND connector_id=$2 AND id=$3',
      [scope.tenantId, scope.connectorId, id],
    );
    return result.rows[0]?.binding;
  }

  async findByCallbackToken(token: string) {
    const result = await this.database.query<BindingRow>(
      'SELECT binding FROM mcp_event_bindings WHERE callback_token=$1',
      [token],
    );
    return result.rows[0]?.binding;
  }

  async createPending(binding: McpEventBinding) {
    if (
      binding.state !== 'pending' ||
      binding.remoteSubscriptionId !== null ||
      binding.revision !== 0
    )
      throw new Error('Invalid pending binding');
    await this.database.query(
      `INSERT INTO mcp_event_bindings (id,tenant_id,connector_id,callback_token,state,remote_subscription_id,binding)
      VALUES ($1,$2,$3,$4,'pending',NULL,$5::jsonb)`,
      [
        binding.id,
        binding.tenantId,
        binding.connectorId,
        binding.callbackToken,
        JSON.stringify(binding),
      ],
    );
  }

  async update(
    scope: BindingScope,
    id: string,
    expectedState: 'pending' | 'active',
    patch: Partial<McpEventBinding>,
    expectedRevision?: number,
    cursorAtRequest?: string | null,
  ) {
    // Identity and signing destination cannot be rewritten through a lifecycle patch.
    const {
      id: _id,
      revision: _revision,
      tenantId: _tenant,
      connectorId: _connector,
      callbackToken: _token,
      callbackUrl: _url,
      schemaId: _schema,
      eventName: _name,
      eventArguments: _arguments,
      payloadSchema: _payloadSchema,
      ...changes
    } = patch;
    if (changes.remoteSubscriptionId === null) delete changes.remoteSubscriptionId;
    if (expectedState === 'active' && changes.state === 'pending')
      throw new Error('Invalid subscription transition');
    const result = await this.database.query<BindingRow>(
      `UPDATE mcp_event_bindings
      SET binding=(binding || $5::jsonb) || jsonb_build_object('revision', (binding->>'revision')::integer+1)
        || CASE WHEN $7::boolean AND (binding->>'cursor') IS DISTINCT FROM $8::text THEN jsonb_build_object('cursor',binding->'cursor') ELSE '{}'::jsonb END,
        state=COALESCE($5::jsonb->>'state',state),
        remote_subscription_id=COALESCE($5::jsonb->>'remoteSubscriptionId',remote_subscription_id)
      WHERE tenant_id=$1 AND connector_id=$2 AND id=$3 AND state=$4
        AND ($6::integer IS NULL OR (binding->>'revision')::integer=$6)
        AND (remote_subscription_id IS NULL OR $5::jsonb->>'remoteSubscriptionId' IS NULL OR remote_subscription_id=$5::jsonb->>'remoteSubscriptionId')
      RETURNING binding`,
      [
        scope.tenantId,
        scope.connectorId,
        id,
        expectedState,
        JSON.stringify(changes),
        expectedRevision ?? null,
        cursorAtRequest !== undefined,
        cursorAtRequest ?? null,
      ],
    );
    return result.rows[0]?.binding;
  }

  async revoke(scope: BindingScope, id: string, expectedRevision?: number) {
    const result = await this.database.query<{ id: string }>(
      `UPDATE mcp_event_bindings SET state='revoked',binding=binding || '{"state":"revoked"}'::jsonb
      WHERE tenant_id=$1 AND connector_id=$2 AND id=$3
        AND ($4::integer IS NULL OR (binding->>'revision')::integer=$4) RETURNING id`,
      [scope.tenantId, scope.connectorId, id, expectedRevision ?? null],
    );
    return result.rows.length === 1;
  }

  async claimRefresh(scope: BindingScope, id: string, now: number, leaseMs: number) {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1) throw new Error('Invalid refresh lease');
    const result = await this.database.query<BindingRow>(
      `UPDATE mcp_event_bindings
      SET binding=binding || jsonb_build_object('refreshLeaseUntil',$5::bigint,'revision',(binding->>'revision')::integer+1)
      WHERE tenant_id=$1 AND connector_id=$2 AND id=$3 AND state='active'
        AND (NOT (binding ? 'refreshLeaseUntil') OR (binding->>'refreshLeaseUntil')::bigint <= $4)
      RETURNING binding`,
      [scope.tenantId, scope.connectorId, id, now, now + leaseMs],
    );
    return result.rows[0]?.binding;
  }

  async listDue(now: number) {
    const result = await this.database.query<BindingRow>(
      `SELECT binding FROM mcp_event_bindings
      WHERE state='active' AND (binding->>'expiresAt')::bigint <= $1`,
      [now],
    );
    return result.rows.map((row) => row.binding);
  }

  /** Signed challenge is consumed and remote identity bound in the same commit. */
  async verifyPending(
    token: string,
    remoteId: string,
    webhookId: string,
    challenge: string,
    now: number,
    expectedRevision?: number,
  ) {
    const challengeHash = createHash('sha256').update(challenge).digest('hex');
    const result = await this.database.query<{ id: string }>(
      `WITH candidate AS (
      SELECT id FROM mcp_event_bindings WHERE callback_token=$1 AND state IN ('pending','active')
        AND (remote_subscription_id IS NULL OR remote_subscription_id=$2)
        AND ($7::integer IS NULL OR (binding->>'revision')::integer=$7)
        AND ((binding->>'expiresAt') IS NULL OR (binding->>'expiresAt')::bigint > $5) FOR UPDATE
      ), consumed AS (
        INSERT INTO mcp_event_challenges (id,binding_id,webhook_id,challenge_hash,received_at)
        SELECT $6,id,$3,$4,$5 FROM candidate ON CONFLICT DO NOTHING RETURNING binding_id
      )
      UPDATE mcp_event_bindings SET remote_subscription_id=$2,
        binding=binding || jsonb_build_object('remoteSubscriptionId',$2::text)
      WHERE id IN (SELECT binding_id FROM consumed) RETURNING id`,
      [token, remoteId, webhookId, challengeHash, now, randomUUID(), expectedRevision ?? null],
    );
    return result.rows.length === 1;
  }
}
