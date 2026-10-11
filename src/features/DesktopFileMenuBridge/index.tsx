'use client';

import { AGENT_CHAT_URL } from '@orvilo/const';
import { useWatchBroadcast } from '@orvilo/electron-client-ipc';
import { useCallback } from 'react';

import { useFallbackAgentId } from '@/features/DefaultAgent/useFallbackAgentId';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useAgentStore } from '@/store/agent';
import { useChatStore } from '@/store/chat';

/**
 * Bridge component for handling File menu actions from Electron main process
 * Listens to the native conversation action; Agent and Group creation belong to their pages.
 */
const DesktopFileMenuBridge = () => {
  const navigate = useWorkspaceAwareNavigate();
  const fallbackAgentId = useFallbackAgentId();
  const activeAgentId = useAgentStore((s) => s.activeAgentId);

  // Handle create new topic from File menu
  // If currently in an agent page, clear the active topic via the store —
  // navigating to the same path won't clear `activeTopicId` because
  // ChatHydration's URL→store updater skips `undefined` values.
  // If not in an agent page, navigate to the fallback agent.
  const handleCreateNewTopic = useCallback(() => {
    if (activeAgentId) {
      useChatStore.getState().switchTopic(null);
      return;
    }
    if (fallbackAgentId) navigate(AGENT_CHAT_URL(fallbackAgentId, false));
  }, [activeAgentId, fallbackAgentId, navigate]);

  useWatchBroadcast('createNewTopic', handleCreateNewTopic);

  return null;
};

export default DesktopFileMenuBridge;
