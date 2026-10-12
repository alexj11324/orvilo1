'use client';

import { clsx, cn } from 'cn';
import type { ReactNode } from 'react';
import { memo } from 'react';

import mediaStyles from './EvidenceComparisonCard.module.css';

/** The `metadata.comparison` an evidence artifact may carry (authored at ingest). */
export interface EvidenceComparisonMeta {
  id: string;
  /** Optional authored caption shown in the tinted band. */
  label?: string;
  /**
   * How the pair is arranged. Side by side reads best for tall, narrow captures
   * (a sidebar, a form); stacking is the only way a wide, short strip (a toolbar,
   * a one-line footer) stays legible, since two of them side by side halve an
   * already-thin band. Authors pick per pair; defaults to side by side.
   */
  layout: 'horizontal' | 'vertical';
  role: 'after' | 'before';
}

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** A bare filename is not a caption — only descriptive prose reads on the band. */
export const isFilenameLike = (value?: string | null) =>
  !value ||
  /^[\w.-]+\.(?:gif|html?|jpe?g|json|log|markdown|md|mp4|png|txt|webm|webp)$/i.test(value);

/** Keep authored context, but suppress generated filenames and duplicated labels. */
export const meaningfulEvidenceCaption = (
  description?: string | null,
  label?: string | null,
): string | null =>
  description && description !== label && !isFilenameLike(description) ? description : null;

/** Parse an evidence row's `metadata.comparison`, or null when it carries none. */
export const readEvidenceComparison = (metadata: unknown): EvidenceComparisonMeta | null => {
  const record = toRecord(metadata);
  const comparison = toRecord(record?.comparison);
  if (!comparison) return null;

  const role = comparison.role;
  if (typeof comparison.id !== 'string' || (role !== 'before' && role !== 'after')) return null;

  return {
    id: comparison.id,
    label: typeof comparison.label === 'string' ? comparison.label : undefined,
    layout: comparison.layout === 'vertical' ? 'vertical' : 'horizontal',
    role,
  };
};

const styles = {
  card: 'grid w-full grid-cols-2 gap-px overflow-hidden rounded-(--radius-card) border border-divider bg-divider [@media(width<=640px)]:grid-cols-1',
  cardVertical: 'grid-cols-1',
  side: 'flex min-w-0 flex-col bg-card',
  label: 'flex items-baseline gap-2 px-4 py-2 text-xs leading-5',
  labelBefore: 'border-be border-destructive-border bg-destructive-wash text-destructive-text',
  labelAfter: 'border-be border-success-border bg-success-wash text-success-text',
  caption: 'min-w-0 opacity-85',
  content: mediaStyles.content,
} as const;

export interface EvidenceComparisonSide {
  /** Caption in the tinted band — the comparison label, or the evidence description. */
  caption?: string;
  content: ReactNode;
}

interface EvidenceComparisonCardProps {
  after: EvidenceComparisonSide;
  before: EvidenceComparisonSide;
  layout?: 'horizontal' | 'vertical';
}

/**
 * The fused before/after card shared by the verify report and the acceptance
 * union — one implementation so the two surfaces can't drift apart.
 */
export const EvidenceComparisonCard = memo<EvidenceComparisonCardProps>(
  ({ after, before, layout = 'horizontal' }) => {
    return (
      <div className={cn(styles.card, layout === 'vertical' && styles.cardVertical)}>
        {(
          [
            ['before', before],
            ['after', after],
          ] as const
        ).map(([role, side]) => (
          <div className={styles.side} key={role}>
            {side.caption && (
              <div
                className={clsx(
                  styles.label,
                  role === 'before' ? styles.labelBefore : styles.labelAfter,
                )}
              >
                <span className={styles.caption}>{side.caption}</span>
              </div>
            )}
            <div className={styles.content}>{side.content}</div>
          </div>
        ))}
      </div>
    );
  },
);

EvidenceComparisonCard.displayName = 'EvidenceComparisonCard';
