import { useEffect } from 'react';

import { useHasActiveWorkspace } from '@/business/client/hooks/useHasActiveWorkspace';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { rememberAgentManagementAccess } from '@/helpers/agentManagementAccess';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

/**
 * Resolve whether the current caller manages an Agent rather than merely
 * editing or using it through Workspace Member Permissions.
 *
 * Authors and Workspace admins (`canManage`) configure the shared Agent row;
 * ordinary members use the Agent's member-selection policy even when General
 * access grants them edit capability.
 */
export const useAgentManagementAccess = (agentId?: string) => {
  const agent = useAgentStore((s) =>
    agentId ? agentByIdSelectors.getAgentById(agentId)(s) : undefined,
  );
  const isAgentLoading = !!agentId && !agent;
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const hasActiveWorkspace = useHasActiveWorkspace();
  const isWorkspaceAgent = !!agent?.workspaceId && hasActiveWorkspace;
  const isPersonalOwner = !!currentUserId && agent?.userId === currentUserId;
  const { allowed: canEditContent } = usePermission('edit_own_content');
  const { canManageResource, isAccessResolved, isLoading } = useResourceAccess(
    'agent',
    isWorkspaceAgent ? agentId : undefined,
  );

  const canManageAgent =
    !isAgentLoading &&
    canEditContent &&
    (isWorkspaceAgent ? isAccessResolved && canManageResource : isPersonalOwner);
  const isAccessLoading = isAgentLoading || (isWorkspaceAgent && (isLoading || !isAccessResolved));

  // Publish every resolved answer for the runtime resolvers (store actions
  // can't run this hook) so send/regenerate route with the same
  // manager-vs-member decision the picker rendered.
  useEffect(() => {
    if (!agentId || !currentUserId || isAccessLoading) return;
    rememberAgentManagementAccess(currentUserId, agentId, canManageAgent);
  }, [agentId, currentUserId, canManageAgent, isAccessLoading]);

  return { canManageAgent, isAccessLoading };
};
