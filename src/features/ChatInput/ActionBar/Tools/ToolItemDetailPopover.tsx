import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { memo, type ReactNode } from 'react';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    width: 320px;
    padding: 12px;
  `,
  description: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 6;

    font-size: 12px;
    line-height: 1.5;
    color: ${cssVar.colorTextSecondary};
  `,
  identifier: css`
    overflow: hidden;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  title: css`
    font-size: 14px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
}));

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
      <div className={cx('flex flex-col gap-2.5', styles.container)}>
        <div className="flex flex-row items-center gap-2.5">
          {icon}
          <div className="flex flex-col flex-1 gap-0.5" style={{ minWidth: 0 }}>
            <div className="flex flex-row items-center gap-1.5">
              <div className={cn('truncate', styles.title)}>{title}</div>
              {sourceLabel && (
                <Badge size="sm" style={{ flexShrink: 0 }} variant="secondary">
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
