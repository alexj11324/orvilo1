import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { ChevronDownIcon, ChevronRightIcon, type LucideIcon } from 'lucide-react';
import { type ComponentProps, type ReactNode } from 'react';
import { createElement, memo, Suspense, useState } from 'react';

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

// Exact motionEaseInOut alias remains pending; keep the current transition contract.
const themeStyles = createStaticStyles(({ css, cssVar }) => ({
  action: css`
    transition: opacity ${cssVar.motionDurationMid} ${cssVar.motionEaseInOut};
  `,
}));

const styles = {
  action: cn('opacity-0 transition-opacity [&_button]:text-muted-foreground', themeStyles.action),
  actionVisible: 'opacity-100',
  heading: 'min-h-9 cursor-pointer',
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

    return (
      <div
        className="flex flex-col gap-3"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        {...rest}
      >
        <div className="flex items-center justify-between">
          <div
            aria-expanded={onCollapsedChange ? !collapsed : undefined}
            role={onCollapsedChange ? 'button' : undefined}
            tabIndex={onCollapsedChange ? 0 : undefined}
            className={cn(
              cn(onCollapsedChange && styles.heading),
              'flex items-center flex-1 gap-1.5 justify-start overflow-hidden',
            )}
            onClick={onCollapsedChange ? () => onCollapsedChange(!collapsed) : undefined}
          >
            {icon && createElement(icon, { className: 'text-foreground-description', size: 16 })}
            <div className={cn('truncate', homeType.sectionLabel)}>{title}</div>
            {count !== undefined && <CountBadge count={count} />}
            {onCollapsedChange &&
              createElement(collapsed ? ChevronRightIcon : ChevronDownIcon, {
                className: 'text-foreground-quaternary',
                size: 14,
              })}
          </div>
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
