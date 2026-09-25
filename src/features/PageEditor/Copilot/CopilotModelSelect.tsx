import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';

import { conversationSelectors, useConversationStore } from '@/features/Conversation';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { aiModelSelectors, useAiInfraStore } from '@/store/aiInfra';

const styles = createStaticStyles(({ css, cssVar }) => ({
  name: css`
    overflow: hidden;

    max-width: 120px;

    font-size: 12px;
    line-height: 1;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

// Read-only model label — the user-managed model picker is retired; the
// copilot runs on the agent's configured model.
const CopilotModelSelect = memo(() => {
  const agentId = useConversationStore(conversationSelectors.agentId);

  const [model, provider] = useAgentStore((s) => [
    agentByIdSelectors.getAgentModelById(agentId)(s),
    agentByIdSelectors.getAgentModelProviderById(agentId)(s),
  ]);

  const enabledModel = useAiInfraStore(aiModelSelectors.getEnabledModelById(model, provider));
  const displayName = enabledModel?.displayName || model;

  return (
    <Flexbox horizontal align={'center'}>
      <span className={styles.name}>{displayName}</span>
    </Flexbox>
  );
});

CopilotModelSelect.displayName = 'CopilotModelSelect';

export default CopilotModelSelect;
