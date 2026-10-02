'use client';

import { type FC, memo, type PropsWithChildren, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import NotFound from '@/components/404';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

/**
 * Transient 404 card shown while the stale-topic redirect resolves — a
 * conversation whose by-id detail fetch settled on `null` was deleted or the
 * viewer lost access.
 */
export const TopicNotFound = memo(() => {
  const { t } = useTranslation('chat');

  return <NotFound hideWatermark desc={t('topicNotFound.desc')} title={t('topicNotFound.title')} />;
});

TopicNotFound.displayName = 'TopicNotFound';

/**
 * Terminal handling for a conversation that is gone: evicts the stale topic
 * from every local cache (list buckets, detail map, IndexedDB messages), then
 * falls back to the conversation list — the mobile 会话 tab on mobile, the
 * owning agent's list on desktop. The card only ever paints a frame while
 * the redirect resolves.
 */
export const TopicNotFoundRedirect: FC<{ topicId?: string }> = memo(({ topicId }) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  useLayoutEffect(() => {
    if (topicId) useChatStore.getState().evictStaleTopic(topicId);
    navigate(isMobile ? '/' : '..', { replace: true });
  }, [topicId, isMobile, navigate]);

  return <TopicNotFound />;
});

TopicNotFoundRedirect.displayName = 'TopicNotFoundRedirect';

/**
 * Replaces children with the evict + redirect flow when the routed topic
 * (`:topicId`) resolved to not-found / no-access. The guard probes the by-id
 * detail fetch itself whenever the topic isn't already in a list bucket or
 * the detail cache — the sidebar/header fallback fetch only runs once a
 * topic list bucket loaded, which surfaces without a topic list (the mobile
 * chat page) never do — so a `null` settle here is authoritative for every
 * layout that mounts the guard. The flag clears on any later successful
 * detail fetch, so the guard recovers without a manual refresh.
 */
export const TopicNotFoundGuard: FC<PropsWithChildren> = memo(({ children }) => {
  const params = useParams<{ topicId?: string }>();
  const useFetchTopicDetail = useChatStore((s) => s.useFetchTopicDetail);
  const isNotFound = useChatStore(topicSelectors.isTopicNotFoundById(params.topicId));
  // Only probe when the routed topic isn't already resolvable — list buckets
  // and the detail cache prove it exists, so those openings cost no request.
  const topicKnown = useChatStore(
    (s) => !!params.topicId && !!topicSelectors.getTopicById(params.topicId)(s),
  );

  useFetchTopicDetail(params.topicId && !topicKnown ? params.topicId : undefined);

  if (isNotFound) return <TopicNotFoundRedirect topicId={params.topicId} />;

  return children;
});

TopicNotFoundGuard.displayName = 'TopicNotFoundGuard';
