'use client';

import type { AgentTopicSharePolicy } from '@orvilo/types';

import { useAgentTopicSharing } from '@/features/ResourcePermission/useAgentTopicSharing';
import { useResourcePermission } from '@/features/ResourcePermission/useResourcePermission';
import { usePermission } from '@/hooks/usePermission';
import type { ResourceAccessLevel } from '@/services/resourcePermission';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

export interface GroupPermissionState {
  accessError: unknown;
  accessLevel?: ResourceAccessLevel;
  accessLoading: boolean;
  /** Role-level gate for the model / execution-environment policies. */
  canEditConfig: boolean;
  /** Whether the viewer may change topic sharing. */
  canEditPolicies: boolean;
  /** Only the creator or a workspace owner may re-level members. */
  canManageAccess: boolean;
  /** No supervisor row yet — the Editable settings have nothing to write to. */
  hasSupervisor: boolean;
  isPrivate: boolean;
  isWorkspaceGroup: boolean;
  retryAccess: () => void;
  setAccessLevel: (level: ResourceAccessLevel) => void;
  setTopicSharePolicy: (policy: AgentTopicSharePolicy) => void;
  /** Whether members may publish share links for the topics held here. */
  topicSharePolicy: AgentTopicSharePolicy;
}

/** Resource access and topic sharing for this permission page. */
export const useGroupPermission = (groupId: string): GroupPermissionState => {
  const { allowed: canEditContent } = usePermission('edit_own_content');
  const group = useAgentGroupStore(agentGroupSelectors.getGroupById(groupId));

  const isWorkspaceGroup = !!group?.workspaceId;
  const isPrivate = group?.visibility === 'private';
  const supervisorAgentId = group?.supervisorAgentId;

  const {
    data: access,
    error: accessError,
    isLoading: accessLoading,
    mutate: retryAccess,
    // Settable while private too: the server stores the level and the publish
    // path reads it back, so the creator can decide ahead of sharing.
    setAccessLevel,
  } = useResourcePermission('agentGroup', isWorkspaceGroup ? groupId : undefined);

  const policies = useAgentTopicSharing(supervisorAgentId ?? '');

  return {
    ...policies,
    accessError,
    accessLevel: access?.accessLevel,
    accessLoading,
    canEditConfig: canEditContent,
    canManageAccess: access?.canManage === true,
    hasSupervisor: !!supervisorAgentId,
    isPrivate,
    isWorkspaceGroup,
    retryAccess: () => void retryAccess(),
    setAccessLevel: (level) => void setAccessLevel(level),
  };
};
