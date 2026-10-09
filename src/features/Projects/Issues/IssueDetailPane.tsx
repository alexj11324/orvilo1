'use client';
import { createStaticStyles, cssVar } from 'antd-style';
import { ArrowUpRightIcon, XIcon } from 'lucide-react';
import { createElement, lazy, memo, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const LazyIssueContent = lazy(() =>
  import('@/features/AgentTasks').then((module) => ({ default: module.IssueContent })),
);

const LazyIssuePeekActions = lazy(() =>
  import('@/features/AgentTasks').then((module) => ({ default: module.IssuePeekActions })),
);

const styles = createStaticStyles(({ css }) => ({
  /**
   * Sticky inside the pane's own scroll host — the header stays put while
   * `IssueContent` scrolls beneath it, matching Linear's peek chrome.
   */
  paneHeader: css`
    position: sticky;
    z-index: 2;
    inset-block-start: 0;

    display: flex;
    gap: 4px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 16px 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgLayout};
  `,
}));

interface IssueDetailPaneProps {
  /**
   * Task identifier — `IssueContent` keys its detail fetch on it. `null`
   * renders the "select an issue" prompt: the pane stays visible while peek
   * is armed so the surface reads like the reference's empty detail rail.
   */
  identifier: string | null;
  onClose: () => void;
  /** Navigate to the full task page. */
  onOpen: () => void;
}

/**
 * Selected-issue detail pane for the project issues list — a small peek
 * header (identifier + open-full-page + close) over the shared
 * `IssueContent`, mounted directly in the pane's scroll owner (its own
 * contract). Same shape as the My issues peek; the project surface reuses the
 * shared issue body rather than growing a second detail implementation.
 */
const IssueDetailPane = memo<IssueDetailPaneProps>(({ identifier, onClose, onOpen }) => {
  const { t } = useTranslation('chat');

  return (
    <>
      <div className={styles.paneHeader}>
        <span className="text-sm" style={{ fontSize: 13, fontWeight: 500 }}>
          {identifier ?? t('taskList.details.open')}
        </span>
        <div
          className="flex flex-row"
          style={{ alignItems: 'center', justifyContent: 'flex-end', gap: 4, flex: 1 }}
        >
          {identifier && (
            <Suspense fallback={null}>
              <LazyIssuePeekActions taskId={identifier} onDeleted={onClose} />
            </Suspense>
          )}
          {identifier && (
            <Button
              aria-label={t('taskList.detail.openFullPage')}
              size="icon-sm"
              title={t('taskList.detail.openFullPage')}
              variant="ghost"
              onClick={onOpen}
            >
              {createElement(ArrowUpRightIcon, { 'size': 16, 'aria-hidden': true })}
            </Button>
          )}
          <Button
            aria-label={t('taskList.detail.close')}
            size="icon-sm"
            title={t('taskList.detail.close')}
            variant="ghost"
            onClick={onClose}
          >
            {createElement(XIcon, { 'size': 16, 'aria-hidden': true })}
          </Button>
        </div>
      </div>
      {identifier ? (
        <Suspense
          fallback={
            <div
              aria-busy="true"
              className="flex flex-col gap-2"
              role="status"
              style={{ padding: 8 }}
            >
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton className="h-8 w-full" key={index} />
              ))}
            </div>
          }
        >
          <LazyIssueContent taskId={identifier} />
        </Suspense>
      ) : (
        <div
          className="flex flex-col"
          style={{ alignItems: 'center', paddingBlock: 48, paddingInline: 16 }}
        >
          <span className="text-sm text-muted-foreground" style={{ fontSize: 12 }}>
            {t('taskList.details.selectIssue')}
          </span>
        </div>
      )}
    </>
  );
});

IssueDetailPane.displayName = 'IssueDetailPane';

export default IssueDetailPane;
