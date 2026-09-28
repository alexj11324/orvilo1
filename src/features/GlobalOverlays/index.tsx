'use client';

import { lazy, memo, Suspense, useState } from 'react';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { isAcceptancePortalView } from './acceptancePortalView';
import RecentSync from './RecentSync';

/**
 * The lazy chunks the shell mounts, but only once something has asked for them.
 * Both panels are anchored to the viewport and portal to the document, so the
 * page they are declared on has no bearing on where they appear — what matters
 * is that exactly one host is mounted for the whole app.
 */
const AcceptancePortalDrawer = lazy(() => import('./AcceptancePortalDrawer'));
const TopicChatDrawer = lazy(() => import('@/features/AgentTasks/AgentTaskDetail/TopicChatDrawer'));

/**
 * App-wide overlays and background sync that every route needs.
 *
 * These used to hang off the old Home layout, which was mounted for the whole
 * app and therefore hosted them by accident. Two of the three are load-bearing
 * far from Home:
 *
 * - `RecentSync` is the only writer of the recents the nav panel's "Recently
 *   visited" section reads, so dropping it empties that section silently.
 * - `TopicChatDrawer` is opened from the task list and the board, which have no
 *   host of their own.
 * - `AcceptancePortalDrawer` hosts acceptance portal views on every route that
 *   has no persistent portal column.
 *
 * Mounting them here — once, from the shell layout — keeps that behaviour while
 * making the dependency explicit rather than incidental.
 */
const GlobalOverlays = memo(() => {
  const portalViewType = useChatStore(chatPortalSelectors.currentViewType);
  const drawerTopicId = useTaskStore(taskDetailSelectors.activeTopicDrawerTopicId);

  // Mount on first use and keep mounted: the first open still pays for the
  // chunk, and the close animation always has something left to render.
  const [topicMounted, setTopicMounted] = useState(false);
  if (drawerTopicId && !topicMounted) setTopicMounted(true);
  const [acceptanceMounted, setAcceptanceMounted] = useState(false);
  if (isAcceptancePortalView(portalViewType) && !acceptanceMounted) setAcceptanceMounted(true);

  return (
    <>
      <RecentSync />
      {topicMounted && (
        <Suspense fallback={null}>
          {/* The one instance allowed to open a panel inside a tree that has a
              global host — every other mount is page-level and stands down. */}
          <TopicChatDrawer asGlobalHost />
        </Suspense>
      )}
      {acceptanceMounted && (
        <Suspense fallback={null}>
          <AcceptancePortalDrawer />
        </Suspense>
      )}
    </>
  );
});

GlobalOverlays.displayName = 'GlobalOverlays';

export default GlobalOverlays;
