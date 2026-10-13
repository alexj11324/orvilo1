import { getAgentPersistConfig } from '@orvilo/builtin-agents';
import { and, eq } from 'drizzle-orm';

import { AgentModel } from '@/database/models/agent';
import { UserModel } from '@/database/models/user';
import { agents } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { buildStrictWorkspaceWhere } from '@/database/utils/workspace';

import { resolveOrchestratorRuntimeForCreation } from './orchestratorRuntimeCreation';

/** Builtins copy only an explicitly configured, authorized runtime in their own scope. */
export const getExecutableBuiltinAgent = async (
  db: OrviloDatabase,
  userId: string,
  slug: string,
  workspaceId?: string,
) => {
  if (!getAgentPersistConfig(slug))
    return new AgentModel(db, userId, workspaceId).getBuiltinAgent(slug);
  const [existing] = await db
    .select({ agencyConfig: agents.agencyConfig })
    .from(agents)
    .where(and(eq(agents.slug, slug), buildStrictWorkspaceWhere({ userId, workspaceId }, agents)))
    .limit(1);
  const agency = existing?.agencyConfig;
  const healthy =
    agency?.boundDeviceId &&
    agency.heterogeneousProvider?.type &&
    ['device', 'local'].includes(agency.executionTarget ?? '');
  let runtime;
  if (!healthy) {
    const defaults = !workspaceId
      ? await new UserModel(db, userId).getUserSettingsDefaultAgentConfig()
      : undefined;
    runtime = defaults?.agencyConfig?.boundDeviceId
      ? {
          agencyConfig: defaults.agencyConfig,
          model: defaults.model ?? null,
          provider: defaults.provider ?? null,
        }
      : await resolveOrchestratorRuntimeForCreation(
          { db, userId, workspaceId },
          { visibility: 'public' },
        );
  }
  return new AgentModel(db, userId, workspaceId).getBuiltinAgent(slug, { runtime });
};
