import { Popover } from '@lobehub/ui/base-ui';
import { BUILTIN_AGENT_SLUGS } from '@orvilo/builtin-agents';
import { DEFAULT_AVATAR } from '@orvilo/const';
import { agentDisplayName } from '@orvilo/types';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import AgentList from '@/features/Home/AgentSelect/AgentList';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useInitBuiltinAgent } from '@/hooks/useInitBuiltinAgent';
import { useNavigateToAgent } from '@/hooks/useNavigateToAgent';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import SelectorTrigger from '../../components/SelectorTrigger';
import { useAgentId } from '../../hooks/useAgentId';
import { useActionBarContext } from '../context';

/**
 * Agent chip — the agent-first replacement for the model picker in the
 * conversation composer. Shows the bound agent's avatar + display name and
 * opens the shared agent list; picking another agent navigates to its
 * conversation (`/agent/:id`), which is how the main chat switches agents.
 */
const Agent = memo(() => {
  const { t } = useTranslation('chat');
  const { dropdownPlacement } = useActionBarContext();
  const agentId = useAgentId();
  const [open, setOpen] = useState(false);
  const { error, mutate } = useFetchAgentList();
  const navigateToAgent = useNavigateToAgent();
  // The task agent is a virtual row that never reaches the sidebar list — it
  // must be provisioned here so the dropdown can offer it (AgentList injects
  // it once `builtinAgentIdMap` resolves).
  useInitBuiltinAgent(BUILTIN_AGENT_SLUGS.taskAgent);

  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId));
  const title = agentDisplayName(meta, t('untitledAgent'));

  const handleSelect = useCallback(
    (id: string) => {
      setOpen(false);
      if (!id || id === agentId) return;
      navigateToAgent(id);
    },
    [agentId, navigateToAgent],
  );

  return (
    <Popover
      open={open}
      placement={dropdownPlacement ?? 'topRight'}
      styles={{ content: { padding: 0, width: 280 } }}
      trigger={'click'}
      content={
        <AgentList
          includeTaskAgent
          activeAgentId={agentId}
          error={error}
          onRetry={() => mutate()}
          onSelect={handleSelect}
        />
      }
      onOpenChange={setOpen}
    >
      <SelectorTrigger
        ariaLabel={title}
        text={title}
        leading={
          <Avatar
            avatar={meta.avatar || DEFAULT_AVATAR}
            background={meta.backgroundColor}
            name={title}
            shape={'square'}
            size={20}
          />
        }
      />
    </Popover>
  );
});

Agent.displayName = 'Agent';

export default Agent;
