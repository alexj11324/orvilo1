'use client';

import type { WorkSummaryItem } from '@orvilo/types';
import { formatTokenNumber } from '@orvilo/utils/format';
import { cn } from 'cn';
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
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';
import { getWorkVersionTotalTokens } from '@/utils/workCumulativeUsage';
import { formatWorkVersionCost } from '@/utils/workVersionCost';

import WorkPreview from './WorkPreview';

const styles = {
  agentName:
    'overflow-hidden flex-none max-w-16 text-xs leading-5 font-semibold text-ellipsis whitespace-nowrap',
  card: 'relative overflow-hidden border border-solid border-divider rounded-(--radius-card) bg-card transition-[transform,border-color,box-shadow] duration-(--orvilo-motion-fast) ease-[ease]',
  cardInfo: 'p-4',
  clickable: 'cursor-pointer hover:border-border',
  removeAction:
    "absolute z-1 inset-bs-4 inset-e-4 opacity-0 transition-opacity duration-(--orvilo-motion-fast) ease-[ease] focus-visible:opacity-100 [.work-preview-card:hover_&]:opacity-100 [@media(hover:none)]:opacity-100 pointer-coarse:before:absolute pointer-coarse:before:top-1/2 pointer-coarse:before:left-1/2 pointer-coarse:before:size-11 pointer-coarse:before:-translate-x-1/2 pointer-coarse:before:-translate-y-1/2 pointer-coarse:before:content-['']",
  footer: 'overflow-hidden mbs-2',
  identityMeta: 'flex-1 min-w-0',
  identifier:
    'overflow-hidden min-w-0 text-xs leading-5 text-foreground-tertiary text-ellipsis whitespace-nowrap',
  metaRow: 'min-w-0',
  meta: 'flex-none text-xs leading-5 text-foreground-tertiary',
  originTopic:
    'overflow-hidden min-w-0 text-xs leading-5 text-foreground-tertiary text-ellipsis whitespace-nowrap',
  title: 'overflow-hidden mbs-1 text-sm leading-5.5 font-semibold text-ellipsis whitespace-nowrap',
  type: 'text-xs leading-5 text-foreground-tertiary',
  usage: 'flex-none ms-auto text-xs leading-5 text-muted-foreground whitespace-nowrap',
};

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
      {...clickableProps(clickable)}
      className={cn(
        'work-preview-card flex flex-col',
        styles.card,
        clickable && styles.clickable,
        CLICKABLE_FOCUS_RING,
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
          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
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
        <div className={cn('flex items-center gap-1.5', styles.metaRow)}>
          <span className={styles.type}>{t(workTypeKey(item), { ns: 'file' })}</span>
          {displayIdentifier &&
            item.resourceType !== 'document' &&
            item.resourceType !== 'github_pull_request' &&
            item.resourceType !== 'linear_issue' && (
              <div className={cn('flex items-center gap-0.75', styles.identifier)}>
                {displayIdentifier}
              </div>
            )}
          {item.resourceType === 'github_issue' && item.status && (
            <Badge className="ms-auto rounded-(--radius-chip)" size="sm">
              {item.status}
            </Badge>
          )}
        </div>
        <div className={styles.title}>{title}</div>
        <div className={cn('flex items-baseline gap-1.75', styles.footer)}>
          {agent && (
            <>
              <AssigneeAvatar agentId={item.originAgentId} size={24} />
              <div className={cn('flex flex-col gap-0.5', styles.identityMeta)}>
                <div className="flex items-baseline gap-1.75">
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
            <div className={cn('flex flex-col gap-0.5', styles.identityMeta)}>
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
