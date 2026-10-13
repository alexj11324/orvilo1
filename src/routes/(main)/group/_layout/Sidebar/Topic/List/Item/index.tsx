import { GROUP_CHAT_TOPIC_URL } from '@orvilo/const';
import type { ChatTopicStatus } from '@orvilo/types';
import { HashIcon, MessageSquareDashed } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { memo, Suspense, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import DotsLoading from '@/components/DotsLoading';
import { TOPIC_STATUS_VISUALS } from '@/components/ExecutionStatus';
import { Badge } from '@/components/reui/badge';
import RingLoadingIcon from '@/components/RingLoading';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { isDesktop } from '@/const/version';
import { TopicMigrationIndicator } from '@/features/AgentTransferMigration';
import { useHasDraft } from '@/features/ChatInput/draftStorage';
import NavItem from '@/features/NavPanel/components/NavItem';
import TopicCreatorAvatar, { useTopicCreator } from '@/features/TopicCreatorAvatar';
import { useFocusTopicPopup } from '@/features/TopicPopupGuard/useTopicPopupsRegistry';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAgentGroupStore } from '@/store/agentGroup';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/selectors';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';
import { useElectronStore } from '@/store/electron';
import { useGlobalStore } from '@/store/global';
import { useResolvedMotionValues } from '@/styles/themeRoles';

import ThreadList from '../../TopicListContent/ThreadList';
import Actions from './Actions';
import Editing from './Editing';
import { useTopicItemDropdownMenu } from './useDropdownMenu';

const styles = {
  dotContainer:
    'relative size-4.5 -ms-1.5 will-change-[width] transition-[width] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-out) motion-reduce:transition-none',
  neonDot:
    'size-1.5 rounded-full bg-info shadow-[0_0_calc(var(--spacing)*0.75)_var(--info),0_0_calc(var(--spacing)*1.5)_var(--info)] animate-[group-topic-unread-pulse_1.2s_ease-in-out_infinite] motion-reduce:animate-none',
  neonDotWrapper: 'absolute inset-0 flex size-4.5 shrink-0 items-center justify-center',
};

// Module-scoped so a click on any topic cancels a pending click on another.
// Per-item refs can't do that, which lets rapid clicks across items all
// fire — each racing to write activeTopicId (see ).
let pendingSingleClickTimer: ReturnType<typeof setTimeout> | null = null;

const cancelPendingSingleClick = () => {
  if (pendingSingleClickTimer) {
    clearTimeout(pendingSingleClickTimer);
    pendingSingleClickTimer = null;
  }
};

interface TopicItemProps {
  active?: boolean;
  fav?: boolean;
  id?: string;
  status?: ChatTopicStatus | null;
  threadId?: string;
  title: string;
  /** Creator of the topic; drives the workspace creator avatar. */
  userId?: string;
}

