import type { OrviloDatabase } from '@/database/type';
import {
  type AgentHostSummary,
  resolveAgentHostSummary,
} from '@/server/services/deviceGateway/agentHostSummary';
import { canPerformResourceAction, getResourceMeta } from '@/server/services/resourcePermission';
import { isWorkspaceScopedMeta } from '@/server/services/resourcePermission/scopeMeta';

interface BoundDeviceCtx {
  db: OrviloDatabase;
  grantedPermissions?: readonly string[];
  userId: string;
  workspaceId?: string | null;
}

/**
 * The saved device of a workspace Agent, as `{ id, name, online }`, for callers
 * who hold the Use permission but not edit access.
 *
 * `redactAgentConfig` keeps `agencyConfig.boundDeviceId` out of the profile
 * whitelist on purpose; this is the only sanctioned way a Use-level member learns
 * where an Agent runs. It is computed server-side, read-only, and carries no
 * working directories, owner identity, channels, env/args or capability data.
 *
 * Returns `undefined` unless the Agent targets a device with a saved device id,
 * the call is workspace-scoped, and the caller can Use the Agent.
 */
export const resolveBoundDeviceForUseMember = async (
  ctx: BoundDeviceCtx,
  agentId: string,
  agencyConfig: Record<string, any> | null | undefined,
): Promise<AgentHostSummary | undefined> => {
  const workspaceId = ctx.workspaceId ?? undefined;
  if (!workspaceId || !agencyConfig) return undefined;
  if (agencyConfig.executionTarget !== 'device' && agencyConfig.executionTarget !== 'local') {
    return undefined;
  }
  const boundDeviceId = agencyConfig.boundDeviceId;
  if (typeof boundDeviceId !== 'string' || !boundDeviceId) return undefined;

  const meta = await getResourceMeta(ctx.db, 'agent', agentId);
  if (!meta || !isWorkspaceScopedMeta(meta, workspaceId, ctx.userId)) return undefined;

  const canUse = await canPerformResourceAction({
    action: 'use',
    db: ctx.db,
    grantedPermissions: ctx.grantedPermissions,
    meta,
    resourceId: agentId,
    resourceType: 'agent',
    userId: ctx.userId,
    workspaceId,
  });
  if (!canUse) return undefined;

  return resolveAgentHostSummary(ctx.db, ctx.userId, boundDeviceId, workspaceId);
};
