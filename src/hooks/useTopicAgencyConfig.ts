import { resolveTopicAgencyConfig } from '@/helpers/topicExecutionConfig';
import { useEffectiveAgencyConfig } from '@/hooks/useEffectiveAgencyConfig';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/slices/topic/selectors';
import { useServerConfigStore } from '@/store/serverConfig';
import { featureFlagsSelectors } from '@/store/serverConfig/selectors';

/** Chat-only overlay; Agent profile settings continue to edit defaults. */
export const useTopicAgencyConfig = (agentId?: string, topicId?: string | null) => {
  const defaults = useEffectiveAgencyConfig(agentId);
  const cloudSandboxAvailable = useServerConfigStore(
    (s) => featureFlagsSelectors(s).enableCloudSandbox === true,
  );
  const execution = useChatStore((s) => {
    const destination =
      topicId !== undefined ? topicId : topicSelectors.activeTopicIdForAgent(agentId)(s);
    return destination
      ? topicSelectors.getTopicById(destination)(s)?.metadata?.executionConfig
      : undefined;
  });
  return {
    ...defaults,
    ...resolveTopicAgencyConfig(
      defaults.agencyConfig,
      execution,
      defaults.workspaceScoped,
      cloudSandboxAvailable,
    ),
  };
};
