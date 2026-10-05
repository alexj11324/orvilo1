import { AGENT_CHAT_URL } from '@orvilo/const';

import { stableWorkspaceAwareNavigate } from '@/features/Workspace/stableWorkspaceAwareNavigate';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';

/**
 * The single explicit "select agent" action
 * (docs/development/device-execution-contract.md — create flow section).
 *
 * An explicit user pick is one of the three write points for
 * `lastUsedAgentId` (pick / send / handoff). Every flow that lands the user on
 * an agent — composer pick, one-click create, Settings — must go through this
 * instead of writing `composerAgentId` / `lastUsedAgentId` directly, so the
 * semantics can never fork again.
 */
export const selectAgentForConversation = (agentId: string) => {
  // The pending picks belong to the agent they were taken for: switching agents
  // invalidates them, or the new conversation would bind a model/effort its
  // harness does not serve (docs/development/chat-agent-model-ia.md §10).
  useChatStore.setState(
    {
      composerAgentId: agentId,
      composerHeteroEffort: undefined,
      composerModelSelection: undefined,
    },
    false,
    'selectAgent/explicit',
  );
  useGlobalStore.getState().updateSystemStatus({ lastUsedAgentId: agentId });
};

/**
 * Open a blank conversation on `agentId` — the unified navigation helper for
 * "new conversation" entries. Callers pass the agent explicitly (the one-click
 * create flow selects the fresh agent; nothing else reads `lastUsedAgentId`
 * here — background list churn never gets to decide).
 *
 * The destination is intentionally a single point: when the canonical
 * conversation route changes (`/chat/new`), this helper flips and every entry
 * follows without hard-coded URLs.
 */
export const openNewConversation = ({ agentId }: { agentId: string }) => {
  selectAgentForConversation(agentId);
  stableWorkspaceAwareNavigate(AGENT_CHAT_URL(agentId));
};
