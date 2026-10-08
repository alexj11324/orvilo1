import { createStaticStyles, cssVar, cx } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { FolderClosedIcon, FolderOpenIcon, type LucideIcon } from 'lucide-react';
import { createElement, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { TOPIC_STATUS_VISUALS } from '@/components/ExecutionStatus';
import RingLoadingIcon from '@/components/RingLoading';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import UnreadDot from '@/components/UnreadDot';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/selectors';

import { accordionStyles } from '../../accordionStyles';
import TopicItem from '../../List/Item';
import { type GroupItemComponentProps } from '../GroupedAccordion';
import {
  getProjectTopicStatusCounts,
  hasProjectTopicStatusCounts,
  type ProjectTopicStatusCounts,
} from './statusCounts';

const styles = createStaticStyles(({ css }) => ({
  statusBadge: css`
    display: inline-flex;
    gap: 2px;
    align-items: center;
    justify-content: center;

    min-width: 20px;
    height: 18px;
    padding-inline: 4px;
    border-radius: 9px;

    font-size: 11px;
    font-weight: 500;
    line-height: 1;
  `,
  statusBadgeError: css`
    color: ${cssVar.colorError};
    background: color-mix(in srgb, ${cssVar.colorError} 14%, transparent);
  `,
  statusBadgeLoading: css`
    color: ${cssVar.colorWarning};
    background: color-mix(in srgb, ${cssVar.colorWarning} 14%, transparent);
  `,
  statusBadgeWaiting: css`
    color: ${cssVar.colorInfo};
    background: color-mix(in srgb, ${cssVar.colorInfo} 14%, transparent);
  `,
}));

interface StatusBadgeConfig {
  className: string;
  count: number;
  icon?: LucideIcon;
  label: string;
  loading?: boolean;
}

const CollapsedStatusBadges = memo<{ counts: ProjectTopicStatusCounts }>(({ counts }) => {
  const { t } = useTranslation('topic');

  const items: StatusBadgeConfig[] = [
    {
      className: styles.statusBadgeLoading,
      count: counts.loading,
      label: t('projectStatus.loading', { count: counts.loading }),
      loading: true,
    },
    {
      className: styles.statusBadgeWaiting,
      count: counts.waitingForHuman,
      icon: TOPIC_STATUS_VISUALS.waitingForHuman.icon,
      label: t('projectStatus.waitingForHuman', { count: counts.waitingForHuman }),
    },
    {
      className: styles.statusBadgeError,
      count: counts.failed,
      icon: TOPIC_STATUS_VISUALS.failed.icon,
      label: t('projectStatus.failed', { count: counts.failed }),
    },
  ].filter((item) => item.count > 0);

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-[3px]">
      {items.map(({ className, count, icon, label, loading }) => (
        <Tooltip key={label}>
          <TooltipTrigger
            render={
              <span>
                <span
                  aria-label={label}
                  className={cx(styles.statusBadge, className)}
                  role="status"
                >
                  {loading ? (
                    <RingLoadingIcon
                      ringColor={`color-mix(in srgb, ${cssVar.colorWarning} 28%, transparent)`}
                      size={11}
                      style={{ color: cssVar.colorWarning }}
                    />
                  ) : (
                    icon && createElement(icon, { size: 11, strokeWidth: 2 })
                  )}
                  {count}
                </span>
              </span>
            }
          />
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
});

CollapsedStatusBadges.displayName = 'CollapsedProjectStatusBadges';

const CollapsedUnreadDot = memo<{ count: number }>(({ count }) => {
  const { t } = useTranslation('topic');
  const label = t('projectStatus.unread', { count });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span>
            <UnreadDot label={label} />
          </span>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
});

CollapsedUnreadDot.displayName = 'CollapsedProjectUnreadDot';

const GroupItem = memo<GroupItemComponentProps>(({ group, expanded }) => {
  const { id, title, children } = group;

  const statusCounts = useChatStore(
    (s) => getProjectTopicStatusCounts(children, operationSelectors.visiblyRunningTopicIds(s)),
    isEqual,
  );
  const childTopicIds = useMemo(() => children.map((topic) => topic.id), [children]);
  const unreadCount = useChatStore(operationSelectors.unreadCompletedCountForTopics(childTopicIds));
  const hasCollapsedStatus = !expanded && hasProjectTopicStatusCounts(statusCounts);
  const hasCollapsedUnread = !expanded && unreadCount > 0;
  const hasCollapsedIndicators = hasCollapsedStatus || hasCollapsedUnread;
  const ProjectFolderIcon = expanded ? FolderOpenIcon : FolderClosedIcon;
  const action = hasCollapsedIndicators ? (
    <div className="flex items-center gap-1">
      {hasCollapsedStatus && <CollapsedStatusBadges counts={statusCounts} />}
      {hasCollapsedUnread && <CollapsedUnreadDot count={unreadCount} />}
    </div>
  ) : undefined;

  return (
    <AccordionItem className={accordionStyles.item} value={id}>
      <div className="flex items-center accordion-header">
        <div className="min-w-0 flex-1">
          <AccordionTrigger
            className={accordionStyles.trigger}
            style={{ paddingBlock: 4, paddingInline: 8 }}
          >
            <div className="flex items-center gap-1.5 h-[24px]" style={{ overflow: 'hidden' }}>
              <div className="flex flex-col items-center justify-center flex-none h-[16px] w-[16px]">
                <ProjectFolderIcon color={cssVar.colorTextTertiary} size={15} strokeWidth={1.5} />
              </div>
              <div
                className="truncate text-[12px] text-muted-foreground font-medium"
                style={{ flex: 1 }}
              >
                {title}
              </div>
            </div>
          </AccordionTrigger>
        </div>
        {action && <div className="flex shrink-0 items-center">{action}</div>}
      </div>
      <AccordionContent className="p-0">
        <div className="flex flex-col gap-[1px]" style={{ paddingBlock: 1 }}>
          {children.map((topic) => (
            <TopicItem
              agentId={topic.agentId}
              fav={topic.favorite}
              id={topic.id}
              key={topic.id}
              metadata={topic.metadata}
              status={topic.status}
              title={topic.title}
              userId={topic.userId}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}, isEqual);

GroupItem.displayName = 'TopicByProjectGroupItem';

export default GroupItem;
