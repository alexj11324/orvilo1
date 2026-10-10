'use client';
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

const styles = {
  paneHeader:
    'sticky top-0 z-2 flex items-center gap-1 border-b border-divider bg-background py-2 ps-4 pe-2',
};

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
        <span className="text-sm leading-5.5 font-medium">
          {identifier ?? t('taskList.details.open')}
        </span>
        <div className="flex flex-row items-center justify-end gap-1 flex-1">
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
            <div aria-busy="true" className="flex flex-col gap-2 p-2" role="status">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton className="h-8 w-full" key={index} />
              ))}
            </div>
          }
        >
          <LazyIssueContent taskId={identifier} />
        </Suspense>
      ) : (
        <div className="flex flex-col items-center py-12 px-4">
          <span className="text-muted-foreground text-xs leading-5">
            {t('taskList.details.selectIssue')}
          </span>
        </div>
      )}
    </>
  );
});

IssueDetailPane.displayName = 'IssueDetailPane';

export default IssueDetailPane;
