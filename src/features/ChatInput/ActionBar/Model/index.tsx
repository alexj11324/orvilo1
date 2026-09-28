import { Tooltip } from '@lobehub/ui';
import { memo } from 'react';

import { aiModelSelectors, useAiInfraStore } from '@/store/aiInfra';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/slices/topic/selectors';

import SelectorTrigger from '../../components/SelectorTrigger';
import { useAgentId } from '../../hooks/useAgentId';
import { useAgentModelSelection } from '../../hooks/useAgentModelSelection';
import { useModelLockTooltip } from '../../hooks/useModelLockTooltip';

// Read-only model chip — the user-managed model picker is retired. A topic's
// pinned model still displays (top-level `topics.model` column) so the user can
// see which model the turn runs on.
const ModelSwitch = memo(() => {
  const agentId = useAgentId();
  const {
    canDisplayModel,
    canSelectModel,
    model: agentModel,
    provider: agentProvider,
    selectionLockReason,
  } = useAgentModelSelection(agentId);
  const topicModel = useChatStore(topicSelectors.activeTopicModel);
  const model = topicModel?.model ?? agentModel;
  const provider = topicModel?.model ? topicModel.provider : agentProvider;

  const enabledModel = useAiInfraStore(aiModelSelectors.getEnabledModelById(model, provider));
  const displayName = enabledModel?.displayName || model;
  const lockTooltip = useModelLockTooltip(displayName, selectionLockReason);

  if (!canDisplayModel) return null;

  const trigger = (
    <SelectorTrigger
      aria-disabled
      ariaLabel={displayName}
      style={{ cursor: 'default' }}
      text={displayName}
    />
  );

  // Locked: say which model is pinned AND why it can't be changed here — the
  // bare model name used to leave the inert chip unexplained.
  if (!canSelectModel) return <Tooltip title={lockTooltip ?? displayName}>{trigger}</Tooltip>;

  return trigger;
});

ModelSwitch.displayName = 'ModelSwitch';

export default ModelSwitch;
