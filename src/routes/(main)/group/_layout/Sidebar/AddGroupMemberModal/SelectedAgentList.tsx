'use client';

import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import AgentSelectionEmpty from '@/features/AgentSelectionEmpty';

import { type AgentItemData } from './AgentItem';
import AgentItem from './AgentItem';
import { useAgentSelectionStore } from './store';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    overflow-y: auto;
    flex: 1;
    padding: ${cssVar.paddingSM}px;
  `,
  title: css`
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
  `,
}));

interface SelectedAgentListProps {
  agents: AgentItemData[];
}

const SelectedAgentList = memo<SelectedAgentListProps>(({ agents }) => {
  const { t } = useTranslation(['chat', 'common']);

  const selectedAgentIds = useAgentSelectionStore((s) => s.selectedAgentIds);

  const defaultTitle = useMemo(() => t('defaultSession', { ns: 'common' }), [t]);

  // Get selected agents data
  const selectedAgents = useMemo(() => {
    return selectedAgentIds
      .map((id) => agents.find((a) => a.id === id))
      .filter((a): a is AgentItemData => a !== undefined);
  }, [agents, selectedAgentIds]);

  if (selectedAgents.length === 0) {
    return (
      <div className={cn('flex flex-col flex-1', styles.container)}>
        <AgentSelectionEmpty variant="noSelected" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1', styles.container)}>
      <div className={styles.title}>
        {t('memberSelection.selectedAgents', { count: selectedAgents.length })}
      </div>
      <div className="flex flex-col">
        {selectedAgents.map((agent) => (
          <AgentItem showRemove agent={agent} defaultTitle={defaultTitle} key={agent.id} />
        ))}
      </div>
    </div>
  );
});

export default SelectedAgentList;