const TopicItem = memo<TopicItemProps>(({ id, title, active, threadId, status, userId }) => {
  const { t } = useTranslation('topic');
  const { enabled: motionEnabled, durationMid: motionDurationMid } = useResolvedMotionValues();
  const unreadTransitionDuration = motionDurationMid.endsWith('ms')
    ? Number.parseFloat(motionDurationMid) / 1000
    : Number.parseFloat(motionDurationMid);
  const prefersReducedMotion = useSyncExternalStore(
    useCallback((onChange: () => void) => {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }, []),
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => true,
  );
  const shouldAnimateUnread = motionEnabled && !prefersReducedMotion;
  // Same live-running ring as the agent sidebar topic rows (see List/Item there).
  const loadingRingColor = 'var(--topic-running-ring)';
  const toggleMobileTopic = useGlobalStore((s) => s.toggleMobileTopic);
  const [activeGroupId, switchTopic] = useAgentGroupStore((s) => [s.activeGroupId, s.switchTopic]);
  const addTab = useElectronStore((s) => s.addTab);
  const activeWorkspaceSlug = useActiveWorkspaceSlug();
  const focusTopicPopup = useFocusTopicPopup({ groupId: activeGroupId });
  // A workspace-private group is a purely personal conversation space even
  // inside a workspace — its topics all belong to the viewer, so the creator
  // avatar carries no information there. Only workspace-shared (`public`)
  // groups get the avatar treatment.
  const isSharedGroup = useAgentGroupStore((s) =>
    s.activeGroupId ? s.groupMap[s.activeGroupId]?.visibility === 'public' : false,
  );
  // Creator of the topic — resolves only inside an active workspace; drives
  // the identity-first icon layout below.
  const author = useTopicCreator(isSharedGroup ? userId : undefined);

  // Construct href for cmd+click support
  const href = useMemo(() => {
    if (!activeGroupId || !id) return undefined;
    return buildWorkspaceAwarePath(GROUP_CHAT_TOPIC_URL(activeGroupId, id), activeWorkspaceSlug);
  }, [activeGroupId, activeWorkspaceSlug, id]);

  const [editing, isLoading] = useChatStore((s) => [
    id ? s.topicRenamingId === id : false,
    id ? operationSelectors.isTopicVisiblyRunning(id)(s) : false,
  ]);

  const isUnreadCompleted = useChatStore(
    id ? operationSelectors.isTopicUnreadCompleted(id) : () => false,
  );

  const toggleEditing = useCallback(
    (visible?: boolean) => {
      useChatStore.setState({ topicRenamingId: visible && id ? id : '' });
    },
    [id],
  );

  const handleClick = useCallback(() => {
    if (editing) return;
    if (isDesktop) {
      cancelPendingSingleClick();
      pendingSingleClickTimer = setTimeout(() => {
        pendingSingleClickTimer = null;
        void (async () => {
          await focusTopicPopup(id);
          switchTopic(id);
          toggleMobileTopic(false);
        })();
      }, 250);
    } else {
      void (async () => {
        await focusTopicPopup(id);
        switchTopic(id);
        toggleMobileTopic(false);
      })();
    }
  }, [editing, focusTopicPopup, id, switchTopic, toggleMobileTopic]);

  const handleDoubleClick = useCallback(async () => {
    if (!id || !activeGroupId || !isDesktop) return;
    cancelPendingSingleClick();
    if (await focusTopicPopup(id)) {
      switchTopic(id);
      toggleMobileTopic(false);
      return;
    }
    addTab(buildWorkspaceAwarePath(GROUP_CHAT_TOPIC_URL(activeGroupId, id), activeWorkspaceSlug));
    switchTopic(id);
    toggleMobileTopic(false);
  }, [
    id,
    activeGroupId,
    activeWorkspaceSlug,
    addTab,
    focusTopicPopup,
    switchTopic,
    toggleMobileTopic,
  ]);

  const dropdownMenu = useTopicItemDropdownMenu({
    id,
    status,
    toggleEditing,
  });

  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';
  const isRunning = status === 'running';
  const isWaitingForHuman = status === 'waitingForHuman';

  const hasUnread = id && isUnreadCompleted;
  const unreadNode = (
    <span className={styles.dotContainer} style={{ width: hasUnread ? 18 : 0 }}>
      {shouldAnimateUnread ? (
        <AnimatePresence mode="popLayout">
          {hasUnread && (
            <m.div
              className={styles.neonDotWrapper}
              initial={{ scale: 0, opacity: 0 }}
              transition={{ duration: unreadTransitionDuration, ease: 'easeOut' }}
              animate={{
                scale: 1,
                opacity: 1,
              }}
              exit={{
                scale: 0,
                opacity: 0,
              }}
            >
              <span className={styles.neonDot} />
            </m.div>
          )}
        </AnimatePresence>
      ) : (
        hasUnread && (
          <div className={styles.neonDotWrapper}>
            <span className={styles.neonDot} />
          </div>
        )
      )}
    </span>
  );

  // Surface a WeChat-style red "[Draft]" hint when this topic holds unsent
  // input. Group drafts live in localStorage keyed by messageMapKey under the
  // group scope; the default topic (no id) maps to the new-topic draft.
  const draftKey = useMemo(
    () =>
      activeGroupId
        ? messageMapKey({ agentId: '', groupId: activeGroupId, scope: 'group', topicId: id })
        : undefined,
    [activeGroupId, id],
  );
  const hasDraft = useHasDraft(draftKey);
  const draftPrefix = hasDraft ? (
    <div className="flex-none text-xs leading-5 text-destructive-text">{t('draft')}</div>
  ) : undefined;

  // For default topic (no id)
  if (!id) {
    return (
      <NavItem
        active={active}
        slots={{ titlePrefix: draftPrefix }}
        titleColor="var(--foreground)"
        icon={
          isLoading ? (
            <RingLoadingIcon className="text-warning-text" ringColor={loadingRingColor} size={16} />
          ) : (
            <MessageSquareDashed className="size-4 text-foreground-description" size={16} />
          )
        }
        title={
          <div className="flex items-center flex-1 gap-1.5">
            {t('defaultTitle')}
            <Badge
              className="text-xs leading-5 h-auto text-foreground-description"
              variant="primary-light"
            >
              {t('temp')}
            </Badge>
          </div>
        }
        onClick={handleClick}
      />
    );
  }

  // Execution / attention state. In workspace mode this moves to the row's
  // trailing side so the leading slot can carry the creator identity.
  const statusIconNode = (() => {
    if (isWaitingForHuman) {
      const visual = TOPIC_STATUS_VISUALS.waitingForHuman;
      return <visual.icon className="size-4" size={16} style={{ color: visual.color }} />;
    }
    if (isLoading || isRunning) {
      return (
        <RingLoadingIcon className="text-warning-text" ringColor={loadingRingColor} size={16} />
      );
    }
    if (isFailed) {
      const visual = TOPIC_STATUS_VISUALS.failed;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <visual.icon className="size-4" size={16} style={{ color: visual.color }} />
                </span>
              }
            />
            <TooltipContent>{t('failedStatusTip')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    if (isCompleted) {
      const visual = TOPIC_STATUS_VISUALS.completed;
      return <visual.icon className="size-4" size={16} style={{ color: visual.color }} />;
    }
    return null;
  })();

  return (
    <div className="relative flex flex-col">
      <NavItem
        actions={<Actions dropdownMenu={dropdownMenu} id={id} status={status} />}
        active={active && !threadId}
        contextMenuItems={dropdownMenu}
        disabled={editing}
        // A conversation whose history is still being migrated/copied stays
        // listed (hiding it would read as data loss) and shows a spinner;
        // opening it jumps it to the front of the backfill queue.
        extra={<TopicMigrationIndicator groupId={activeGroupId} topicId={id} />}
        href={!editing ? href : undefined}
        title={title === '...' ? <DotsLoading gap={3} size={4} /> : title}
        titleColor="var(--foreground)"
        icon={
          // Workspace mode: the creator's round avatar is the primary visual;
          // the row's own status icon shrinks into a bottom-right corner
          // badge. Personal mode keeps the original status-first layout.
          author ? (
            <TopicCreatorAvatar corner={statusIconNode} userId={userId} />
          ) : (
            (statusIconNode ?? (
              <HashIcon className="size-4 text-foreground-description" size={16} />
            ))
          )
        }
        slots={{
          iconPostfix: unreadNode,
          titlePrefix: draftPrefix,
        }}
        onClick={handleClick}
        onDoubleClick={() => void handleDoubleClick()}
      />
      <Editing id={id} title={title} toggleEditing={toggleEditing} />
      {active && (
        <Suspense
          fallback={
            <div className="flex w-full flex-col gap-2 py-2 px-6">
              <Skeleton className="h-5.5 w-full" />
              <Skeleton className="h-5.5 w-full" />
            </div>
          }
        >
          <ThreadList />
        </Suspense>
      )}
    </div>
  );
});

export default TopicItem;
