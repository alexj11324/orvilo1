'use client';

import type { AgentTopicSharePolicy } from '@orvilo/types';

import { useAgentTopicSharing } from '@/features/ResourcePermission/useAgentTopicSharing';
import { useResourcePermission } from '@/features/ResourcePermission/useResourcePermission';
import type { ResourceAccessLevel } from '@/services/resourcePermission';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

export interface AgentPermissionState {
  accessError: unknown;
  accessLevel?: ResourceAccessLevel;
  accessLoading: boolean;
  /** Only the writable creator or workspace Owner/Admin may change policies. */
  canEditConfig: boolean;
  /** Whether the viewer may change topic sharing. */
  canEditPolicies: boolean;
  /** Only the writable creator or workspace Owner/Admin may manage members. */
  canManageAccess: boolean;
  isPrivate: boolean;
  isWorkspaceAgent: boolean;
  retryAccess: () => void;
  setAccessLevel: (level: ResourceAccessLevel) => void;
  setTopicSharePolicy: (policy: AgentTopicSharePolicy) => void;
  /** Whether members may publish share links for the topics held here. */
  topicSharePolicy: AgentTopicSharePolicy;
}

/** Resource access and topic sharing for this permission page. */
export const useAgentPermission = (agentId: string): AgentPermissionState => {
  const agent = useAgentStore(agentByIdSelectors.getAgentById(agentId));

  const isWorkspaceAgent = !!agent?.workspaceId;
  const isPrivate = agent?.visibility === 'private';

  const {
    data: access,
    error: accessError,
    isLoading: accessLoading,
    mutate: retryAccess,
    // Settable while private too: the server stores the level and the publish
    // paths read it back, so it is the same configure-ahead-of-sharing promise
    // the policies below make.
    setAccessLevel,
  } = useResourcePermission('agent', isWorkspaceAgent ? agentId : undefined);

  const policies = useAgentTopicSharing(agentId);

  return {
    ...policies,
    accessError,
    accessLevel: access?.accessLevel,
    accessLoading,
    canEditConfig: isWorkspaceAgent ? access?.canManage === true : policies.canEditPolicies,
    canManageAccess: isWorkspaceAgent && access?.canManage === true,
    isPrivate,
    isWorkspaceAgent,
    retryAccess: () => void retryAccess(),
    setAccessLevel: (level) => void setAccessLevel(level),
  };
};
