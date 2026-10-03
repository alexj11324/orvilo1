import { createHash, randomUUID } from 'node:crypto';

import type { AutomationDefinitionSnapshot, AutomationOccurrenceSnapshot } from '@orvilo/types';

import type { McpInboxDelivery } from './deliveryTypes';
import type { McpEventFilter } from './filter';
import { matchesMcpEventFilters, validMcpEventFilters } from './filter';
import type { McpInboxSql } from './inbox';

export const MCP_EVENT_WORK_SCHEMA_SQL = `
CREATE TABLE mcp_event_triggers (
 id text PRIMARY KEY, tenant_id text NOT NULL, workspace_id text NOT NULL,
 user_id text NOT NULL, task_id text NOT NULL, subscription_id text NOT NULL,
 source_id text NOT NULL, revision integer NOT NULL DEFAULT 0,
 enabled boolean NOT NULL DEFAULT false, filters jsonb NOT NULL,
 UNIQUE (tenant_id,task_id)
);
CREATE INDEX mcp_event_triggers_subscription ON mcp_event_triggers (tenant_id,subscription_id);
CREATE TABLE mcp_event_trigger_runs (
 id text PRIMARY KEY, tenant_id text NOT NULL, inbox_id text NOT NULL REFERENCES mcp_event_inbox(id),
 trigger_id text NOT NULL REFERENCES mcp_event_triggers(id), trigger_revision integer NOT NULL,
 idempotency_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending',
 dispatch_id text, reason text, automation_occurrence jsonb,
 UNIQUE (tenant_id,inbox_id,trigger_id),
 CHECK (status IN ('pending','accepted','filtered','denied'))
);`;

export interface McpEventTriggerScope {
  tenantId: string;
  userId: string;
  workspaceId: string;
}
export interface McpEventTrigger extends McpEventTriggerScope {
  enabled: boolean;
  filters: McpEventFilter[];
  id: string;
  revision: number;
  sourceId: string;
  subscriptionId: string;
  taskId: string;
}
interface TriggerRow {
  enabled: boolean;
  filters: McpEventFilter[];
  id: string;
  revision: number;
  source_id: string;
  subscription_id: string;
  task_id: string;
  tenant_id: string;
  user_id: string;
  workspace_id: string;
}
const triggerFromRow = (row: TriggerRow): McpEventTrigger => ({
  id: row.id,
  tenantId: row.tenant_id,
  workspaceId: row.workspace_id,
  userId: row.user_id,
  taskId: row.task_id,
  subscriptionId: row.subscription_id,
  sourceId: row.source_id,
  revision: row.revision,
  enabled: row.enabled,
  filters: row.filters,
});

export class SqlMcpEventTriggerRepository {
  constructor(private readonly database: McpInboxSql) {}

  async list(scope: McpEventTriggerScope, taskId: string): Promise<McpEventTrigger[]> {
    const result = await this.database.query<TriggerRow>(
      `SELECT * FROM mcp_event_triggers
      WHERE tenant_id=$1 AND workspace_id=$2 AND user_id=$3 AND task_id=$4`,
      [scope.tenantId, scope.workspaceId, scope.userId, taskId],
    );
    return result.rows.map(triggerFromRow);
  }

  /** Caller must authorize task ownership; enabling additionally requires a live scoped binding. */
  async save(
    input: Omit<McpEventTrigger, 'revision'>,
    expectedRevision?: number,
  ): Promise<McpEventTrigger | undefined> {
    if (!validMcpEventFilters(input.filters)) throw new Error('Invalid event filters');
    const parameters = [
      input.id,
      input.tenantId,
      input.workspaceId,
      input.userId,
      input.taskId,
      input.subscriptionId,
      input.sourceId,
      input.enabled,
      JSON.stringify(input.filters),
    ];
    const active = `($8::boolean=false OR EXISTS (SELECT 1 FROM mcp_event_bindings
      WHERE id=$6 AND tenant_id=$2 AND connector_id=$7 AND state='active'))`;
    const result =
      expectedRevision === undefined
        ? await this.database.query<TriggerRow>(
            `INSERT INTO mcp_event_triggers
        (id,tenant_id,workspace_id,user_id,task_id,subscription_id,source_id,enabled,filters)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb WHERE ${active}
        ON CONFLICT DO NOTHING RETURNING *`,
            parameters,
          )
        : await this.database.query<TriggerRow>(
            `UPDATE mcp_event_triggers SET
        subscription_id=$6,source_id=$7,enabled=$8,filters=$9::jsonb,revision=revision+1
        WHERE id=$1 AND tenant_id=$2 AND workspace_id=$3 AND user_id=$4 AND task_id=$5
          AND revision=$10 AND ${active} RETURNING *`,
            [...parameters, expectedRevision],
          );
    return result.rows[0] && triggerFromRow(result.rows[0]);
  }
}

export interface McpEventTriggerRun {
  id: string;
  idempotencyKey: string;
  status: 'pending' | 'accepted' | 'filtered' | 'denied';
  trigger: McpEventTrigger;
}
interface RunRow {
  automation_occurrence: AutomationOccurrenceSnapshot | null;
  id: string;
  idempotency_key: string;
  status: McpEventTriggerRun['status'];
  trigger_id: string;
  trigger_revision: number;
}

/** Every write is fenced by the current durable inbox lease. */
export class SqlMcpEventWorkRepository {
  constructor(
    private readonly database: McpInboxSql,
    private readonly snapshotDefinition?: (
      trigger: McpEventTrigger,
    ) => Promise<AutomationDefinitionSnapshot>,
  ) {}

