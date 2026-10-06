import { appNavigate } from '@/features/Electron/navigation/appNavigate';
import { getTabRouter } from '@/features/Electron/TabHost/tabRouterManager';
import { useChatStore } from '@/store/chat';
import { useElectronStore } from '@/store/electron';

import { type ActiveConversationCoordinate, buildActiveConversationUrl } from './coordinate';

type Navigate = (url: string, options: { replace: true }) => void;

export const subscribeActiveConversationNavigation = (
  getCoordinate: () => ActiveConversationCoordinate,
  navigate: Navigate = appNavigate,
) =>
  useChatStore.subscribe((state, previousState) => {
    if (
      state.activeTopicId === previousState.activeTopicId &&
      state.activeThreadId === previousState.activeThreadId
    ) {
      return;
    }

    const coordinate = getCoordinate();
    // `/chat` conversations carry no route agent or group — the chat base
    // path alone is enough to keep the store→URL write-back alive there.
    if (
      !coordinate.isConversation ||
      (!coordinate.routeAgentId && !coordinate.groupId && !coordinate.chatBasePath)
    )
      return;

    // Child route hydration can reset the old topic before the passive URL
    // mirror updates coordinateRef. The live tab router already owns the new
    // route, so do not write the stale conversation URL back over it.
    const activeTabId = useElectronStore.getState().activeTabId;
    const liveLocation = activeTabId ? getTabRouter(activeTabId)?.state.location : undefined;
    if (
      liveLocation &&
      `${liveLocation.pathname}${liveLocation.search}${liveLocation.hash}` !==
        `${coordinate.pathname}${coordinate.search}${coordinate.hash}`
    )
      return;

    if (state.activeTopicId === undefined && coordinate.topicId) {
      useChatStore.setState(
        { activeTopicId: coordinate.topicId },
        false,
        'ActiveConversationBridge/restoreTopicAfterScopedReset',
      );
      return;
    }

    const topicId = state.activeTopicId || null;
    const threadId = state.activeThreadId || null;
    if (topicId === coordinate.topicId && threadId === coordinate.threadId) return;

    navigate(buildActiveConversationUrl(coordinate, topicId, threadId), { replace: true });
  });
