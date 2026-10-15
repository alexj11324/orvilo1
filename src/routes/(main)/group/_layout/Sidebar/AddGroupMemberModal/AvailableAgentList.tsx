'use client';

import { agentDisplayName } from '@orvilo/types';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { type ChangeEvent } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso } from 'react-virtuoso';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import AgentSelectionEmpty from '@/features/AgentSelectionEmpty';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import { type AgentItemData } from './AgentItem';
import AgentItem from './AgentItem';

type Row = { agent: AgentItemData; type: 'agent' } | { label: string; type: 'header' };

const styles = {
  container: 'select-none overflow-hidden flex flex-1 flex-col pbs-3 px-3 pbe-0',
  sectionHeader: 'pbs-1.5 pbe-1 px-2 text-xs leading-5 text-muted-foreground',
};

interface AvailableAgentListProps {
  agents: AgentItemData[];
  isLoading: boolean;
}

const AvailableAgentList = memo<AvailableAgentListProps>(({ agents, isLoading }) => {
  const { t } = useTranslation(['chat', 'common']);
  const [searchTerm, setSearchTerm] = useState('');

  const defaultTitle = useMemo(() => t('defaultSession', { ns: 'common' }), [t]);

  // Mirror the CreateGroupModal split: derive private agent ids from the home
  // store so we can bucket the modal's flat list into private/workspace
  // sections without changing the shared `AvailableAgentItem` payload.
  const privateGroups = useHomeStore(homeAgentListSelectors.privateAgentGroups, isEqual);
  const privatePinned = useHomeStore(homeAgentListSelectors.privatePinnedAgents, isEqual);
  const privateUngrouped = useHomeStore(homeAgentListSelectors.privateUngroupedAgents, isEqual);
  const privateAgentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of privateGroups) for (const a of g.items) ids.add(a.id);
    for (const a of privatePinned) ids.add(a.id);
    for (const a of privateUngrouped) ids.add(a.id);
    return ids;
  }, [privateGroups, privatePinned, privateUngrouped]);

  const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  // Filter agents based on search term (matches title or description)
  const filteredAgents = useMemo(() => {
    if (!searchTerm.trim()) return agents;

    const searchLower = searchTerm.toLowerCase();
    return agents.filter((agent) => {
      const title = agentDisplayName(agent) ?? '';
      const description = agent.description || '';
      return (
        title.toLowerCase().includes(searchLower) || description.toLowerCase().includes(searchLower)
      );
    });
  }, [agents, searchTerm]);

  const rows = useMemo<Row[]>(() => {
    const privateList: AgentItemData[] = [];
    const workspaceList: AgentItemData[] = [];
    for (const agent of filteredAgents) {
      (privateAgentIds.has(agent.id) ? privateList : workspaceList).push(agent);
    }

    if (privateList.length === 0 || workspaceList.length === 0) {
      return filteredAgents.map((agent) => ({ agent, type: 'agent' }));
    }

    return [
      { label: t('mention.category.privateAgents', { ns: 'chat' }), type: 'header' },
      ...privateList.map((agent) => ({ agent, type: 'agent' as const })),
      { label: t('mention.category.workspaceAgents', { ns: 'chat' }), type: 'header' },
      ...workspaceList.map((agent) => ({ agent, type: 'agent' as const })),
    ];
  }, [filteredAgents, privateAgentIds, t]);

  return (
    <div className={cn('flex flex-col gap-3', styles.container)}>
      <Input
        placeholder={t('memberSelection.searchAgents')}
        value={searchTerm}
        visualSize="compact"
        onChange={handleSearchChange}
      />

      <div className="flex min-h-0 flex-col flex-1">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-2">
            <Skeleton className="my-0.5 h-5.5 w-full" />
            <Skeleton className="my-0.5 h-5.5 w-full" />
            <Skeleton className="my-0.5 h-5.5 w-full" />
          </div>
        ) : filteredAgents.length === 0 ? (
          <AgentSelectionEmpty
            search={Boolean(searchTerm)}
            variant={searchTerm ? 'empty' : 'noAvailable'}
          />
        ) : (
          <Virtuoso
            className="flex-1"
            totalCount={rows.length}
            itemContent={(index) => {
              const row = rows[index];
              if (row.type === 'header') {
                return (
                  <div className={cn('text-xs text-muted-foreground', styles.sectionHeader)}>
                    {row.label}
                  </div>
                );
              }
              return (
                <AgentItem
                  showCheckbox
                  agent={row.agent}
                  defaultTitle={defaultTitle}
                  key={row.agent.id}
                />
              );
            }}
          />
        )}
      </div>
    </div>
  );
});

export default AvailableAgentList;
