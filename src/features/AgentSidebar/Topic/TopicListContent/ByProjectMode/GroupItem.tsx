import { AGENT_CHAT_URL } from '@orvilo/const';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { FolderClosedIcon, FolderOpenIcon, type LucideIcon, PlusIcon } from 'lucide-react';
import { createElement, memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import ActionIcon from '@/components/ActionIcon';
import { TOPIC_STATUS_VISUALS } from '@/components/ExecutionStatus';
import RingLoadingIcon from '@/components/RingLoading';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import UnreadDot from '@/components/UnreadDot';
import { isDesktop } from '@/const/version';
import { useCommitWorkingDirectory } from '@/features/ChatInput/ControlBar/useCommitWorkingDirectory';
import { resolveExecutionTarget } from '@/helpers/executionTarget';
import { useIsGatewayModeEnabled } from '@/helpers/gatewayMode';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useQueryRoute } from '@/hooks/useQueryRoute';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/selectors';

import { buildPrefixedAgentRoutePath, parseAgentPathname } from '../../../utils/agentPathname';
import TopicItem from '../../List/Item';
import { type GroupItemComponentProps } from '../GroupedAccordion';
import {
  getProjectTopicStatusCounts,
  hasProjectTopicStatusCounts,
  type ProjectTopicStatusCounts,
} from './statusCounts';

const PROJECT_GROUP_PREFIX = 'project:';

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
  addTopicAction: css`
    pointer-events: none;

    overflow: hidden;
    display: inline-flex;

    width: 0;

    opacity: 0;

    transition:
      width 150ms ${cssVar.motionEaseOut},
      opacity 150ms ${cssVar.motionEaseOut};

    &:focus-within,
    .accordion-header:hover & {
      pointer-events: auto;
      width: 24px;
      opacity: 1;
    }
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
  const { t } = useTranslation('topic');
  const { id, title, children } = group;

  const workingDirectory = useMemo(
    () => (id.startsWith(PROJECT_GROUP_PREFIX) ? id.slice(PROJECT_GROUP_PREFIX.length) : undefined),
    [id],
  );

  const agentId = useAgentStore((s) => s.activeAgentId);
  const { aid: routeAgentId } = useActiveRouteParams<{ aid?: string }>();
  const { pathname } = useActiveLocation();
  const agentRoute = useMemo(() => parseAgentPathname(pathname), [pathname]);
  const targetAgentId = routeAgentId ?? agentRoute?.agentId ?? agentId;
  const currentAgentId = targetAgentId ?? agentId;
  const router = useQueryRoute();
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const agencyConfig = useAgentStore(agentByIdSelectors.getAgencyConfigById(currentAgentId ?? ''));
  const isHeterogeneous = useAgentStore((s) =>
    currentAgentId ? agentByIdSelectors.isAgentHeterogeneousById(currentAgentId)(s) : false,
  );
  const isWorkspaceAgent = useAgentStore((s) =>
    currentAgentId ? agentByIdSelectors.isWorkspaceAgentById(currentAgentId)(s) : false,
  );
  const { commitAgentDefault } = useCommitWorkingDirectory(currentAgentId ?? '');

  const handleAddTopic = useCallback(async () => {
    if (!workingDirectory || !currentAgentId || !targetAgentId) return;
    // Write the agent's per-device default so the new topic inherits this
    // directory at creation time — the same high-precedence slot the picker
    // uses, not the legacy per-agent fallback that gets shadowed by it.
    await commitAgentDefault(workingDirectory);
    useChatStore.getState().switchTopic(null, { skipRefreshMessage: true });
    router.push(
      buildPrefixedAgentRoutePath(AGENT_CHAT_URL(targetAgentId), agentRoute, activeWorkspaceSlug),
    );
  }, [
    workingDirectory,
    currentAgentId,
    targetAgentId,
    commitAgentDefault,
    router,
    agentRoute,
    activeWorkspaceSlug,
  ]);

  // Web can add a topic in a directory too when the agent targets a bound
  // device — the write goes to `workingDirByDevice`, no Electron dependency.
  const deviceRoutingAvailable = useIsGatewayModeEnabled(currentAgentId);
  const effectiveTarget = resolveExecutionTarget(agencyConfig, {
    clientExecutionAvailable: isDesktop,
    deviceRoutingAvailable,
    isHetero: isHeterogeneous,
    workspaceScoped: isWorkspaceAgent,
  });
  const isDeviceMode = effectiveTarget === 'device' && !!agencyConfig?.boundDeviceId;
  const canAddTopic = (isDesktop || isDeviceMode) && !!workingDirectory;

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
  const action =
    canAddTopic || hasCollapsedIndicators ? (
      <div className="flex items-center gap-1">
        {hasCollapsedStatus && <CollapsedStatusBadges counts={statusCounts} />}
        {hasCollapsedUnread && <CollapsedUnreadDot count={unreadCount} />}
        {canAddTopic && (
          <span className={hasCollapsedIndicators ? styles.addTopicAction : undefined}>
            <ActionIcon
              icon={PlusIcon}
              size={'small'}
              title={t('actions.addNewTopicInProject', { directory: title })}
              tooltipProps={{ placement: 'right' }}
              onClick={(e) => {
                e.stopPropagation();
                void handleAddTopic();
              }}
            />
          </span>
        )}
      </div>
    ) : undefined;

  return (
    <AccordionItem value={id}>
      <div className="flex items-center accordion-header">
        <div className="min-w-0 flex-1">
          <AccordionTrigger style={{ paddingBlock: 4, paddingInline: 4 }}>
            <div className="flex items-center gap-2 h-[24px]" style={{ overflow: 'hidden' }}>
              <div className="flex flex-col items-center justify-center flex-none h-[24px] w-[28px]">
                <ProjectFolderIcon
                  color={cssVar.colorTextTertiary}
                  size={{ size: 15, strokeWidth: 1.5 }}
                />
              </div>
              <div
                className="truncate text-[14px]"
                style={{ color: cssVar.colorTextSecondary, flex: 1 }}
              >
                {title}
              </div>
            </div>
          </AccordionTrigger>
        </div>
        {action && <div className="flex shrink-0 items-center">{action}</div>}
      </div>
      <AccordionContent className="[&>div]:p-0">
        <div className="flex flex-col gap-[1px]" style={{ paddingBlock: 1 }}>
          {children.map((topic) => (
            <TopicItem
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
