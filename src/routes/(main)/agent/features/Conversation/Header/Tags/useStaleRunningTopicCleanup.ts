import { useEffect } from 'react';

import { useChatStore } from '@/store/chat';

/**
 * Backstop for a tab that died mid-run and left its topic `running`. It used to
 * ride on the topic sidebar's first expand; the conversation header is the
 * surface mounted on every agent page now, so it retires them once per mount.
 */
export const useStaleRunningTopicCleanup = () => {
  const cleanupStaleRunningTopics = useChatStore((s) => s.cleanupStaleRunningTopics);

  useEffect(() => {
    void cleanupStaleRunningTopics();
  }, [cleanupStaleRunningTopics]);
};
