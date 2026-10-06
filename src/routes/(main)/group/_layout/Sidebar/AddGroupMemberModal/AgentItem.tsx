'use client';

import { agentDisplayName } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { X } from 'lucide-react';
import { memo } from 'react';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import { Checkbox } from '@/components/ui/checkbox';

import { useAgentSelectionStore } from './store';

const styles = createStaticStyles(({ css, cssVar }) => ({
  item: css`
    cursor: pointer;

    margin-block: 1px;
    padding-block: 6px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    transition: background 0.2s ease;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  removeButton: css`
    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: center;

    width: 20px;
    height: 20px;
    border-radius: 4px;

    color: ${cssVar.colorTextTertiary};

    transition: all 0.2s ease;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
  title: css`
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

export interface AgentItemData {
  avatar: string | null;
  backgroundColor: string | null;
  description: string | null;
  heterogeneousType?: string | null;
  id: string;
  name?: string | null;
  title: string | null;
}

interface AgentItemProps {
  agent: AgentItemData;
  defaultTitle: string;
  showCheckbox?: boolean;
  showRemove?: boolean;
}

const AgentItem = memo<AgentItemProps>(({ agent, defaultTitle, showCheckbox, showRemove }) => {
  const isSelected = useAgentSelectionStore((s) => s.selectedAgentIds.includes(agent.id));
  const toggleAgent = useAgentSelectionStore((s) => s.toggleAgent);
  const removeAgent = useAgentSelectionStore((s) => s.removeAgent);

  const title = agentDisplayName(agent, defaultTitle);

  const handleClick = () => {
    toggleAgent(agent.id);
  };

  const handleRemove = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    removeAgent(agent.id);
  };

  return (
    <div
      className={styles.item}
      style={{ cursor: showCheckbox ? 'pointer' : 'default' }}
      onClick={showCheckbox ? handleClick : undefined}
    >
      <div className="flex items-center gap-2" style={{ width: '100%' }}>
        {showCheckbox && (
          <Checkbox
            aria-label={title}
            checked={isSelected}
            onCheckedChange={handleClick}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        )}
        <AgentRuntimeIcon size={28} type={agent.heterogeneousType} />
        <div className={cn('truncate', styles.title)}>{title}</div>
        {showRemove && (
          <div className={styles.removeButton} onClick={handleRemove}>
            <X size={14} />
          </div>
        )}
      </div>
    </div>
  );
});

export default AgentItem;
