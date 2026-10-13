import { BUILTIN_AGENT_SLUGS } from '@orvilo/builtin-agents';
import { resolveAgentRuntimeType } from '@orvilo/utils/agentRuntimeIdentity';
import { TRPCError } from '@trpc/server';

import { AgentModel } from '@/database/models/agent';
import type { OrviloDatabase } from '@/database/type';
import { resolveOrviloProviderBinding } from '@/server/services/providerBinding/execution';

import { resolveOwnedSystemAgentModelConfig } from './ownedModelConfig';

/** Optional work must not start a run when no usable builtin provider exists. */
export const resolveLightweightJudgment = async (
  db: OrviloDatabase,
  userId: string,
  key: 'orchestrationWorkflow' | 'expertise',
  agentId?: string | null,
  workspaceId?: string,
) => {
  if (!(await resolveOrviloProviderBinding(db, userId, 'sandbox'))) return undefined;
  const agent = agentId
    ? await new AgentModel(db, userId, workspaceId).getAgentConfig(agentId)
    : undefined;
  const builtinOwner = agent && resolveAgentRuntimeType(agent) === 'orvilo' ? agentId : undefined;
  let model;
  try {
    model = await resolveOwnedSystemAgentModelConfig(db, userId, key, builtinOwner, workspaceId);
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'PRECONDITION_FAILED') return undefined;
    throw error;
  }
  if (!(await resolveOrviloProviderBinding(db, userId, 'sandbox', model))) return undefined;
  return {
    ...model,
    binding: builtinOwner
      ? { agentId: builtinOwner }
      : {
          slug:
            key === 'orchestrationWorkflow'
              ? BUILTIN_AGENT_SLUGS.taskAgent
              : BUILTIN_AGENT_SLUGS.selfReflection,
        },
  };
};
