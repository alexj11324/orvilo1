import type { OrviloDatabase } from '@/database/type';

import type { McpEventsAdapter } from './adapter';
import { createMcpEventsSql } from './database';
import type { McpEventBinding } from './deliveryTypes';
import type { McpInboxSql } from './inbox';
import { SqlMcpEventBindingRepository } from './inbox';
import {
  MCP_EVENT_RENEWAL_BATCH_SIZE,
  MCP_EVENT_RENEWAL_CONCURRENCY,
  MCP_EVENT_RENEWAL_LEAD_MS,
} from './renewalSchedule';
import { McpEventSubscriptionService } from './subscription';

interface RenewalScope {
  userId: string;
  workspaceId: string;
}

/** Resolve the saved trigger's creator, never identity supplied by a callback. */
export async function resolveMcpRenewalScope(database: McpInboxSql, binding: McpEventBinding) {
  const result = await database.query<{ user_id: string; workspace_id: string }>(
    `
    SELECT t.user_id,t.workspace_id FROM mcp_event_triggers t
    JOIN tasks task ON task.id=t.task_id AND task.workspace_id=t.workspace_id
    JOIN workspace_members member ON member.workspace_id=t.workspace_id AND member.user_id=t.user_id
    JOIN user_connectors connector ON connector.id::text=t.source_id AND connector.workspace_id=t.workspace_id
    WHERE t.tenant_id=$1 AND t.workspace_id=$1 AND t.subscription_id=$2 AND t.source_id=$3
      AND member.deleted_at IS NULL AND member.suspended_at IS NULL AND member.role IN ('owner','member')
      AND (member.role='owner' OR (task.created_by_user_id=t.user_id AND connector.user_id=t.user_id))
      AND connector.is_enabled=true AND connector.status='connected' AND connector.agent_id IS NULL
    LIMIT 2`,
    [binding.tenantId, binding.id, binding.connectorId],
  );
  // A subscription belongs to one explicitly saved trigger in this integration.
  if (result.rows.length !== 1) return undefined;
  return { userId: result.rows[0].user_id, workspaceId: result.rows[0].workspace_id };
}

/** Bounded subscription IO in the existing watchdog; no task execution or timers. */
export async function renewMcpEventSubscriptions(deps: {
  database: McpInboxSql;
  adapterFor: (binding: McpEventBinding, scope: RenewalScope) => Promise<McpEventsAdapter>;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  const repository = new SqlMcpEventBindingRepository(deps.database);
  const outcomes: { id: string; status: 'refreshed' | 'revoked' | 'retry' }[] = [];
  const due = (await repository.listDue(now() + MCP_EVENT_RENEWAL_LEAD_MS))
    .sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity))
    .slice(0, MCP_EVENT_RENEWAL_BATCH_SIZE);
  const renew = async (binding: McpEventBinding) => {
    try {
      const scope = await resolveMcpRenewalScope(deps.database, binding);
      if (!scope) {
        await repository.revoke(binding, binding.id);
        outcomes.push({ id: binding.id, status: 'revoked' });
        return;
      }
      const service = new McpEventSubscriptionService({
        repository,
        now,
        minimumRefreshWindowMs: MCP_EVENT_RENEWAL_LEAD_MS,
        callbackUrl: () => binding.callbackUrl,
        adapterFor: async () => {
          const fresh = await resolveMcpRenewalScope(deps.database, binding);
          if (!fresh || fresh.userId !== scope.userId || fresh.workspaceId !== scope.workspaceId) {
            throw Object.assign(new Error('Subscription authority revoked'), { code: -32012 });
          }
          return deps.adapterFor(binding, fresh);
        },
      });
      await service.refresh(binding, binding.id);
      outcomes.push({ id: binding.id, status: 'refreshed' });
    } catch {
      const latest = await repository.get(binding, binding.id);
      outcomes.push({ id: binding.id, status: latest?.state === 'revoked' ? 'revoked' : 'retry' });
    }
  };
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(MCP_EVENT_RENEWAL_CONCURRENCY, due.length) }, async () => {
      while (next < due.length) {
        const binding = due[next++];
        await renew(binding);
      }
    }),
  );
  return outcomes;
}

export async function sweepMcpEventSubscriptions(db: OrviloDatabase) {
  return renewMcpEventSubscriptions({
    database: createMcpEventsSql(db),
    adapterFor: async (binding, scope) => {
      const [{ ConnectorModel }, { KeyVaultsGateKeeper }, { createConnectorEventsAdapter }] =
        await Promise.all([
          import('@/database/models/connector'),
          import('@/server/modules/KeyVaultsEncrypt'),
          import('./connector'),
        ]);
      const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
      return createConnectorEventsAdapter(binding.connectorId, {
        connectorModel: new ConnectorModel(db, scope.userId, scope.workspaceId, gateKeeper),
        serverDB: db,
      });
    },
  });
}
