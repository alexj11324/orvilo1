import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';

import CountBadge from '../CountBadge';
import { homeType } from '../homeType';

const styles = createStaticStyles(({ css, cssVar }) => ({
  // Frosted, not opaque: the agent standing behind the first card reads through
  // the pane as a soft silhouette instead of being clipped away.
  card: css`
    padding-block: 14px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: color-mix(in srgb, ${cssVar.colorBgContainer} 72%, transparent);
    backdrop-filter: saturate(150%) blur(12px);
  `,
  // The whole heading is the hit target, not just the chevron — a 14px glyph is
  // a poor thing to ask someone to aim at, and the label is already there.
  heading: css`
    cursor: pointer;

    min-width: 0;
    padding: 0;
    border: 0;

    text-align: start;

    background: none;

    &:hover .home-rail-card-chevron {
      color: ${cssVar.colorTextSecondary};
    }
  `,
}));

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
      <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
        <Text ellipsis className={homeType.sectionLabel}>
          {title}
        </Text>
        {count !== undefined && <CountBadge count={count} />}
        {onCollapsedChange &&
          createElement(collapsed ? ChevronRightIcon : ChevronDownIcon, {
            className: 'home-rail-card-chevron',
            color: cssVar.colorTextQuaternary,
            size: 14,
          })}
      </div>
    );

    return (
      <div className={cx(styles.card, 'flex flex-col gap-3')} data-testid={'home-rail-card'}>
        {title && (
          <div className="flex items-center gap-2 justify-between">
            {onCollapsedChange ? (
              <button
                aria-expanded={!collapsed}
                className={styles.heading}
                data-testid={'home-rail-card-toggle'}
                type={'button'}
                onClick={() => onCollapsedChange(!collapsed)}
              >
                {heading}
              </button>
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
