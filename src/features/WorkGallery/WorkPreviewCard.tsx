'use client';

import type { WorkSummaryItem } from '@orvilo/types';
import { formatTokenNumber } from '@orvilo/utils/format';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { Trash2Icon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Badge } from '@/components/reui/badge';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { formatTaskItemDate } from '@/features/AgentTasks/features/formatTaskItemDate';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import { getWorkTypeDescriptor } from '@/features/Work/descriptors';
import { useRemoveWork } from '@/features/Work/useRemoveWork';
import { useResourceDeletedPrompt } from '@/features/Work/useResourceDeletedPrompt';
import { getWorkVersionTotalTokens } from '@/utils/workCumulativeUsage';
import { formatWorkVersionCost } from '@/utils/workVersionCost';

import WorkPreview from './WorkPreview';

const styles = createStaticStyles(({ css }) => ({
  agentAvatar: css`
    align-self: flex-start;
    margin-block-start: 2px;
  `,
  agentName: css`
    overflow: hidden;
    flex: none;

    max-width: 64px;

    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  card: css`
    position: relative;

    overflow: hidden;

    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: ${cssVar.colorBgContainer};

    transition:
      transform ${cssVar.motionDurationFast},
      border-color ${cssVar.motionDurationFast},
      box-shadow ${cssVar.motionDurationFast};
  `,
  cardInfo: css`
    padding-block: 8px 12px;
    padding-inline: 12px;
  `,
  clickable: css`
    cursor: pointer;

    &:hover {
      border-color: ${cssVar.colorBorder};
    }
  `,
  removeAction: css`
    position: absolute;
    z-index: 1;
    inset-block-start: 12px;
    inset-inline-end: 12px;

    opacity: 0;

    transition: opacity ${cssVar.motionDurationFast};

    &:focus-visible,
    .work-preview-card:hover & {
      opacity: 1;
    }

    /* Touch devices have no hover to reveal it; keep the only removal control visible. */
    @media (hover: none) {
      opacity: 1;
    }
  `,
  footer: css`
    overflow: hidden;
    margin-block-start: 8px;
  `,
  identityMeta: css`
    flex: 1;
    min-width: 0;
  `,
  identifier: css`
    overflow: hidden;

    min-width: 0;

    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  metaRow: css`
    min-width: 0;
  `,
  meta: css`
    flex: none;
    font-size: 10px;
    color: ${cssVar.colorTextTertiary};
  `,
  originTopic: css`
    overflow: hidden;

    min-width: 0;

    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  title: css`
    overflow: hidden;

    margin-block-start: 5px;

    font-size: 15px;
    font-weight: 650;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  type: css`
    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
  `,
  usage: css`
    flex: none;

    margin-inline-start: auto;

    font-size: 10px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;
  `,
}));

interface WorkPreviewCardProps {
  item: WorkSummaryItem;
  onOpen: (item: WorkSummaryItem) => void;
  /** Refresh the owning (infinite) list after an orphan card is removed; see `useRemoveWork`. */
  onRemoved?: () => void | Promise<void>;
}

const workTypeKey = (item: WorkSummaryItem) => {
  switch (item.resourceType) {
    case 'document': {
      return 'work.type.document';
    }
    case 'file': {
      return 'work.type.file';
    }
    case 'github_issue': {
      return 'work.type.githubIssue';
    }
    case 'github_pull_request': {
      return 'work.type.githubPullRequest';
    }
    case 'linear_document': {
      return 'work.type.linearDocument';
    }
    case 'linear_issue': {
      return 'work.type.linearIssue';
    }
    case 'task': {
      return 'work.type.task';
    }
  }
};

