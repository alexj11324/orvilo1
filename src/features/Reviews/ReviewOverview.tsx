import { Flexbox, Icon, Markdown } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
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
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';

import { checkSummaryVisual } from './ReviewChecksPanel';
import { reviewBranchState } from './reviewsSurface';
import type { PullRequestDetail, ReviewFile } from './types';

const styles = createStaticStyles(({ css }) => ({
  author: css`
    min-width: 0;
    margin-block-start: 8px;
    color: ${cssVar.colorTextSecondary};
  `,
  authorName: css`
    flex: none;
    white-space: nowrap;
  `,
  body: css`
    min-width: 0;
    padding-block-end: 48px;
  `,
  branch: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  description: css`
    margin-block-start: 32px;
  `,
  fileButton: css`
    cursor: pointer;

    display: flex;
    gap: 6px;
    align-items: center;

    width: 100%;
    min-height: 28px;
    padding: 4px;
    border: 0;
    border-radius: ${cssVar.borderRadiusXS};

    color: ${cssVar.colorTextSecondary};
    text-align: start;

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
    }
  `,
  fileName: css`
    overflow: hidden;
    flex: 1;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  layout: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(200px, 24%);
    gap: 32px;

    width: 100%;
    max-width: 1500px;
    margin-inline: auto;
    padding-block: 24px;
    padding-inline: 32px;

    @media (width <= 768px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 24px;
      padding-inline: 16px;
    }
  `,
  rail: css`
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-width: 0;
  `,
  railLabel: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  railValue: css`
    margin-block-start: 8px;
    font-size: 13px;
  `,
  sectionLabel: css`
    margin-block-end: 8px;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  title: css`
    margin: 0;

    font-size: 24px;
    font-weight: 600;
    line-height: 1.28;
    letter-spacing: -0.02em;
    overflow-wrap: anywhere;
  `,
}));

const stateVisual = (pullRequest: PullRequestDetail) => {
  if (pullRequest.state === 'MERGED')
    return {
      icon: GitPullRequestArrowIcon,
      color: cssVar.colorPrimary,
      key: 'reviews.state.merged',
    };
  if (pullRequest.state === 'CLOSED')
    return {
      icon: GitPullRequestClosedIcon,
      color: cssVar.colorError,
      key: 'reviews.state.closed',
    };
  if (pullRequest.isDraft)
    return {
      icon: GitPullRequestIcon,
      color: cssVar.colorTextSecondary,
      key: 'reviews.state.draft',
    };
  return { icon: GitPullRequestIcon, color: cssVar.colorSuccess, key: 'reviews.state.open' };
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
        <Flexbox horizontal align={'center'} className={styles.author} gap={8}>
          <Avatar
            avatar={pullRequest.authorAvatar ?? undefined}
            name={pullRequest.author ?? '?'}
            size={20}
          />
          <Text className={styles.authorName} fontSize={12}>
            {pullRequest.author}
          </Text>
          <Text fontSize={12} type={'secondary'}>
            ·
          </Text>
          <span className={styles.branch} title={branchLabel}>
            {pullRequest.baseRef} ← {pullRequest.headRef}
          </span>
        </Flexbox>
        <section className={styles.description}>
          <div className={styles.sectionLabel}>{t('reviews.description')}</div>
          {pullRequest.body ? (
            <Markdown fontSize={14} variant={'chat'}>
              {pullRequest.body}
            </Markdown>
          ) : null}
        </section>
        {children}
      </div>
      <aside className={styles.rail}>
        <section>
          <div className={styles.railLabel}>{t('reviews.status')}</div>
          <Flexbox horizontal align={'center'} className={styles.railValue} gap={8}>
            <Icon color={state.color} icon={state.icon} size={14} />
            <Text fontSize={13}>{t(state.key as never)}</Text>
          </Flexbox>
        </section>
        <section>
          <div className={styles.railLabel}>{t('reviews.checks')}</div>
          <Flexbox horizontal align={'center'} className={styles.railValue} gap={8}>
            <Icon
              color={checks.color}
              size={14}
              icon={
                pullRequest.checks.summary.state === 'passed'
                  ? CheckCircle2Icon
                  : pullRequest.checks.summary.state === 'failing'
                    ? XCircleIcon
                    : CircleDashedIcon
              }
            />
            <Text fontSize={13}>
              {t(checks.labelKey as never, { count: pullRequest.checks.summary.failing })}
            </Text>
          </Flexbox>
        </section>
        <section>
          <div className={styles.railLabel}>{t('reviews.branch')}</div>
          <Text className={styles.railValue} fontSize={13}>
            {branchLabel}
          </Text>
        </section>
        <section>
          <div className={styles.railLabel}>
            {t('reviews.filesChangedTitle', { count: pullRequest.changedFiles })}
          </div>
          <Flexbox gap={2} style={{ marginBlockStart: 8 }}>
            {files.map((file) => (
              <button
                className={styles.fileButton}
                key={file.filename}
                title={file.filename}
                type={'button'}
                onClick={() => onFileSelect(file.filename)}
              >
                <Icon icon={FileTextIcon} size={14} />
                <span className={styles.fileName}>{file.filename}</span>
                <span>
                  +{file.additions} −{file.deletions}
                </span>
              </button>
            ))}
            {hasMoreFiles ? (
              <button className={styles.fileButton} type={'button'} onClick={onViewMoreFiles}>
                {t('reviews.moreFilesInDiff')}
              </button>
            ) : null}
          </Flexbox>
        </section>
      </aside>
    </div>
  );
});

ReviewOverview.displayName = 'ReviewOverview';

export default ReviewOverview;
