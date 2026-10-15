import { cn } from 'cn';
import { memo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

import AccordionArrowIcon from '../shared/AccordionArrowIcon';
import { taskDetailLayoutStyles } from './taskDetailLayoutStyles';

interface TaskDetailSectionHeaderProps {
  /** Trailing controls, e.g. a "+" — render them only when they can act. */
  actions?: ReactNode;
  /** Muted count after the title. Omitted while unknown. */
  count?: number;
  onToggle: () => void;
  open: boolean;
  title: string;
  /** Status or filters that sit right after the toggle. */
  trailing?: ReactNode;
  /**
   * 'heading' promotes the band to the 15px/600 top-level tier (Linear's
   * Activity header); the default stays the compact 12px/500 collapse label.
   */
  variant?: 'default' | 'heading';
}

/**
 * One header for every body section of an issue (Sub-issues, Artifacts,
 * Attachments, Activity): a flat row like Linear's — the collapse button is
 * a 24px transparent label led by the folding chevron, the muted count reads
 * inline, and section actions close the row on the right. 'heading' lifts
 * the band to the 15px/600 tier inside a 32px container (Linear's Activity
 * header); the compact sections stay 12px/500 at 24px.
 */
const TaskDetailSectionHeader = memo<TaskDetailSectionHeaderProps>(
  ({ actions, count, onToggle, open, title, trailing, variant = 'default' }) => (
    <div
      className={cn(
        'flex items-center justify-between gap-2',
        variant === 'heading' ? 'min-h-8' : 'min-h-6',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Button
          aria-expanded={open}
          size="xs"
          type="button"
          variant="ghost"
          className={cn(
            // Linear's collapse header is flat — the ghost button keeps no
            // padding, border or fill, and the label stays secondary-ink in
            // every state; the hover reveal belongs to the row's right side.
            'gap-1.5 px-0 border-0 bg-transparent text-xs font-medium text-muted-foreground',
            'hover:bg-transparent hover:text-muted-foreground',
            'aria-expanded:bg-transparent aria-expanded:text-muted-foreground',
            'active:not-aria-[haspopup]:translate-y-0',
            variant === 'heading' && `h-8 ${taskDetailLayoutStyles.sectionHeading}`,
          )}
          onClick={onToggle}
        >
          <AccordionArrowIcon
            aria-hidden
            isOpen={open}
            style={{ color: 'var(--ant-color-text-description)' }}
          />
          <span>{title}</span>
          {typeof count === 'number' && (
            <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
          )}
        </Button>
        {trailing}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  ),
);

export default TaskDetailSectionHeader;
