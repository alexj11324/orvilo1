import { cssVar } from 'antd-style';
import type { LucideIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

import AccordionArrowIcon from '../shared/AccordionArrowIcon';

interface TaskDetailSectionHeaderProps {
  /** Trailing controls, e.g. a "+" — render them only when they can act. */
  actions?: ReactNode;
  /** Muted count after the title. Omitted while unknown. */
  count?: number;
  icon: LucideIcon;
  onToggle: () => void;
  open: boolean;
  title: string;
  /** Status or filters that sit right after the toggle. */
  trailing?: ReactNode;
}

/**
 * One header for every body section of an issue (Sub-issues, Artifacts,
 * Attachments, Activity): icon, title, muted count and a collapse toggle that
 * is a real button, then optional status and trailing actions.
 */
const TaskDetailSectionHeader = memo<TaskDetailSectionHeaderProps>(
  ({ actions, count, icon: Icon, onToggle, open, title, trailing }) => (
    <div className="flex min-h-7 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          aria-expanded={open}
          className="gap-2 text-sm font-medium text-muted-foreground"
          size="sm"
          type="button"
          variant="ghost"
          onClick={onToggle}
        >
          <Icon aria-hidden color={cssVar.colorTextDescription} size={16} />
          <span>{title}</span>
          {typeof count === 'number' && (
            <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
          )}
          <AccordionArrowIcon
            aria-hidden
            isOpen={open}
            style={{ color: cssVar.colorTextDescription }}
          />
        </Button>
        {trailing}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  ),
);

export default TaskDetailSectionHeader;
