import { resolveBoundExecutionDeviceId } from '@/helpers/executionTarget';
import { useIsGatewayModeEnabled } from '@/helpers/gatewayMode';
import { useTopicAgencyConfig } from '@/hooks/useTopicAgencyConfig';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

/**
 * The device to scan for an agent's filesystem skills; `undefined` reads this
 * machine. Built on the same effective config as the working sidebar, so the
 * slash menu, the skill chips and the Skills panel share one scan.
 *
 * `clientExecutionAvailable` is the caller's platform fact (the desktop build
 * can run on this machine); it is passed in so this hook stays host-neutral.
 */
export const useProjectSkillsDeviceId = (
  agentId: string | undefined,
  clientExecutionAvailable: boolean,
): string | undefined => {
  const { agencyConfig, workspaceScoped } = useTopicAgencyConfig(agentId);
  const isHetero = useAgentStore((s) =>
    agentId ? agentByIdSelectors.isAgentHeterogeneousById(agentId)(s) : false,
  );
  const deviceRoutingAvailable = useIsGatewayModeEnabled(agentId);

  return resolveBoundExecutionDeviceId(agencyConfig, {
    clientExecutionAvailable,
    deviceRoutingAvailable,
    isHetero,
    workspaceScoped,
  });
};
