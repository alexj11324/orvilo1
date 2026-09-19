import { useCallback } from 'react';

import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';

/**
 * Opens an acceptance in the panel beside the task — the destination the
 * checklist and run tags already use.
 *
 * Deliberately not a route change: the standalone `/acceptance/:id` page is a
 * public, workspace-less route. It stays a panel so the current surface keeps
 * its context — there is no personal scope for the URL sync to fall back to.
 */
export const useOpenAcceptanceInPanel = () => {
  const openAcceptance = useChatStore((state) => state.openAcceptance);
  const showTaskAgentPanel = useGlobalStore((state) => state.toggleTaskAgentPanel);

  return useCallback(
    (acceptanceId: string) => {
      showTaskAgentPanel(true);
      openAcceptance(acceptanceId);
    },
    [openAcceptance, showTaskAgentPanel],
  );
};
