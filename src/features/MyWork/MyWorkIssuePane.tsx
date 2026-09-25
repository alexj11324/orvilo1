'use client';

import { Flexbox } from '@lobehub/ui';
import { ActionIcon, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ArrowUpRightIcon, XIcon } from 'lucide-react';
import { lazy, memo, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import SkeletonList from '@/features/NavPanel/components/SkeletonList';

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

    background: ${cssVar.colorBgLayout};
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
        <Text fontSize={13} weight={500}>
          {identifier}
        </Text>
        <Flexbox horizontal flex={1} gap={4} justify="flex-end">
          <ActionIcon
            icon={ArrowUpRightIcon}
            size={'small'}
            title={t('myWork.openFullPage')}
            onClick={onOpen}
          />
          <ActionIcon
            icon={XIcon}
            size={'small'}
            title={t('myWork.closeDetails')}
            onClick={onClose}
          />
        </Flexbox>
      </div>
      <Suspense fallback={<SkeletonList padding={8} rows={4} />}>
        <LazyIssueContent taskId={identifier} />
      </Suspense>
    </>
  );
});

MyWorkIssuePane.displayName = 'MyWorkIssuePane';

export default MyWorkIssuePane;
