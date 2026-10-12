import { cn } from 'cn';
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

const styles = {
  statusBadge:
    'inline-flex min-h-6 min-w-6 items-center justify-center gap-0.5 rounded-(--radius-chip) px-1 py-0.5 text-xs font-medium leading-5',
  statusBadgeError: 'bg-destructive-wash text-destructive-text',
  statusBadgeLoading: 'bg-warning-wash text-warning-text',
  statusBadgeWaiting: 'bg-info-wash text-info-text',
};

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
    <div className="flex items-center gap-1">
      {items.map(({ className, count, icon, label, loading }) => (
        <Tooltip key={label}>
          <TooltipTrigger
            render={
              <span>
                <span
                  aria-label={label}
                  className={cn(styles.statusBadge, className)}
                  role="status"
                >
                  {loading ? (
                    <RingLoadingIcon
                      className="text-warning-text"
                      ringColor={'var(--warning-wash)'}
                      size={16}
                    />
                  ) : (
                    icon && createElement(icon, { size: 16, strokeWidth: 2 })
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
            iconClassName={accordionStyles.triggerIcon}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5 h-6 overflow-hidden">
              <div className="flex flex-col items-center justify-center flex-none h-4 w-4">
                <ProjectFolderIcon
                  color={'var(--foreground-tertiary)'}
                  size={16}
                  strokeWidth={1.5}
                />
              </div>
              <div className="truncate text-xs leading-5 text-muted-foreground font-medium flex-1">
                {title}
              </div>
            </div>
          </AccordionTrigger>
        </div>
        {action && <div className="flex shrink-0 items-center">{action}</div>}
      </div>
      <AccordionContent className="p-0">
        <div className="flex flex-col gap-px py-px">
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
