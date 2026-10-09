'use client';

import { cn } from 'cn';
import { memo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface ConnectorRowProps {
  /** Status badge or action button. A sibling of the select control, never inside it. */
  action?: ReactNode;
  active?: boolean;
  icon?: ReactNode;
  /** Dim the title of a connector that is not connected. */
  muted?: boolean;
  onSelect: () => void;
  /** Non-interactive tag shown inside the select control (e.g. the owning agent). */
  tag?: ReactNode;
  title: string;
}

/**
 * A connector list row: a plain container with a stretched select button and an
 * optional action sibling. The select button's `after` layer covers the whole
 * row so any click selects it, while the action sits above that layer
 * (`relative z-10`) and keeps its own click. Nothing interactive is nested
 * inside another interactive element.
 */
const ConnectorRow = memo<ConnectorRowProps>(
  ({ action, active, icon, muted, onSelect, tag, title }) => (
    <div
      className={cn(
        'relative flex h-7 min-w-0 items-center gap-2 rounded-md px-1 hover:bg-accent/60',
        active && 'bg-accent',
      )}
    >
      <Button
        aria-current={active ? 'true' : undefined}
        size="sm"
        variant="ghost"
        className={cn(
          'h-full min-w-0 flex-1 justify-start gap-2 rounded-md px-0 text-left font-medium hover:bg-transparent',
          'after:absolute after:inset-0 after:rounded-md after:content-[""]',
        )}
        onClick={onSelect}
      >
        {icon && <span className="flex size-7 flex-none items-center justify-center">{icon}</span>}
        <span
          title={title}
          className={cn(
            'flex-1 truncate text-[13px] font-medium',
            active
              ? 'text-foreground'
              : muted
                ? 'text-muted-foreground/70'
                : 'text-muted-foreground',
          )}
        >
          {title}
        </span>
        {tag}
      </Button>
      {action && <div className="relative z-10 flex flex-none items-center gap-0.5">{action}</div>}
    </div>
  ),
);

ConnectorRow.displayName = 'ConnectorRow';

export default ConnectorRow;
