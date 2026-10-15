'use client';

import { ChevronRightIcon, FoldVerticalIcon, UnfoldVerticalIcon } from 'lucide-react';
import { type KeyboardEvent, memo, type MouseEvent, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';

const styles = {
  header:
    'cursor-pointer select-none sticky z-1 inset-bs-0 flex flex-none gap-1.5 items-center h-8 px-2.5 text-xs leading-5 text-muted-foreground bg-card wash-fill-quaternary transition-colors duration-(--orvilo-motion-fast) [&:not(:first-child)]:border-bs [&:not(:first-child)]:border-divider hover:wash-muted focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2',
  chevron:
    'flex-none text-foreground-tertiary transition-transform duration-(--orvilo-motion-fast) data-[expanded=true]:rotate-90',
  meta: 'overflow-hidden inline-flex flex-[1_1_auto] gap-1.5 items-center min-w-0',
  name: 'overflow-hidden flex-[0_1_auto] min-w-0 font-semibold text-sm leading-5.5 text-foreground text-ellipsis whitespace-nowrap',
  fileCount: 'shrink-0 tabular-nums text-foreground-tertiary text-xs leading-5',
  stats: 'inline-flex shrink-0 gap-1.5 items-center font-mono text-xs leading-5 tabular-nums',
  additions: 'text-success-text',
  deletions: 'text-destructive-text',
  branch:
    'overflow-hidden flex-[0_1_auto] min-w-0 font-mono text-xs leading-5 text-foreground-tertiary text-ellipsis whitespace-nowrap',
  foldButton:
    'ms-auto opacity-0 transition-opacity duration-(--orvilo-motion-fast) [[data-review-group-header]:hover_&]:opacity-100 [[data-review-group-header]:focus-within_&]:opacity-100',
};

export interface GroupHeaderProps {
  branch?: string;
  collapsed: boolean;
  /** True iff every file diff in the group is currently expanded — drives
   * the fold-button's icon + label. */
  diffsAllExpanded: boolean;
  /** Suppress the fold-all-diffs button (collapsed groups, empty groups). */
  hideFoldButton?: boolean;
  name: string;
  onToggleCollapsed: () => void;
  onToggleDiffs: () => void;
  patchCount: number;
  totalAdditions: number;
  totalDeletions: number;
}

const GroupHeader = memo<GroupHeaderProps>(
  ({
    branch,
    collapsed,
    diffsAllExpanded,
    hideFoldButton,
    name,
    onToggleCollapsed,
    onToggleDiffs,
    patchCount,
    totalAdditions,
    totalDeletions,
  }) => {
    const { t } = useTranslation('chat');
    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleCollapsed();
        }
      },
      [onToggleCollapsed],
    );
    const handleFoldClick = useCallback(
      (e: MouseEvent) => {
        e.stopPropagation();
        onToggleDiffs();
      },
      [onToggleDiffs],
    );
    const foldLabel = diffsAllExpanded
      ? t('workingPanel.review.group.collapseDiffs')
      : t('workingPanel.review.group.expandDiffs');
    return (
      <div
        aria-expanded={!collapsed}
        className={styles.header}
        data-review-group-header={''}
        role={'button'}
        tabIndex={0}
        onClick={onToggleCollapsed}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.meta}>
          <ChevronRightIcon
            className={styles.chevron}
            data-expanded={collapsed ? 'false' : 'true'}
            size={14}
          />
          <span className={styles.name}>{name}</span>
          <span className={styles.fileCount}>
            {t('workingPanel.review.group.fileCount', { count: patchCount })}
          </span>
          {(totalAdditions > 0 || totalDeletions > 0) && (
            <span className={styles.stats}>
              {totalAdditions > 0 && <span className={styles.additions}>+{totalAdditions}</span>}
              {totalDeletions > 0 && <span className={styles.deletions}>-{totalDeletions}</span>}
            </span>
          )}
          {branch && (
            <span className={styles.branch} title={branch}>
              {branch}
            </span>
          )}
        </div>
        {!hideFoldButton && (
          <ActionIcon
            aria-label={foldLabel}
            aria-pressed={diffsAllExpanded}
            className={styles.foldButton}
            icon={diffsAllExpanded ? FoldVerticalIcon : UnfoldVerticalIcon}
            size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
            title={foldLabel}
            onClick={handleFoldClick}
          />
        )}
      </div>
    );
  },
);

GroupHeader.displayName = 'AgentWorkingSidebarReviewGroupHeader';

export default GroupHeader;
