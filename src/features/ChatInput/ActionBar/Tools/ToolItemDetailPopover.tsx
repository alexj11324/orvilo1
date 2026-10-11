import { cn } from 'cn';
import { memo, type ReactNode } from 'react';

import { Badge } from '@/components/reui/badge';

const styles = {
  container: 'w-80 p-3',
  description: 'line-clamp-6 text-sm leading-5.5 text-muted-foreground',
  identifier: 'truncate font-mono text-xs leading-5 text-foreground-tertiary',
  title: 'text-sm leading-5.5 font-semibold text-foreground',
};

interface ToolItemDetailPopoverProps {
  description?: ReactNode;
  icon?: ReactNode;
  identifier?: string;
  meta?: ReactNode;
  sourceLabel?: string;
  title: ReactNode;
}

/**
 * Hover popover content for items rendered in the skill panel.
 * Mirrors the structure of ModelDetailPanel but kept lightweight: a header
 * row (icon + title + source tag), a description block, and an optional
 * identifier line for technical reference.
 */
const ToolItemDetailPopover = memo<ToolItemDetailPopoverProps>(
  ({ icon, title, description, sourceLabel, identifier, meta }) => {
    return (
      <div className={cn('flex flex-col gap-2.5', styles.container)}>
        <div className="flex flex-row items-center gap-2.5">
          {icon}
          <div className="flex flex-col flex-1 min-w-0 gap-0.5">
            <div className="flex flex-row items-center gap-1.5">
              <div className={cn('truncate', styles.title)}>{title}</div>
              {sourceLabel && (
                <Badge className="shrink-0" size="sm" variant="secondary">
                  {sourceLabel}
                </Badge>
              )}
            </div>
            {identifier && <span className={styles.identifier}>{identifier}</span>}
          </div>
        </div>
        {description && <div className={styles.description}>{description}</div>}
        {meta}
      </div>
    );
  },
);

ToolItemDetailPopover.displayName = 'ToolItemDetailPopover';

export default ToolItemDetailPopover;
