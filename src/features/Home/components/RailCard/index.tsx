import { cn } from 'cn';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { createElement, memo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

import CountBadge from '../CountBadge';
import { homeType } from '../homeType';

const styles = {
  card: 'p-4 border border-divider rounded-(--radius-card) bg-[color-mix(in_srgb,var(--card)_72%,transparent)] [backdrop-filter:saturate(150%)_blur(12px)]',
  heading:
    'min-w-0 justify-start p-0 border-0 text-start bg-transparent aria-expanded:bg-transparent [&:hover]:bg-transparent active:not-aria-[haspopup]:translate-y-0 [&:hover_.home-rail-card-chevron]:text-muted-foreground',
};

interface RailCardProps {
  action?: ReactNode;
  children: ReactNode;
  /**
   * Folds the body away, leaving the title row. Only rendered as a control when
   * `onCollapsedChange` is supplied — a card nobody can re-open must not fold.
   */
  collapsed?: boolean;
  count?: number;
  onCollapsedChange?: (collapsed: boolean) => void;
  title?: ReactNode;
}

const RailCard = memo<RailCardProps>(
  ({ action, children, collapsed = false, count, onCollapsedChange, title }) => {
    const heading = (
      <div className="flex min-w-0 items-center gap-1.5">
        <div className={cn('truncate', homeType.sectionLabel)}>{title}</div>
        {count !== undefined && <CountBadge count={count} />}
        {onCollapsedChange &&
          createElement(collapsed ? ChevronRightIcon : ChevronDownIcon, {
            className: 'home-rail-card-chevron size-3.5 text-foreground-quaternary',
            size: 14,
          })}
      </div>
    );

    return (
      <div className={cn(styles.card, 'flex flex-col gap-3')} data-testid={'home-rail-card'}>
        {title && (
          <div className="flex items-center gap-2 justify-between">
            {onCollapsedChange ? (
              <Button
                aria-expanded={!collapsed}
                className={styles.heading}
                data-testid={'home-rail-card-toggle'}
                size="lg"
                type={'button'}
                variant="ghost"
                onClick={() => onCollapsedChange(!collapsed)}
              >
                {heading}
              </Button>
            ) : (
              heading
            )}
            {action && <div className="flex items-center flex-none gap-0.5">{action}</div>}
          </div>
        )}
        {!collapsed && children}
      </div>
    );
  },
);

export default RailCard;
