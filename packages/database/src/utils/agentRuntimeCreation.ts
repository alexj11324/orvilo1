import { canRunGroupSupervisorRuntime } from '@orvilo/heterogeneous-agents';
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

/** Explicit hosts require saved authority; unset public workspace profiles select at first send. */
export const assertAgentRuntimeCreation = async (
  db: OrviloDatabase,
  actor: { userId: string; workspaceId?: string },
  config: AgentRuntimeCreationConfig,
  options: { purpose?: 'orchestrator' } = {},
): Promise<OrviloAgentAgencyConfig> => {
  if (!config.agencyConfig?.heterogeneousProvider?.type) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'AGENT_RUNTIME_REQUIRED' });
  }
  const agencyConfig = normalizeAgentRuntimeIdentity(config.agencyConfig);
  if (options.purpose === 'orchestrator') {
    if (!canRunGroupSupervisorRuntime(agencyConfig.heterogeneousProvider)) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'ORCHESTRATOR_RUNTIME_UNSUPPORTED',
      });
    }
    const { env: _env, ...provider } = agencyConfig.heterogeneousProvider!;
    agencyConfig.heterogeneousProvider = provider;
  }
  const publicWorkspaceAgent = Boolean(actor.workspaceId && config.visibility !== 'private');
  const unsetWorkspaceTarget =
    publicWorkspaceAgent &&
    options.purpose !== 'orchestrator' &&
    agencyConfig.executionTargetSelectionPolicy !== 'fixed' &&
    agencyConfig.executionTarget === undefined &&
    agencyConfig.boundDeviceId === undefined;
  if (!unsetWorkspaceTarget) {
    if (
      !agencyConfig.boundDeviceId ||
      !['device', 'local'].includes(agencyConfig.executionTarget ?? '')
    ) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'AGENT_HOST_REQUIRED' });
    }
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
