import { AGENT_CHAT_TOPIC_URL, AGENT_CHAT_URL } from '@orvilo/const';
import { useLayoutEffect, useRef } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useQueryState } from '@/hooks/useQueryParam';
import { useChatStore } from '@/store/chat';

const getSearchSuffix = (searchParams: URLSearchParams) => {
  const search = searchParams.toString();

  return search ? `?${search}` : '';
};

interface ChatRouteSyncOptions {
  getConversationPath?: (agentId: string) => string;
  getTopicPath?: (agentId: string, topicId: string) => string;
}

export const useChatRouteSync = (options: ChatRouteSyncOptions = {}) => {
  const location = useLocation();
  const navigate = useWorkspaceAwareNavigate();
  const params = useParams<{ aid?: string; topicId?: string }>();
  const [searchParams] = useSearchParams();
  const [thread, setThread] = useQueryState('thread', { history: 'replace', throttleMs: 500 });
  const routeTopicId = params.topicId;

  useLayoutEffect(() => {
    const target = routeTopicId ?? null;
    if (useChatStore.getState().activeTopicId !== target) {
      useChatStore.setState({ activeTopicId: target! }, false, 'ChatHydration/syncTopicFromUrl');
    }
  }, [routeTopicId]);

  useLayoutEffect(() => {
    const target = thread ?? null;
    if (useChatStore.getState().activeThreadId !== target) {
      useChatStore.setState({ activeThreadId: target! }, false, 'ChatHydration/syncThreadFromUrl');
    }
  }, [thread]);

  const locationRef = useRef(location);
  const paramsRef = useRef(params);
  const searchParamsRef = useRef(searchParams);

  locationRef.current = location;
  paramsRef.current = params;
  searchParamsRef.current = searchParams;

  useLayoutEffect(() => {
    const unsubscribeTopic = useChatStore.subscribe(
      (state) => state.activeTopicId,
      (state) => {
        const { aid, topicId } = paramsRef.current;
        // Conversation-stable routes (`/chat`) carry no agent segment — the
        // custom path builders don't need one; the agent-scoped defaults do,
        // so they only resolve when an agent id exists.
        const routeAgentId = aid || useChatStore.getState().activeAgentId;

        if (state === topicId) return;

        if (state === undefined && topicId) {
          useChatStore.setState(
            { activeTopicId: topicId },
            false,
            'ChatHydration/restoreTopicAfterScopedReset',
          );
          return;
        }

        const nextSearchParams = new URLSearchParams(searchParamsRef.current);
        nextSearchParams.delete('topic');

        const nextPath = state
          ? (options.getTopicPath?.(routeAgentId ?? '', state) ??
            (routeAgentId ? AGENT_CHAT_TOPIC_URL(routeAgentId, state) : undefined))
          : (options.getConversationPath?.(routeAgentId ?? '') ??
            (routeAgentId ? AGENT_CHAT_URL(routeAgentId) : undefined));
        if (!nextPath) return;
        const nextUrl = `${nextPath}${getSearchSuffix(nextSearchParams)}${locationRef.current.hash}`;
        const currentUrl = `${locationRef.current.pathname}${locationRef.current.search}${locationRef.current.hash}`;

        if (currentUrl !== nextUrl) navigate(nextUrl, { replace: true });
      },
    );
    const unsubscribeThread = useChatStore.subscribe(
      (state) => state.activeThreadId,
      (state) => {
        setThread(state || null);
      },
    );

    return () => {
      unsubscribeTopic();
      unsubscribeThread();
    };
  }, [navigate, options.getConversationPath, options.getTopicPath, setThread]);
};