const WorkPreviewCard = memo<WorkPreviewCardProps>(({ item, onOpen, onRemoved }) => {
  const { t, i18n } = useTranslation(['chat', 'common', 'file']);
  const agent = useAgentDisplayMeta(item.originAgentId);
  const removeWork = useRemoveWork({ onRemoved });
  const promptResourceDeleted = useResourceDeletedPrompt({ onRemoved });
  const descriptor = getWorkTypeDescriptor(item);
  const title =
    descriptor.getTitle(item)?.trim() ||
    descriptor.getIdentifier(item) ||
    item.resourceId ||
    item.id;
  const identifier = descriptor.getIdentifier(item);
  const displayIdentifier =
    item.resourceType.startsWith('github_') && identifier?.includes('#')
      ? `#${identifier.split('#').at(-1)}`
      : identifier;
  // The backing resource was deleted outside the tool path: the Work lingers as
  // an orphan rendered from its snapshot and opening it would 404. The card
  // keeps its normal look; a click explains that the resource is gone and
  // offers removal in the same dialog — the only way the user can clear the
  // card, since the resource it points at is already gone. The hover trash
  // action reaches the same confirm for users who already know.
  const resourceDeleted = item.resourceDeleted;
  const openTarget = descriptor.getOpenTarget(item);
  const clickable = !!openTarget && (openTarget.kind !== 'filePreview' || !!openTarget.url);
  const eventDate = item.event.changeType === 'created' ? item.createdAt : item.updatedAt;
  const eventAt = formatTaskItemDate(eventDate, {
    formatOtherYear: t('time.formatOtherYear', { ns: 'common' }),
    formatThisYear: t('time.formatThisYear', { ns: 'common' }),
    locale: i18n.language,
  });
  const eventTime = t(item.event.changeType === 'created' ? 'work.createdAt' : 'work.updatedAt', {
    date: eventAt,
    ns: 'file',
  });
  const totalTokens = getWorkVersionTotalTokens(item.event.cumulativeUsage);
  const cost = formatWorkVersionCost(item.totalCost);

  return (
    <div
      className={cx(
        'work-preview-card',
        'flex flex-col',
        styles.card,
        clickable && styles.clickable,
      )}
      onClick={
        clickable ? () => (resourceDeleted ? promptResourceDeleted(item) : onOpen(item)) : undefined
      }
    >
      {resourceDeleted && (
        <ActionIcon
          danger
          className={styles.removeAction}
          icon={Trash2Icon}
          size={'small'}
          title={t('workingPanel.works.remove', { ns: 'chat' })}
          variant={'filled'}
          onClick={(event) => {
            event.stopPropagation();
            removeWork(item);
          }}
        />
      )}
      <WorkPreview item={item} title={title} />
      <div className={styles.cardInfo}>
        <div className={cx('flex items-center gap-1.5', styles.metaRow)}>
          <span className={styles.type}>{t(workTypeKey(item), { ns: 'file' })}</span>
          {displayIdentifier &&
            item.resourceType !== 'document' &&
            item.resourceType !== 'github_pull_request' &&
            item.resourceType !== 'linear_issue' && (
              <div className={cx('flex items-center gap-[3px]', styles.identifier)}>
                {displayIdentifier}
              </div>
            )}
          {item.resourceType === 'github_issue' && item.status && (
            <Badge size="sm" style={{ marginInlineStart: 'auto' }}>
              {item.status}
            </Badge>
          )}
        </div>
        <div className={styles.title}>{title}</div>
        <div className={cx('flex items-baseline gap-[7px]', styles.footer)}>
          {agent && (
            <>
              <AssigneeAvatar agentId={item.originAgentId} size={24} />
              <div className={cx('flex flex-col gap-0.5', styles.identityMeta)}>
                <div className="flex items-baseline gap-[7px]">
                  <span className={styles.agentName}>{agent.title}</span>
                  <span className={styles.meta}>{eventTime}</span>
                </div>
                {item.originTopicTitle && (
                  <div className={styles.originTopic}>
                    {t('work.fromTopic', { ns: 'file', topic: item.originTopicTitle })}
                  </div>
                )}
              </div>
            </>
          )}
          {!agent && (
            <div className={cx('flex flex-col gap-0.5', styles.identityMeta)}>
              <span className={styles.meta}>{eventTime}</span>
              {item.originTopicTitle && (
                <div className={styles.originTopic}>
                  {t('work.fromTopic', { ns: 'file', topic: item.originTopicTitle })}
                </div>
              )}
            </div>
          )}
          {(totalTokens || cost) && (
            <span className={styles.usage}>
              {[totalTokens ? `${formatTokenNumber(totalTokens)} tokens` : null, cost]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

WorkPreviewCard.displayName = 'WorkPreviewCard';

export default WorkPreviewCard;
