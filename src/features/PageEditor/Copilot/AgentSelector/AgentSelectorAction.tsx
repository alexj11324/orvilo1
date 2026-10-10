import { agentDisplayName, type SidebarAgentItem } from '@orvilo/types';
import { ChevronsUpDownIcon } from 'lucide-react';
import { memo, Suspense, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AgentRuntimeIcon } from '@/features/AgentRuntimeIcon';
import { conversationSelectors, useConversationStore } from '@/features/Conversation';
import { AgentModalProvider } from '@/features/HomeSidebar/Body/Agent/ModalProvider';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useAgentStore } from '@/store/agent';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import AgentItem from './AgentItem';

interface AgentSelectorActionProps {
  onAgentChange: (id: string) => void;
}

const AgentSelectorAction = memo<AgentSelectorActionProps>(({ onAgentChange }) => {
  const { t } = useTranslation(['chat', 'common']);
  const [open, setOpen] = useState(false);
  const agentId = useConversationStore(conversationSelectors.agentId);

  const agents = useHomeStore(homeAgentListSelectors.allAgents);
  const isAgentListInit = useHomeStore(homeAgentListSelectors.isAgentListInit);
  const pageAgentId = useAgentStore((s) => s.builtinAgentIdMap['page-agent']);
  const pageAgentData = useAgentStore((s) => s.agentMap[pageAgentId || '']);

  useFetchAgentList();

  const agentsWithBuiltin = useMemo<SidebarAgentItem[]>(() => {
    // Page Copilot only supports selecting agent sessions, not group sessions.
    const availableAgents = agents.filter((agent) => agent.type === 'agent');
    const hasPageAgent = availableAgents.some((agent) => agent.id === pageAgentId);

    if (pageAgentId && !hasPageAgent) {
      return [
        {
          avatar: pageAgentData?.avatar || null,
          description: pageAgentData?.description || null,
          id: pageAgentId,
          pinned: false,
          title: t('builtinCopilot'),
          type: 'agent' as const,
          updatedAt: new Date(),
        },
        ...availableAgents,
      ];
    }

    return availableAgents;
  }, [agents, pageAgentId, pageAgentData, t]);

  const activeAgent = useMemo(
    () => agentsWithBuiltin.find((agent) => agent.id === agentId),
    [agentId, agentsWithBuiltin],
  );

  const handleAgentChange = useCallback(
    (id: string) => {
      onAgentChange(id);
    },
    [onAgentChange],
  );

  const renderAgents = (
    <div className="flex max-h-[50vh] w-full flex-col gap-1 overflow-y-auto p-2">
      {agentsWithBuiltin.map((agent) => (
        <AgentItem
          active={agent.id === agentId}
          agent={agent}
          agentId={agent.id}
          agentTitle={agentDisplayName(agent, t('untitledAgent', { ns: 'chat' }))}
          key={agent.id}
          onAgentChange={handleAgentChange}
          onClose={() => setOpen(false)}
        />
      ))}
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            className="px-1.5 text-sm leading-5.5"
            size="compact"
            variant="secondary"
            aria-label={
              activeAgent
                ? agentDisplayName(activeAgent, t('untitledAgent', { ns: 'chat' }))
                : t('builtinCopilot')
            }
          >
            <div className="flex items-center gap-1">
              <AgentRuntimeIcon
                size={16}
                type={activeAgent && (activeAgent.heterogeneousType || 'orvilo')}
              />
              <ChevronsUpDownIcon className="size-3.5 text-foreground-quaternary" size={14} />
            </div>
          </Button>
        }
      />
      <PopoverContent align="start" className="w-60 p-0" side="top">
        <Suspense fallback={<SkeletonList rows={6} />}>
          <AgentModalProvider>
            {isAgentListInit ? renderAgents : <SkeletonList rows={6} />}
          </AgentModalProvider>
        </Suspense>
      </PopoverContent>
    </Popover>
  );
});

AgentSelectorAction.displayName = 'AgentSelectorAction';

export default AgentSelectorAction;
