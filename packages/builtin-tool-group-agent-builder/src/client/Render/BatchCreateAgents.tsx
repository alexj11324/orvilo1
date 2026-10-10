'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { Users } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import ToolTag from '@/features/ToolTag';

import type { BatchCreateAgentsParams, BatchCreateAgentsState } from '../../types';

const styles = {
  container: 'rounded-[8px] bg-[var(--ant-color-fill-quaternary)] px-4 py-1',
  description:
    'line-clamp-1 text-ellipsis text-[12px] leading-[1.5] text-[var(--ant-color-text-description)]',
  empty: 'p-4 text-[var(--ant-color-text-tertiary)]',
  item: 'py-3 not-last:[border-block-end:1px_solid_var(--sidebar-border)]',
  title: 'truncate text-[13px] font-medium',
};

interface AgentItemProps {
  agent: {
    agentId: string;
    success: boolean;
    title: string;
  };
  definition?: {
    avatar?: string;
    description?: string;
    title: string;
    tools?: string[];
  };
}

const AgentItem = memo<AgentItemProps>(({ agent, definition }) => {
  const avatar = definition?.avatar;
  const description = definition?.description;
  const tools = definition?.tools;

  return (
    <div className={cn('flex', 'items-start', 'gap-3', styles.item)}>
      <Avatar
        avatar={avatar}
        size={24}
        style={{ flexShrink: 0, marginTop: 4 }}
        title={agent.title}
      />
      <div className="flex flex-col flex-1 gap-1" style={{ minWidth: 0, overflow: 'hidden' }}>
        <span className={styles.title}>{agent.title}</span>
        {description && <span className={styles.description}>{description}</span>}
        {tools && tools.length > 0 && (
          <div className="flex gap-1 flex-wrap" style={{ marginTop: 8 }}>
            {tools.map((tool) => (
              <ToolTag identifier={tool} key={tool} variant={'compact'} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

const BatchCreateAgentsRender = memo<
  BuiltinRenderProps<BatchCreateAgentsParams, BatchCreateAgentsState>
>(({ args, pluginState }) => {
  const { t } = useTranslation('plugin');
  const { agents: resultAgents } = pluginState || {};
  const definitions = args?.agents || [];

  if (!resultAgents || resultAgents.length === 0) {
    return (
      <div className={cn('flex', 'flex-col', 'items-center', 'gap-2', styles.empty)}>
        <Users size={24} />
        <span>{t('builtins.orvilo-group-agent-builder.inspector.noResults')}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex', 'flex-col', styles.container)}>
      {resultAgents.map((agent, index) => (
        <AgentItem agent={agent} definition={definitions[index]} key={agent.agentId || index} />
      ))}
    </div>
  );
});

export default BatchCreateAgentsRender;