  async prepare(delivery: McpInboxDelivery, now: number): Promise<McpEventTriggerRun[]> {
    const result = await this.database.query<TriggerRow>(
      `SELECT t.* FROM mcp_event_triggers t
      JOIN mcp_event_bindings b ON b.id=t.subscription_id AND b.tenant_id=t.tenant_id AND b.connector_id=t.source_id
      JOIN mcp_event_inbox i ON i.subscription_id=b.id AND i.tenant_id=b.tenant_id
      WHERE i.id=$1 AND i.status='processing' AND i.lease_token=$2 AND i.lease_until>$3
        AND b.state='active' AND (b.binding->>'expiresAt' IS NULL OR (b.binding->>'expiresAt')::bigint>$3)
        AND t.tenant_id=$4 AND t.source_id=$5`,
      [delivery.id, delivery.leaseToken, now, delivery.tenantId, delivery.connectorId],
    );
    const runs: McpEventTriggerRun[] = [];
    for (const row of result.rows) {
      const trigger = triggerFromRow(row);
      const key = `event:${createHash('sha256')
        .update(
          JSON.stringify([
            delivery.tenantId,
            delivery.subscriptionId,
            delivery.event.eventId,
            trigger.id,
          ]),
        )
        .digest('hex')}`;
      const runId = randomUUID();
      const definition = this.snapshotDefinition
        ? await this.snapshotDefinition(trigger)
        : undefined;
      const enabledAt = (definition?.config as { automationEnabledAt?: string } | undefined)
        ?.automationEnabledAt;
      const pausedAtReceipt =
        !trigger.enabled || Boolean(enabledAt && delivery.receivedAt < Date.parse(enabledAt));
      const status = pausedAtReceipt
        ? 'denied'
        : matchesMcpEventFilters(delivery.event.data, trigger.filters)
          ? 'pending'
          : 'filtered';
      const occurrence: AutomationOccurrenceSnapshot | undefined = definition
        ? {
            definition,
            occurrenceId: runId,
            input: {
              data: delivery.event.data,
              eventId: delivery.event.eventId,
              eventType: delivery.event.name,
              inputHash: delivery.payloadHash,
              inputRef: delivery.id,
              receivedAt: new Date(delivery.receivedAt).toISOString(),
              source: delivery.connectorId,
            },
          }
        : undefined;
      const inserted = await this.database.query<RunRow>(
        `INSERT INTO mcp_event_trigger_runs
        (id,tenant_id,inbox_id,trigger_id,trigger_revision,idempotency_key,status,automation_occurrence,reason)
        SELECT $1,$2,$3,$4,$5,$6,$7,$10::jsonb,$11 FROM mcp_event_inbox i
        WHERE i.id=$3 AND i.status='processing' AND i.lease_token=$8 AND i.lease_until>$9
        ON CONFLICT (tenant_id,inbox_id,trigger_id) DO UPDATE SET id=mcp_event_trigger_runs.id RETURNING *`,
        [
          runId,
          delivery.tenantId,
          delivery.id,
          trigger.id,
          trigger.revision,
          key,
          status,
          delivery.leaseToken,
          now,
          occurrence ? JSON.stringify(occurrence) : null,
          pausedAtReceipt ? 'paused_at_receipt' : null,
        ],
      );
      const run = inserted.rows[0];
      if (run)
        runs.push({
          id: run.id,
          trigger: { ...trigger, revision: run.trigger_revision },
          idempotencyKey: run.idempotency_key,
          status: run.status,
        });
    }
    return runs;
  }

  async current(
    delivery: McpInboxDelivery,
    run: McpEventTriggerRun,
    now: number,
  ): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      `SELECT r.id FROM mcp_event_trigger_runs r
      JOIN mcp_event_triggers t ON t.id=r.trigger_id AND t.revision=r.trigger_revision AND t.tenant_id=r.tenant_id
      JOIN mcp_event_bindings b ON b.id=t.subscription_id AND b.tenant_id=t.tenant_id AND b.connector_id=t.source_id
      JOIN mcp_event_inbox i ON i.id=r.inbox_id AND i.tenant_id=r.tenant_id AND i.subscription_id=b.id
      WHERE r.id=$1 AND i.id=$2 AND i.status='processing' AND i.lease_token=$3 AND i.lease_until>$4
        AND t.enabled AND b.state='active' AND (b.binding->>'expiresAt' IS NULL OR (b.binding->>'expiresAt')::bigint>$4)`,
      [run.id, delivery.id, delivery.leaseToken, now],
    );
    return result.rows.length === 1;
  }

  async settle(
    delivery: McpInboxDelivery,
    run: McpEventTriggerRun,
    now: number,
    outcome: { status: 'accepted' | 'denied'; dispatchId?: string; reason?: string },
  ): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      `UPDATE mcp_event_trigger_runs r
      SET status=$4,dispatch_id=$5,reason=$6 FROM mcp_event_inbox i
      WHERE r.id=$1 AND r.inbox_id=i.id AND i.id=$2 AND i.lease_token=$3
        AND i.status='processing' AND i.lease_until>$7 AND r.status='pending' RETURNING r.id`,
      [
        run.id,
        delivery.id,
        delivery.leaseToken,
        outcome.status,
        outcome.dispatchId ?? null,
        outcome.reason ?? null,
        now,
      ],
    );
    return result.rows.length === 1;
  }
}
