import { agentDisplayName } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { ChevronsUpDownIcon } from 'lucide-react';
import { memo, Suspense, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type SidebarAgentItem } from '@/database/repositories/home';
import { AgentRuntimeIcon } from '@/features/AgentRuntimeIcon';
import { conversationSelectors, useConversationStore } from '@/features/Conversation';
import { useKeepSidebarListed } from '@/features/HomeSidebar/Body/Agent/List/useAgentList';
import { AgentModalProvider } from '@/features/HomeSidebar/Body/Agent/ModalProvider';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import AgentItem from '@/features/PageEditor/Copilot/AgentSelector/AgentItem';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

const styles = {
  chevron: 'size-4 text-foreground-quaternary',
  container: 'cursor-pointer gap-1 bg-accent px-1.5 hover:bg-selected',
  sectionHeader: 'px-2 py-1 text-xs leading-5 text-foreground-tertiary',
};

interface AgentSelectorActionProps {
  onAgentChange: (id: string) => void;
}

const AgentSelectorAction = memo<AgentSelectorActionProps>(({ onAgentChange }) => {
  const { t } = useTranslation(['chat', 'topic']);
  const [open, setOpen] = useState(false);
  const agentId = useConversationStore(conversationSelectors.agentId);

  const pinnedAgents = useHomeStore(homeAgentListSelectors.pinnedAgents, isEqual);
  const agentGroups = useHomeStore(homeAgentListSelectors.agentGroups, isEqual);
  const ungroupedAgents = useHomeStore(homeAgentListSelectors.ungroupedAgents, isEqual);
  const privateAgentGroups = useHomeStore(homeAgentListSelectors.privateAgentGroups, isEqual);
  const privatePinnedAgents = useHomeStore(homeAgentListSelectors.privatePinnedAgents, isEqual);
  const privateUngroupedAgents = useHomeStore(
    homeAgentListSelectors.privateUngroupedAgents,
    isEqual,
  );
  const hasPrivateAgents = useHomeStore(homeAgentListSelectors.hasPrivateAgents);
  const isAgentListInit = useHomeStore(homeAgentListSelectors.isAgentListInit);

  useFetchAgentList();
  const keepListed = useKeepSidebarListed();
  const workspaceAgents = useMemo<SidebarAgentItem[]>(() => {
    const groupedItems = agentGroups.flatMap((group) => group.items);
    const merged = keepListed(
      [...pinnedAgents, ...groupedItems, ...ungroupedAgents].filter(
        (agent) => agent.type === 'agent',
      ),
    );

    return merged;
  }, [pinnedAgents, agentGroups, ungroupedAgents, keepListed]);

  const privateAgents = useMemo<SidebarAgentItem[]>(() => {
    const groupedItems = privateAgentGroups.flatMap((group) => group.items);
    return keepListed(
      [...privatePinnedAgents, ...groupedItems, ...privateUngroupedAgents].filter(
        (agent) => agent.type === 'agent',
      ),
    );
  }, [privateAgentGroups, privatePinnedAgents, privateUngroupedAgents, keepListed]);

  const activeAgent = useMemo(
    () => [...privateAgents, ...workspaceAgents].find((agent) => agent.id === agentId),
    [agentId, privateAgents, workspaceAgents],
  );

  const handleAgentChange = useCallback(
    (id: string) => {
      onAgentChange(id);
    },
    [onAgentChange],
  );

  const renderAgentItems = (list: SidebarAgentItem[]) =>
    list.map((agent) => (
      <AgentItem
        active={agent.id === agentId}
        agent={agent}
        agentId={agent.id}
        agentTitle={agentDisplayName(agent, t('untitledAgent', { ns: 'chat' }))}
        key={agent.id}
        onAgentChange={handleAgentChange}
        onClose={() => setOpen(false)}
      />
    ));

  const renderAgents = (
    <div
      className="flex flex-col gap-1 p-2"
      style={{
        maxHeight: '50vh',
        overflowY: 'auto',
        width: '100%',
      }}
    >
      {hasPrivateAgents ? (
        <>
          {privateAgents.length > 0 && (
            <>
              <div className={styles.sectionHeader}>
                {t('taskManager.agentSelector.privateGroup', { ns: 'topic' })}
              </div>
              {renderAgentItems(privateAgents)}
            </>
          )}
          {workspaceAgents.length > 0 && (
            <>
              <div className={styles.sectionHeader}>
                {t('taskManager.agentSelector.workspaceGroup', { ns: 'topic' })}
              </div>
              {renderAgentItems(workspaceAgents)}
            </>
          )}
        </>
      ) : (
        renderAgentItems(workspaceAgents)
      )}
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            className={styles.container}
            size="compact"
            type={'button'}
            variant="ghost"
            aria-label={
              activeAgent
                ? t('taskDetail.fieldValue', {
                    field: t('taskDetail.agent'),
                    value: agentDisplayName(activeAgent, t('untitledAgent', { ns: 'chat' })),
                  })
                : t('taskDetail.agent')
            }
          >
            <AgentRuntimeIcon
              size={16}
              type={activeAgent && (activeAgent.heterogeneousType || 'orvilo')}
            />
            <ChevronsUpDownIcon className={styles.chevron} size={16} />
          </Button>
        }
      />
      <PopoverContent align={'start'} className="w-60 p-0" side={'top'}>
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
