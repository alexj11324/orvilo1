'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { memo } from 'react';

import { resolveLabelColor } from './labelColor';

const styles = createStaticStyles(({ css }) => ({
  chip: css`
    display: inline-flex;
    flex: none;
    gap: 4px;
    align-items: center;

    max-width: 160px;
    padding-block: 1px;
    padding-inline: 6px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 4px;

    font-size: 11px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;
  `,
  dot: css`
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
  `,
  name: css`
    overflow: hidden;
    text-overflow: ellipsis;
  `,
}));

export interface LabelChipProps {
  className?: string;
  /**
   * Explicit CSS colour for the dot. When absent the dot is derived
   * deterministically from `name` (see `labelColor.ts`) — the project's
   * `project_labels` schema carries no colour column.
   */
  color?: null | string;
  name: string;
}

/**
 * Linear's label chip: a small bordered pill holding a coloured dot and the
 * label name. Presentational only — data binding lives in `LabelChips` /
 * `ProjectLabelChips`, so the same chip can render issue labels once a
 * task-label model exists.
 */
const LabelChip = memo<LabelChipProps>(({ className, color, name }) => (
  <span className={className ? `${styles.chip} ${className}` : styles.chip} title={name}>
    <span
      aria-hidden
      className={styles.dot}
      style={{ background: resolveLabelColor(name, color) }}
    />
    <span className={styles.name}>{name}</span>
  </span>
));

LabelChip.displayName = 'LabelChip';

export default LabelChip;
