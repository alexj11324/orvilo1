'use client';

import { Avatar } from '@lobehub/ui/base-ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { Users } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ToolTag from '@/features/ToolTag';

import type { BatchCreateAgentsParams, BatchCreateAgentsState } from '../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    padding-block: 4px;
    padding-inline: 16px;
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
  `,
  description: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    font-size: 12px;
    line-height: 1.5;
    color: ${cssVar.colorTextDescription};
    text-overflow: ellipsis;
  `,
  empty: css`
    padding: 16px;
    color: ${cssVar.colorTextTertiary};
  `,
  item: css`
    padding-block: 12px;

    &:not(:last-child) {
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  title: css`
    overflow: hidden;

    font-size: 13px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

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
