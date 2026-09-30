import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { ChevronDownIcon, ChevronRightIcon, type LucideIcon } from 'lucide-react';
import { type ComponentProps, type ReactNode } from 'react';
import { createElement, memo, Suspense, useState } from 'react';

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

const styles = createStaticStyles(({ css, cssVar }) => ({
  action: css`
    opacity: 0;
    transition: opacity ${cssVar.motionDurationMid} ${cssVar.motionEaseInOut};

    button {
      color: ${cssVar.colorTextSecondary};
    }
  `,
  actionVisible: css`
    opacity: 1;
  `,
  // The whole heading is the hit target, not just the chevron — a 14px glyph is
  // a poor thing to ask someone to aim at, and the label is already there.
  heading: css`
    cursor: pointer;
  `,
}));

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
            style={{ overflow: 'hidden' }}
            tabIndex={onCollapsedChange ? 0 : undefined}
            className={cx(
              cx(onCollapsedChange && styles.heading),
              'flex items-center flex-1 gap-1.5 justify-start',
            )}
            onClick={onCollapsedChange ? () => onCollapsedChange(!collapsed) : undefined}
          >
            {icon && createElement(icon, { color: cssVar.colorTextDescription, size: 16 })}
            <div className={cn('truncate', homeType.sectionLabel)}>{title}</div>
            {count !== undefined && <CountBadge count={count} />}
            {onCollapsedChange &&
              createElement(collapsed ? ChevronRightIcon : ChevronDownIcon, {
                color: cssVar.colorTextQuaternary,
                size: 14,
              })}
          </div>
          <div
            className={cx(
              cx(styles.action, (isHovered || actionAlwaysVisible) && styles.actionVisible),
              'flex items-center flex-none gap-0.5 justify-end',
            )}
          >
            {action}
          </div>
        </div>
        {!collapsed && <Suspense fallback={'loading'}>{children}</Suspense>}
      </div>
    );
  },
);

export default GroupBlock;
