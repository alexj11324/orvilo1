'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import type { HTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';

const styles = createStaticStyles(({ css }) => ({
  list: css`
    overflow: hidden;
    width: 100%;
    padding: 0;
  `,
  row: css`
    padding-block: 10px;
    padding-inline: 12px;

    & + & {
      border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  rowClickable: css`
    cursor: pointer;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  seq: css`
    flex: none;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

interface CriterionRequiredChipProps {
  /** When set, the chip becomes the required/optional toggle. */
  onToggle?: () => void;
  required: boolean;
}

/** The shared required ("必选") / optional chip: blue when the criterion blocks acceptance. */
export const CriterionRequiredChip = ({ onToggle, required }: CriterionRequiredChipProps) => {
  const { t } = useTranslation('verify');

  return (
    <Badge
      size="sm"
      style={onToggle ? { cursor: 'pointer' } : undefined}
      variant={required ? 'info' : 'secondary'}
      onClick={
        onToggle
          ? (event) => {
              event.stopPropagation();
              onToggle();
            }
          : undefined
      }
    >
      {t(required ? 'criterion.required' : 'criterion.optional')}
    </Badge>
  );
};

/**
 * Keyboard activation for the row. A nested action control's Enter/Space
 * bubbles up here; acting on it would open the row on top of (or instead of)
 * the control's own click, so only events originating from the row itself
 * activate it.
 */
export const rowKeyDownHandler =
  (onOpen: () => void) => (event: { currentTarget: unknown; key: string; target: unknown }) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') onOpen();
  };

export interface CriterionRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** e2e / automation anchors, forwarded onto the row element. */
  [dataAttribute: `data-${string}`]: string | undefined;
  /** Trailing controls (edit / delete). Handlers must stopPropagation themselves. */
  actions?: ReactNode;
  /** Chips rendered between the title and the actions (required chip, verifier tag …). */
  children?: ReactNode;
  /** Leading status icon; omit for plain draft rows. */
  icon?: ReactNode;
  onOpen?: () => void;
  /** 1-based position, rendered as the C{seq} anchor. */
  seq?: number | string;
  title: string;
}

/**
 * One acceptance-criterion row — the single list grammar (icon + C{seq} + title
 * + chips + actions) shared by goal creation, task verify config, and the
 * acceptance check lists.
 */
export const CriterionRow = ({
  actions,
  children,
  className,
  icon,
  onOpen,
  seq,
  title,
  ...rest
}: CriterionRowProps) => (
  <div
    className={`flex items-center gap-2.5 ${cx(styles.row, onOpen && styles.rowClickable, className)}`}
    role={onOpen ? 'button' : undefined}
    tabIndex={onOpen ? 0 : undefined}
    onClick={onOpen}
    onKeyDown={onOpen && rowKeyDownHandler(onOpen)}
    {...rest}
  >
    {icon}
    {seq !== undefined && <span className={styles.seq}>C{seq}</span>}
    <div className="truncate min-w-0" style={{ flex: 1, minWidth: 0 }}>
      {title}
    </div>
    {children}
    {actions}
  </div>
);

interface CriterionListProps {
  children: ReactNode;
  className?: string;
}

/** Outlined container that gives `CriterionRow` children their between-row borders. */
export const CriterionList = ({ children, className }: CriterionListProps) => (
  <div className={`flex flex-col rounded-md border border-border ${cx(styles.list, className)}`}>
    {children}
  </div>
);
