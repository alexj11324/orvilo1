import { cn } from 'cn';
import { ChevronDownIcon, ChevronRightIcon, type LucideIcon } from 'lucide-react';
import { type ComponentProps, type ReactNode } from 'react';
import { createElement, memo, Suspense, useState } from 'react';

import { Button } from '@/components/ui/button';
import { BriefCardSkeleton } from '@/features/DailyBrief/BriefCardSkeleton';

import CountBadge from '../CountBadge';
import { homeType } from '../homeType';

interface GroupBlockProps extends Omit<ComponentProps<'div'>, 'title'> {
  action?: ReactNode;
  actionAlwaysVisible?: boolean;
  /**
   * Folds the body away, leaving the title row. Only rendered as a control when
   * `onCollapsedChange` is supplied — a block nobody can re-open must not fold.
   */
  collapsed?: boolean;
  count?: number;
  icon?: LucideIcon;
  onCollapsedChange?: (collapsed: boolean) => void;
  title?: ReactNode;
}

const styles = {
  action:
    'opacity-0 transition-opacity duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-in-out) focus-within:opacity-100 [&_button]:text-muted-foreground',
  actionVisible: 'opacity-100',
  heading:
    'min-w-0 p-0 border-0 text-start bg-transparent aria-expanded:bg-transparent hover:bg-transparent active:not-aria-[haspopup]:translate-y-0',
};

const GroupBlock = memo<GroupBlockProps>(
  ({
    title,
    action,
    actionAlwaysVisible,
    children,
    collapsed = false,
    count,
    icon,
    onCollapsedChange,
    ...rest
  }) => {
    const [isHovered, setIsHovered] = useState(false);
    const heading = (
      <>
        {icon && createElement(icon, { className: 'text-foreground-description', size: 16 })}
        <div className={cn('truncate', homeType.sectionLabel)}>{title}</div>
        {count !== undefined && <CountBadge count={count} />}
        {onCollapsedChange &&
          createElement(collapsed ? ChevronRightIcon : ChevronDownIcon, {
            className: 'size-4 text-foreground-quaternary',
            size: 16,
          })}
      </>
    );

    return (
      <div
        className="flex flex-col gap-3"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        {...rest}
      >
        <div className="flex items-center justify-between">
          {onCollapsedChange ? (
            <Button
              aria-expanded={onCollapsedChange ? !collapsed : undefined}
              nativeButton={false}
              render={<div />}
              role={onCollapsedChange ? 'button' : undefined}
              size="lg"
              tabIndex={onCollapsedChange ? 0 : undefined}
              type="button"
              variant="ghost"
              className={cn(
                styles.heading,
                'flex items-center flex-1 gap-1.5 justify-start overflow-hidden',
              )}
              onClick={onCollapsedChange ? () => onCollapsedChange(!collapsed) : undefined}
            >
              {heading}
            </Button>
          ) : (
            <div className="flex items-center flex-1 gap-1.5 justify-start overflow-hidden">
              {heading}
            </div>
          )}
          <div
            className={cn(
              cn(styles.action, (isHovered || actionAlwaysVisible) && styles.actionVisible),
              'flex items-center flex-none gap-0.5 justify-end',
            )}
          >
            {action}
          </div>
        </div>
        {!collapsed && <Suspense fallback={<BriefCardSkeleton />}>{children}</Suspense>}
      </div>
    );
  },
);

export default GroupBlock;
