'use client';

import { useAgentStore } from '@/store/agent';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { useChatInputStore } from '../store';

/**
 * Hook to get the effective agentId for ChatInput components.
 * Returns agentId from ChatInput store if provided (including empty string),
 * otherwise falls back to the agent this composer would bind.
 *
 * Note: Empty string is a valid value (e.g., when Group's supervisorAgentId is not loaded yet),
 * so we only fallback when agentId is undefined (not provided).
 *
 * Blank composer (no active topic): the composer's explicit pick
 * (`composerAgentId`) wins, then the agent the user's last send ran under —
 * a new topic binds its agent on first message, so the default follows the
 * last-used agent rather than the route agent. An open topic always shows its
 * room's bound agent (the route agent).
 */
export const useAgentId = () => {
  const agentIdFromChatInput = useChatInputStore((s) => s.agentId);
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const [activeTopicId, composerAgentId] = useChatStore((s) => [
    s.activeTopicId,
    s.composerAgentId,
  ]);
  const lastUsedAgentId = useGlobalStore(systemStatusSelectors.lastUsedAgentId);

  // Only fallback to activeAgentId when agentIdFromChatInput is undefined (not provided)
  // Empty string is a valid value and should NOT trigger fallback
  if (agentIdFromChatInput !== undefined) return agentIdFromChatInput;
  if (!activeTopicId) return composerAgentId || lastUsedAgentId || activeAgentId || '';
  return activeAgentId || '';
};
