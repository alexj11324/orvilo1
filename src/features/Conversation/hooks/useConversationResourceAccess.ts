'use client';

import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { useChatStore } from '@/store/chat';

import { useConversationStore } from '../store';

interface ConversationResourceTarget {
  agentId?: string | null;
  groupId?: string | null;
}

const useConversationResourceAccessForTarget = ({
  agentId,
  groupId,
}: ConversationResourceTarget) => {
  const isGroupContext = !!groupId;

  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const group = useAgentGroupStore((s) =>
    groupId ? agentGroupSelectors.getGroupById(groupId)(s) : undefined,
  );

  const gatedAgentId = agentId && agentId !== inboxAgentId ? agentId : undefined;
  const gatedGroupId = group?.visibility === 'private' ? undefined : (groupId ?? undefined);

  const { allowed: canCreateContent } = usePermission('create_content');
  const agentAccess = useResourceAccess('agent', gatedAgentId);
  const groupAccess = useResourceAccess('agentGroup', gatedGroupId);

  return {
    // A group ceiling does not substitute for the target Agent's Use member list.
    canUseResource: canCreateContent && agentAccess.canUseResource && groupAccess.canUseResource,
    isAccessLoading: agentAccess.isLoading || groupAccess.isLoading,
    isGroupContext,
  };
};

/**
 * Per-resource General-access gating for the CURRENT conversation, resolved
 * from the ConversationStore context (the agent, or the group for group
 * conversations). The counterpart of `useChatInputResourceAccess` for
 * surfaces that live outside the ChatInput store tree — message actions,
 * intervention approvals, queue tray, URL/forward auto-send dispatchers.
 *
 * Workspace topics are shared across members, so a `view`-level member can
 * open a teammate's conversation — every mutating affordance must check
 * `canUseResource` before firing. Inbox resources are never
 * gated; loading defaults permissive (`isAccessLoading` lets auto-send
 * dispatchers wait for the settled value instead).
 */
export const useConversationResourceAccess = () => {
  const [agentId, groupId] = useConversationStore((s) => [s.context?.agentId, s.context?.groupId]);
  return useConversationResourceAccessForTarget({ agentId, groupId });
};

/**
 * Resource gating for surfaces that render beside, rather than inside, the
 * active ConversationProvider (for example the Portal pane). The global chat
 * store owns the same active agent/group coordinates used to build the main
 * conversation context, so these siblings can resolve access without touching
 * the provider-scoped ConversationStore.
 */
export const useActiveConversationResourceAccess = () => {
  const [agentId, groupId] = useChatStore((s) => [s.activeAgentId, s.activeGroupId]);
  return useConversationResourceAccessForTarget({ agentId, groupId });
};
