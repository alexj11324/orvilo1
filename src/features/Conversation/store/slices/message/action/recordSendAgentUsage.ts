import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';

/**
 * Record the agent a send ran under as the default for the next new topic
 * (`lastUsedAgentId`), and consume the composer pick that drove this send.
 *
 * Agent contexts only — a group send must never pin the supervisor as the
 * personal default. This is one of the three `lastUsedAgentId` write points
 * (explicit pick / send / handoff); background work — inbox churn, run
 * completions, feed reorders — never reaches this path.
 */
export const recordSendAgentUsage = (context: {
  agentId?: string | null;
  groupId?: string | null;
}): void => {
  if (!context.agentId || context.groupId) return;

  useGlobalStore.getState().updateSystemStatus({ lastUsedAgentId: context.agentId });
  if (useChatStore.getState().composerAgentId) {
    useChatStore.setState({ composerAgentId: undefined }, false, 'composerAgent/consumed');
  }
};
