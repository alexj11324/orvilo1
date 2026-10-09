import type { UserSystemAgentConfig, UserSystemAgentConfigKey } from '@orvilo/types';
import { resolveAgentRuntimeType } from '@orvilo/utils/agentRuntimeIdentity';
import { TRPCError } from '@trpc/server';

import { AgentModel } from '@/database/models/agent';
import { UserModel } from '@/database/models/user';
import type { OrviloDatabase } from '@/database/type';
import { resolveOrviloProviderBinding } from '@/server/services/providerBinding/execution';

import { resolveSystemAgentModelConfig } from './modelConfig';

/** These server judgments require a builtin owner; CLI model IDs are not API models. */
export const resolveOwnedSystemAgentModelConfig = async (
  db: OrviloDatabase,
  userId: string,
  taskKey: UserSystemAgentConfigKey,
  agentId?: string | null,
  workspaceId?: string,
) => {
  if (agentId) {
    const agents = new AgentModel(db, userId, workspaceId);
    const agent = await agents.getAgentConfig(agentId);
    if (agent && resolveAgentRuntimeType(agent) !== 'orvilo') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          'Planning and self-evolution require a built-in Orvilo agent; CLI agents are not supported.',
      });
    }
    if (agent) {
      const route = agent.agencyConfig?.heterogeneousProvider?.model;
      if (route) {
        const binding = await resolveOrviloProviderBinding(db, userId, 'sandbox', { model: route });
        if (binding) return { model: binding.config.model, provider: binding.config.provider };
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Verify the owning agent model connection before planning or self-evolution.',
        });
      } else {
        const model = await agents.getAgentModelConfig(agentId);
        if (model) return model;
      }
    }
  }
  const settings = await new UserModel(db, userId).getUserSettings();
  const systemAgent = settings?.systemAgent as Partial<UserSystemAgentConfig> | undefined;
  return resolveSystemAgentModelConfig({ taskConfig: systemAgent?.[taskKey], taskKey });
};
