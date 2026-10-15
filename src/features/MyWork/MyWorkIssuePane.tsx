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
      {/* The header is the cluster's size container: the copy icons in
        `TaskDetailHeaderActions` fold into the ⋯ overflow when this bar is
        narrow. */}
      <div className="sticky z-2 inset-bs-0 flex items-center gap-1 py-2 ps-4 pe-2 border-be border-solid border-divider bg-card [container-type:inline-size]">
        <span className="text-sm font-medium">{identifier}</span>
        <div className="flex flex-row items-center justify-end gap-1 flex-1">
          <Suspense fallback={null}>
            <LazyIssuePeekActions taskId={identifier} onDeleted={onClose} />
          </Suspense>
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
