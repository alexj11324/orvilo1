import { agentDisplayName } from '@orvilo/types';
import { Command } from 'cmdk';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import { useCommandMenuContext } from './CommandMenuContext';
import { CommandItem } from './components';
import { styles } from './styles';
import { useCommandMenu } from './useCommandMenu';

const AskAIMenu = memo(() => {
  const { t } = useTranslation(['common', 'chat', 'home']);
  const navigate = useWorkspaceAwareNavigate();
  const { handleAskOrviloAI, closeCommandMenu } = useCommandMenu();
  const { search } = useCommandMenuContext();

  // Get agent list (limit to first 20 items for simplicity)
  const allAgents = useHomeStore(homeAgentListSelectors.allAgents);
  const agents = allAgents.filter((item) => item.type === 'agent').slice(0, 20);

  const heading = search.trim()
    ? t('cmdk.askAIHeading', { query: `"${search.trim()}"` })
    : t('cmdk.askAIHeadingEmpty');

  const handleAgentSelect = (agentId: string) => {
    if (search.trim()) {
      const message = encodeURIComponent(search.trim());
      navigate(`/agent/${agentId}?message=${message}`);
    } else {
      navigate(`/agent/${agentId}`);
    }
    closeCommandMenu();
  };

  return (
    <Command.Group heading={heading}>
      <Command.Item value="orvilo-ai" onSelect={handleAskOrviloAI}>
        <AgentRuntimeIcon size={18} type="orvilo" />
        <div className={styles.itemContent}>
          <div className={styles.itemLabel}>Orvilo AI</div>
        </div>
      </Command.Item>
      {agents.map((agent) => (
        <CommandItem
          icon={<AssigneeAvatar agentId={agent.id} size={18} />}
          key={agent.id}
          title={agentDisplayName(agent, t('defaultAgent'))}
          trailingLabel={t('cmdk.search.agent')}
          value={`agent-${agent.id}`}
          variant="detailed"
          onSelect={() => handleAgentSelect(agent.id)}
        />
      ))}
    </Command.Group>
  );
});

AskAIMenu.displayName = 'AskAIMenu';

export default AskAIMenu;
