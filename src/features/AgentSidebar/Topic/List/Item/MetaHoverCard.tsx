import type { ChatTopicMetadata } from '@orvilo/types';
import { cn } from 'cn';
import type { Clock } from 'lucide-react';
import { GitBranchIcon, GitForkIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import DirIcon from '@/features/ChatInput/ControlBar/DirIcon';
import { useChatStore } from '@/store/chat';

import {
  getCiVisual,
  getPullRequestState,
  getTopicMetaCard,
  PR_STATE_VISUAL,
} from './metaCardData';

const styles = {
  card: 'flex w-75 max-w-[calc(100vw-48px)] flex-col gap-2 p-1.5',
  header: 'flex items-baseline justify-between gap-3',
  headerTime: 'flex-none text-xs leading-5 text-foreground-tertiary',
  headerTitle: 'truncate text-sm font-medium leading-5.5 text-foreground',
  row: 'flex min-w-0 items-center gap-2 text-xs leading-5 text-muted-foreground',
  rowIcon: 'flex-none text-foreground-tertiary',
  rowText: 'min-w-0 truncate',
  prLink:
    'cursor-pointer -ms-1.5 -me-1.5 rounded-(--radius-button) ps-1.5 pe-1.5 py-0.5 text-inherit no-underline hover:bg-accent hover:text-foreground',
};

interface DetailRowProps {
  children: ReactNode;
  icon: typeof Clock;
  iconColor?: string;
  title?: string;
}

const DetailRow = memo<DetailRowProps>(({ icon, iconColor, title, children }) => (
  <div className={styles.row}>
    {createElement(icon, {
      className: styles.rowIcon,
      size: 16,
      style: iconColor ? { color: iconColor } : undefined,
    })}
    <span className={styles.rowText} title={title}>
      {children}
    </span>
  </div>
));

DetailRow.displayName = 'DetailRow';

interface MetaHoverCardProps {
  metadata: ChatTopicMetadata | undefined;
  time?: ReactNode;
  title: string;
  /** Enables the open-time PR/CI refresh below; without it the card is a pure snapshot reader. */
  topicId?: string;
}

/**
 * Codex-style hover detail card for a topic row: surfaces the persisted repo /
 * branch / worktree / linked-PR / CI context on the right of the sidebar without
 * cluttering the row itself.
 */
const MetaHoverCard = memo<MetaHoverCardProps>(({ metadata, title, time, topicId }) => {
  const { t } = useTranslation('topic');
  // The card only mounts while the popover is open, so hosting the linked-PR
  // SWR hook here re-fetches the persisted PR/CI snapshot exactly when the
  // user is looking at it (the hook dedupes to once a minute per PR).
  // ChatHydration runs the same hook for the active topic only — without this,
  // a background topic's badge stays frozen on whatever was last persisted.
  const useFetchTopicLinkedPullRequest = useChatStore((s) => s.useFetchTopicLinkedPullRequest);
  useFetchTopicLinkedPullRequest(topicId, metadata);

  const card = getTopicMetaCard(metadata);
  if (!card) return null;

  const { repoName, repoType, branch, detached, worktreeName, pullRequest } = card;
  const ci = pullRequest ? getCiVisual(pullRequest.ciStatus) : undefined;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>{title}</span>
        {time !== undefined && <span className={styles.headerTime}>{time}</span>}
      </div>

      {repoName && (
        <div className={styles.row}>
          <DirIcon repoType={repoType} size={16} />
          <span className={styles.rowText} title={repoName}>
            {repoName}
          </span>
        </div>
      )}

      {branch && (
        <DetailRow icon={GitBranchIcon} title={branch}>
          {detached ? t('metaCard.detached', { sha: branch }) : branch}
        </DetailRow>
      )}

      {worktreeName && (
        <DetailRow icon={GitForkIcon} title={worktreeName}>
          {worktreeName}
        </DetailRow>
      )}

      {pullRequest &&
        (() => {
          const prState = getPullRequestState(pullRequest);
          const prVisual = PR_STATE_VISUAL[prState];
          const prTitleAttr = pullRequest.title
            ? `#${pullRequest.number} ${pullRequest.title}`
            : `#${pullRequest.number}`;
          const prInner = (
            <>
              <prVisual.icon
                className={styles.rowIcon}
                size={16}
                style={{ color: prVisual.color }}
              />
              <span className={styles.rowText} title={prTitleAttr}>
                <span className="font-medium" style={{ color: prVisual.color }}>
                  {t(prVisual.labelKey)}
                </span>
                {/* The number leads the title: it is the stable identifier, and a
                    long title would otherwise push it past the ellipsis. */}
                <span className="text-foreground-tertiary">{` · #${pullRequest.number}`}</span>
                {pullRequest.title ? ` ${pullRequest.title}` : ''}
              </span>
            </>
          );
          // Clickable when a url is persisted — opens the PR on GitHub in the
          // system browser; older snapshots without a url stay a plain row.
          return pullRequest.url ? (
            <a
              className={cn(styles.row, styles.prLink)}
              href={pullRequest.url}
              rel={'noreferrer'}
              target={'_blank'}
            >
              {prInner}
            </a>
          ) : (
            <div className={styles.row}>{prInner}</div>
          );
        })()}

      {ci && (
        <DetailRow icon={ci.icon} iconColor={ci.color}>
          {t(ci.labelKey)}
        </DetailRow>
      )}
    </div>
  );
});

MetaHoverCard.displayName = 'MetaHoverCard';

export default MetaHoverCard;
