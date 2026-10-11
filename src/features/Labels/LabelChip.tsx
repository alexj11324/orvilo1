'use client';

import { memo } from 'react';

import IssueRowChip from '@/components/IssueRowChip';

import { resolveLabelColor } from './labelColor';

const styles = {
  dot: 'size-2 rounded-full',
};

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
 * Linear's label chip: the shared issue-row pill holding a coloured dot and
 * the label name. Presentational only — data binding lives in `LabelChips` /
 * `ProjectLabelChips`, so the same chip can render issue labels once a
 * task-label model exists.
 */
const LabelChip = memo<LabelChipProps>(({ className, color, name }) => (
  <IssueRowChip
    className={className}
    title={name}
    icon={
      <span
        aria-hidden
        className={styles.dot}
        style={{ background: resolveLabelColor(name, color) }}
      />
    }
  >
    {name}
  </IssueRowChip>
));

LabelChip.displayName = 'LabelChip';

export default LabelChip;
