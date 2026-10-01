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

    background: ${cssVar.colorBgContainer};
  `,
}));

interface MyWorkIssuePaneProps {
  /** Task identifier — `IssueContent` keys its detail fetch on it. */
  identifier: string;
  onClose: () => void;
  /** Navigate to the full task page. */
  onOpen: () => void;
}

/**
 * Selected-issue detail pane for My issues — a small peek header (identifier
 * + open-full-page + close) over the shared `IssueContent`, mounted directly
 * in the pane's scroll owner (its own contract).
 */
const MyWorkIssuePane = memo<MyWorkIssuePaneProps>(({ identifier, onClose, onOpen }) => {
  const { t } = useTranslation('common');

  return (
    <>
      <div className={styles.paneHeader}>
        <span className="text-sm font-medium">{identifier}</span>
        <div className="flex flex-row" style={{ justifyContent: 'flex-end', gap: 4, flex: 1 }}>
          <Button
            aria-label={t('myWork.openFullPage')}
            size="icon"
            title={t('myWork.openFullPage')}
            variant="ghost"
            onClick={onOpen}
          >
            {createElement(ArrowUpRightIcon, { className: 'size-4 shrink-0' })}
          </Button>
          <Button
            aria-label={t('myWork.closeDetails')}
            size="icon"
            title={t('myWork.closeDetails')}
            variant="ghost"
            onClick={onClose}
          >
            {createElement(XIcon, { className: 'size-4 shrink-0' })}
          </Button>
        </div>
      </div>
      <Suspense
        fallback={
          <div aria-busy className="flex flex-col gap-2 p-3" role="status">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="h-10 w-full" key={index} />
            ))}
          </div>
        }
      >
        <LazyIssueContent taskId={identifier} />
      </Suspense>
    </>
  );
});

MyWorkIssuePane.displayName = 'MyWorkIssuePane';

export default MyWorkIssuePane;
