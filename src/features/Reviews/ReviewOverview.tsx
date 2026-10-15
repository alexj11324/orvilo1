import { Markdown } from '@lobehub/ui';
import { clsx, cn } from 'cn';
// GitHub check status is separate from Orvilo task and issue workflow status.
/* eslint-disable @typescript-eslint/no-restricted-imports */
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  FileTextIcon,
  GitPullRequestArrowIcon,
  GitPullRequestClosedIcon,
  GitPullRequestIcon,
  XCircleIcon,
} from 'lucide-react';
/* eslint-enable @typescript-eslint/no-restricted-imports */
import { createElement, memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';

import { checkSummaryVisual } from './ReviewChecksPanel';
import { reviewBranchState } from './reviewsSurface';
import type { PullRequestDetail, ReviewFile } from './types';

const styles = {
  author: 'mt-2 min-w-0 text-muted-foreground',
  authorName: 'flex-none whitespace-nowrap',
  body: 'min-w-0 pb-12',
  branch: 'min-w-0 flex-1 truncate font-mono text-xs leading-5',
  description: 'mx-auto mt-8 w-full max-w-240',
  fileButton:
    'flex w-full cursor-pointer items-center justify-start gap-1.5 border-0 bg-transparent p-1 text-start font-normal text-muted-foreground hover:bg-accent',
  fileName: 'flex-1 truncate font-mono text-sm leading-5.5',
  layout:
    'mx-auto grid w-full max-w-375 grid-cols-[minmax(0,1fr)_minmax(200px,24%)] gap-8 px-8 py-6 [@media(width<=768px)]:grid-cols-[minmax(0,1fr)] [@media(width<=768px)]:gap-6 [@media(width<=768px)]:px-4',
  rail: 'flex min-w-0 flex-col gap-6',
  railLabel: 'text-xs leading-5 text-muted-foreground',
  railValue: 'mt-2 text-sm leading-5.5',
  sectionLabel: 'mb-2 text-xs leading-5 text-muted-foreground',
  title: 'm-0 text-2xl font-semibold leading-8 [overflow-wrap:anywhere]',
} as const;

const stateVisual = (pullRequest: PullRequestDetail) => {
  if (pullRequest.state === 'MERGED')
    return {
      icon: GitPullRequestArrowIcon,
      color: 'var(--primary-text)',
      key: 'reviews.state.merged',
    };
  if (pullRequest.state === 'CLOSED')
    return {
      icon: GitPullRequestClosedIcon,
      color: 'var(--destructive-text)',
      key: 'reviews.state.closed',
    };
  if (pullRequest.isDraft)
    return {
      icon: GitPullRequestIcon,
      color: 'var(--muted-foreground)',
      key: 'reviews.state.draft',
    };
  return { icon: GitPullRequestIcon, color: 'var(--success-text)', key: 'reviews.state.open' };
};

/** Description and real GitHub metadata for the Review Overview tab. */
const ReviewOverview = memo<{
  children?: ReactNode;
  files: ReviewFile[];
  hasMoreFiles: boolean;
  onFileSelect: (filename: string) => void;
  onViewMoreFiles: () => void;
  pullRequest: PullRequestDetail;
}>(({ children, files, hasMoreFiles, onFileSelect, onViewMoreFiles, pullRequest }) => {
  const { t } = useTranslation('common');
  const state = stateVisual(pullRequest);
  const checks = checkSummaryVisual(pullRequest.checks.summary.state);
  const branchState = reviewBranchState(pullRequest.mergeStateStatus);
  const branchLabel =
    branchState === 'no-conflicts'
      ? t('reviews.branchNoConflicts', { branch: pullRequest.baseRef ?? '' })
      : branchState === 'behind'
        ? t('reviews.branchBehind', { branch: pullRequest.baseRef ?? '' })
        : `${pullRequest.headRef ?? ''} → ${pullRequest.baseRef ?? ''}`;

  return (
    <div className={styles.layout}>
      <div className={styles.body}>
        <h1 className={styles.title}>{pullRequest.title}</h1>
        <div className={clsx('flex flex-row items-center gap-2', styles.author)}>
          <Avatar
            avatar={pullRequest.authorAvatar ?? undefined}
            name={pullRequest.author ?? '?'}
            size={20}
          />
          <div className={cn('text-xs', styles.authorName)}>{pullRequest.author}</div>
          <div className="text-xs text-muted-foreground">·</div>
          <span className={styles.branch} title={branchLabel}>
            {pullRequest.baseRef} ← {pullRequest.headRef}
          </span>
        </div>
        <section className={styles.description}>
          <div className={styles.sectionLabel}>{t('reviews.description')}</div>
          {pullRequest.body ? (
            <Markdown fontSize={14} lineHeight={22 / 14} variant={'chat'}>
              {pullRequest.body}
            </Markdown>
          ) : null}
        </section>
        {children}
      </div>
      <aside className={styles.rail}>
        <section>
          <div className={styles.railLabel}>{t('reviews.status')}</div>
          <div className={clsx('flex flex-row items-center gap-2', styles.railValue)}>
            <span className="anticon" role="img">
              <state.icon
                color={state.color}
                fill={'transparent'}
                height={16}
                size={16}
                width={16}
              />
            </span>
            <div className="text-sm leading-5.5">{t(state.key as never)}</div>
          </div>
        </section>
        <section>
          <div className={styles.railLabel}>{t('reviews.checks')}</div>
          <div className={clsx('flex flex-row items-center gap-2', styles.railValue)}>
            <span className="anticon" role="img">
              {createElement(
                pullRequest.checks.summary.state === 'passed'
                  ? CheckCircle2Icon
                  : pullRequest.checks.summary.state === 'failing'
                    ? XCircleIcon
                    : CircleDashedIcon,
                { size: 16, width: 16, height: 16, color: checks.color, fill: 'transparent' },
              )}
            </span>
            <div className="text-sm leading-5.5">
              {t(checks.labelKey as never, { count: pullRequest.checks.summary.failing })}
            </div>
          </div>
        </section>
        <section>
          <div className={styles.railLabel}>{t('reviews.branch')}</div>
          <div className={cn('text-sm leading-5.5', styles.railValue)}>{branchLabel}</div>
        </section>
        <section>
          <div className={styles.railLabel}>
            {t('reviews.filesChangedTitle', { count: pullRequest.changedFiles })}
          </div>
          <div className="flex flex-col gap-0.5 [margin-block-start:calc(var(--spacing)*2)]">
            {files.map((file) => (
              <Button
                className={styles.fileButton}
                key={file.filename}
                size="compact"
                title={file.filename}
                type={'button'}
                variant="ghost"
                onClick={() => onFileSelect(file.filename)}
              >
                <span className="anticon" role="img">
                  <FileTextIcon
                    className="size-4"
                    fill={'transparent'}
                    height={16}
                    size={16}
                    width={16}
                  />
                </span>
                <span className={styles.fileName}>{file.filename}</span>
                <span className="text-xs leading-5 tabular-nums">
                  +{file.additions} −{file.deletions}
                </span>
              </Button>
            ))}
            {hasMoreFiles ? (
              <Button
                className={styles.fileButton}
                size="compact"
                type={'button'}
                variant="ghost"
                onClick={onViewMoreFiles}
              >
                {t('reviews.moreFilesInDiff')}
              </Button>
            ) : null}
          </div>
        </section>
      </aside>
    </div>
  );
});

ReviewOverview.displayName = 'ReviewOverview';

export default ReviewOverview;
