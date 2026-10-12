import { agentDisplayName } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

/**
 * Weak in-flow separator inserted where the topic's bound agent changed —
 * the mid-conversation handoff marker from the topic-centric workspace model.
 * Looks up the target agent's display name; no model/runtime metadata, the
 * handoff is a conversation fact, not a config dump.
 */
const AgentHandoffMarker = memo<{ toAgentId: string }>(({ toAgentId }) => {
  const { t } = useTranslation('chat');
  const meta = useAgentStore(agentSelectors.getAgentMetaById(toAgentId));
  const name = agentDisplayName(meta, t('untitledAgent'));

  return (
    <div aria-hidden className="flex items-center gap-3 px-4 py-2">
      <span className="h-px flex-1 bg-divider" />
      <span className="flex-none text-xs leading-5 whitespace-nowrap text-foreground-description">
        {t('agentHandoffMarker', { name })}
      </span>
      <span className="h-px flex-1 bg-divider" />
    </div>
  );
});

AgentHandoffMarker.displayName = 'AgentHandoffMarker';

export default AgentHandoffMarker;
