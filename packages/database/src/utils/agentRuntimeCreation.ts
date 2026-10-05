import type { OrviloAgentAgencyConfig } from '@orvilo/types';
import { PROVIDER_CONFIG_ANCHOR_MODEL } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import { ProviderBindingModel } from '../models/providerBinding';
import type { AgentItem } from '../schemas';
import { devices } from '../schemas';
import type { OrviloDatabase } from '../type';
import { normalizeAgentRuntimeIdentity } from './agentRuntimeIdentity';
import { buildStrictWorkspaceWhere, buildWorkspaceWhere } from './workspace';

export type AgentRuntimeCreationConfig = Partial<
  Pick<AgentItem, 'agencyConfig' | 'model' | 'provider' | 'visibility'>
>;

/** Creation admits saved execution authority; an offline host remains a valid binding. */
export const assertAgentRuntimeCreation = async (
  db: OrviloDatabase,
  actor: { userId: string; workspaceId?: string },
  config: AgentRuntimeCreationConfig,
): Promise<OrviloAgentAgencyConfig> => {
  if (!config.agencyConfig?.heterogeneousProvider?.type) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'AGENT_RUNTIME_REQUIRED' });
  }
  const agencyConfig = normalizeAgentRuntimeIdentity(config.agencyConfig);
  if (
    !agencyConfig.boundDeviceId ||
    !['device', 'local'].includes(agencyConfig.executionTarget ?? '')
  ) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'AGENT_HOST_REQUIRED' });
  }
  const publicWorkspaceAgent = Boolean(actor.workspaceId && config.visibility !== 'private');
  const [host] = await db
    .select({ deviceId: devices.deviceId })
    .from(devices)
    .where(
      and(
        eq(devices.deviceId, agencyConfig.boundDeviceId),
        publicWorkspaceAgent
          ? buildStrictWorkspaceWhere({ ...actor, callerAgentVisibility: 'public' }, devices)
          : buildWorkspaceWhere(actor, devices),
      ),
    )
    .limit(1);
  if (!host) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'AGENT_HOST_UNAVAILABLE' });
  }
  if (agencyConfig.heterogeneousProvider?.type !== 'orvilo') return agencyConfig;

  const model = agencyConfig.heterogeneousProvider.model ?? config.model;
  if (!model?.trim() || model === PROVIDER_CONFIG_ANCHOR_MODEL) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'AGENT_MODEL_REQUIRED' });
  }
  if (config.model && config.model !== model) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'AGENT_MODEL_BINDING_MISMATCH' });
  }
  const bindings = new ProviderBindingModel(db, actor.userId);
  const binding = (await bindings.list()).find(
    (row) =>
      row.config.enabled &&
      row.config.selection.runtime === 'orvilo' &&
      row.config.selection.target === 'sandbox' &&
      row.config.model === model &&
      (!config.provider || row.config.provider === config.provider),
  );
  if (!binding || !(await bindings.ownsCredentialReference(binding.config.secretReference))) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'AGENT_PROVIDER_REQUIRED' });
  }
  return agencyConfig;
};
