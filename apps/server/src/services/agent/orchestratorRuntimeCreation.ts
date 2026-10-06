import { TRPCError } from '@trpc/server';

import { AgentModel } from '@/database/models/agent';
import type { OrviloDatabase } from '@/database/type';
import { getResourceConfigAccess } from '@/server/routers/lambda/_helpers/resourceConfigGuard';

/** Resolve the current source permission before reading a runtime to copy into an owned coordinator. */
export const resolveOrchestratorRuntimeForCreation = async (
  actor: {
    db: OrviloDatabase;
    userId: string;
    workspaceId?: string | null;
    grantedPermissions?: readonly string[];
  },
  options: {
    sourceAgentId?: string;
    visibility?: 'private' | 'public';
    model?: string;
    provider?: string;
  } = {},
) => {
  const model = new AgentModel(actor.db, actor.userId, actor.workspaceId ?? undefined);
  const sourceAgentId = options.sourceAgentId ?? (await model.getOrchestratorSourceAgentId());
  if ((await getResourceConfigAccess(actor, 'agent', sourceAgentId)) !== 'full')
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Agent runtime configuration is unavailable',
    });
  const runtime = await model.inheritRuntimeForCreation(sourceAgentId, {
    ...options,
    purpose: 'orchestrator',
  });
  return { ...runtime, params: { orchestratorSourceAgentId: sourceAgentId } };
};
