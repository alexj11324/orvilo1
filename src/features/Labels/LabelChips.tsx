'use client';

import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import IssueRowChip from '@/components/IssueRowChip';

import LabelChip from './LabelChip';
import { type LabelLike, partitionLabelChips } from './labelColor';

const styles = createStaticStyles(({ css }) => ({
  group: css`
    display: inline-flex;
    flex: none;
    gap: 3px;
    align-items: center;

    min-width: 0;
  `,
}));

export interface LabelChipsProps {
  className?: string;
  labels: readonly LabelLike[];
  /**
   * Individual chips shown before the `+N` collapse. Defaults to 2, matching
   * the row budget.
   */
  max?: number;
}

/**
 * A row of Linear-style label chips with `+N` overflow. Pure render — the
 * caller decides where labels come from (project detail cache today, a
 * task-label payload once one exists).
 */
const LabelChips = memo<LabelChipsProps>(({ className, labels, max = 2 }) => {
  const { t } = useTranslation('common');
  if (!labels.length) return null;
  const { overflow, visible } = partitionLabelChips(labels, max);
  const overflowNames = overflow.map((label) => label.name).join(', ');
  return (
    <span
      aria-label={t('labels')}
      className={className ? `${styles.group} ${className}` : styles.group}
      role="group"
    >
      {visible.map((label, index) => (
        <LabelChip
          color={label.color}
          key={label.id ?? `${label.name}-${index}`}
          name={label.name}
        />
      ))}
      {overflow.length > 0 && (
        <IssueRowChip
          aria-label={t('labels.overflow', { count: overflow.length })}
          title={overflowNames}
        >
          +{overflow.length}
        </IssueRowChip>
      )}
    </span>
  );
});

LabelChips.displayName = 'LabelChips';

export default LabelChips;
