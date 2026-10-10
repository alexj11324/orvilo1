import { useMemo } from 'react';
import { useLocation } from 'react-router';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAgentStore } from '@/store/agent';
import { ChatSettingsTabs } from '@/store/global/initialState';

export const useOpenChatSettings = (tab: ChatSettingsTabs = ChatSettingsTabs.Connector) => {
  const activeAgentId = useAgentStore((s) => s.activeAgentId);

  const isMobile = useIsMobile();
  const navigate = useWorkspaceAwareNavigate();
  const location = useLocation();

  return useMemo(() => {
    if (isMobile)
      return () => navigate(`/agent/${activeAgentId}/settings?showMobileWorkspace=true`);

    // Settings → Agents is the per-agent config home — "Open Agent settings"
    // lands on the agent's settings page rather than a work-surface modal.
    return () => navigate(`/settings/agents/${activeAgentId}`);
  }, [activeAgentId, navigate, location.pathname, tab, isMobile]);
};
