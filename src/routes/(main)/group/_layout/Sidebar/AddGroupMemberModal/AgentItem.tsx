'use client';

import { agentDisplayName } from '@orvilo/types';
import { cn } from 'cn';
import { X } from 'lucide-react';
import { memo } from 'react';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

import { useAgentSelectionStore } from './store';

const styles = {
  item: 'my-0.25 py-1 px-2 rounded-(--radius-card) text-sm leading-5.5 transition-[background-color] duration-(--orvilo-motion-mid) ease-in-out hover:bg-accent motion-reduce:transition-none',
  removeButton:
    'shrink-0 w-8 rounded-(--radius-button) p-0 text-foreground-tertiary transition-colors duration-(--orvilo-motion-mid) ease-in-out hover:text-foreground hover:bg-selected motion-reduce:transition-none',
  title: 'overflow-hidden flex-1 text-ellipsis whitespace-nowrap text-sm leading-5.5',
};

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
      className={cn(
        styles.item,
        showCheckbox ? 'cursor-pointer' : 'cursor-default',
        isSelected && 'bg-selected hover:bg-selected',
      )}
      onClick={showCheckbox ? handleClick : undefined}
    >
      <div className="flex w-full items-center gap-2">
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
        <span className="flex size-8 flex-none items-center justify-center">
          <AgentRuntimeIcon size={16} type={agent.heterogeneousType} />
        </span>
        <div className={cn('truncate', styles.title)}>{title}</div>
        {showRemove && (
          <Button
            aria-label={title}
            className={styles.removeButton}
            size="compact"
            type="button"
            variant="ghost"
            onClick={handleRemove}
          >
            <X className="size-4" size={16} />
          </Button>
        )}
      </div>
    </div>
  );
});

export default AgentItem;
