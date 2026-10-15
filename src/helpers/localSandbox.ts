import { isDesktop } from '@orvilo/const';
import type { OrviloAgentAgencyConfig } from '@orvilo/types';

import { isLocalSandboxEnabled, resolveExecutionTarget } from '@/helpers/executionTarget';
import { getTopicAgencyConfig } from '@/helpers/topicExecutionConfig';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

export interface ClientLocalSandboxDecision {
  /** Confine this command (writes scoped to the working directory). */
  localSandbox: boolean;
  /** …and let it reach the package-registry allowlist. */
  localSandboxNetwork: boolean;
}

const unfenced: ClientLocalSandboxDecision = { localSandbox: false, localSandboxNetwork: false };

const isFenced = (agencyConfig: OrviloAgentAgencyConfig | undefined): boolean =>
  isLocalSandboxEnabled(
    agencyConfig,
    resolveExecutionTarget(agencyConfig, {
      clientExecutionAvailable: true,
      isHetero: !!agencyConfig?.heterogeneousProvider?.type,
    }),
  );

/** Whether a desktop command is fenced by its Agent's saved configuration. */
export const resolveClientLocalSandbox = (
  agentId?: string,
  topicId?: string | null,
): ClientLocalSandboxDecision => {
  if (!isDesktop || !agentId) return unfenced;
  const agencyConfig = getTopicAgencyConfig(
    agentByIdSelectors.getAgencyConfigById(agentId)(useAgentStore.getState()),
    topicId,
  );
  if (!isFenced(agencyConfig)) return unfenced;
  return { localSandbox: true, localSandboxNetwork: agencyConfig?.localSandboxNetwork === true };
};
