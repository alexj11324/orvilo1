import { toast } from '@lobehub/ui/base-ui';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { mutate, useClientDataSWR } from '@/libs/swr';

import { type InviteInput, teammatesClient } from './client';
import type { ProjectRole, WorkspaceRole } from './contract';
import { teammatesKeys } from './keys';

const REFRESH_MEMBERS_AND_INVITATIONS = async () => {
  await Promise.all([mutate(teammatesKeys.members(false)), mutate(teammatesKeys.invitations())]);
};

/**
 * Workspace member list of the ACTIVE workspace. `useClientDataSWR` appends
 * the workspace id to the cache key, so switching workspaces yields a fresh
 * scoped entry instead of stale cross-tenant data.
 */
export const useWorkspaceMembersQuery = (options?: {
  enabled?: boolean;
  includeDeleted?: boolean;
}) => {
  const workspaceId = useActiveWorkspaceId();
  const enabled = options?.enabled ?? true;
  const includeDeleted = options?.includeDeleted ?? false;

  const {
    data,
    error,
    isLoading,
    mutate: revalidate,
  } = useClientDataSWR(workspaceId && enabled ? teammatesKeys.members(includeDeleted) : null, () =>
    teammatesClient.workspaceMember.list.query({ includeDeleted }),
  );

  return { data, error, isLoading, members: data, mutate: revalidate };
};

/** Pending + lifecycle history of invitations for the active workspace. */
export const useWorkspaceInvitationsQuery = (options?: { enabled?: boolean }) => {
  const workspaceId = useActiveWorkspaceId();
  const enabled = options?.enabled ?? true;

  return useClientDataSWR(workspaceId && enabled ? teammatesKeys.invitations() : null, () =>
    teammatesClient.workspaceMember.listInvitations.query(),
  );
};

/** Workspace-visible agent roster — read-only surface in v1. */
export const useWorkspaceAgentsQuery = (options?: { enabled?: boolean }) => {
  const workspaceId = useActiveWorkspaceId();
  const enabled = options?.enabled ?? true;

  return useClientDataSWR(workspaceId && enabled ? teammatesKeys.agents() : null, () =>
    teammatesClient.workspaceAgent.list.query(),
  );
};

/** Member list of one project. */
export const useProjectMembersQuery = (projectId: string | undefined, enabled = true) =>
  useClientDataSWR(
    projectId && enabled ? teammatesKeys.projectMembers(projectId) : null,
    () => teammatesClient.projectMember.list.query({ projectId: projectId! }),
    { revalidateOnFocus: false },
  );

/**
 * Impact preview for removing one member — only fetched while the confirm
 * dialog is open so the dialog's empty/loading states stay honest.
 */
export const useRemovalPreview = (userId: string | undefined, enabled: boolean) =>
  useClientDataSWR(
    userId && enabled ? teammatesKeys.removalPreview(userId) : null,
    () => teammatesClient.workspaceMember.removalPreview.query({ userId: userId! }),
    { revalidateOnFocus: false },
  );

/**
 * Mutation helpers shared by the members/invitations surfaces. Each reports
 * whether the call succeeded, surfaces the server error message, and
 * revalidates the scoped lists it can affect — callers branch on the boolean
 * instead of assuming a rejection never happened.
 */
export const useTeammateActions = () => {
  const { t } = useTranslation('setting');
  const [mutating, setMutating] = useState(false);

  const report = useCallback(
    async (action: () => Promise<unknown>, refresh: () => Promise<unknown>) => {
      setMutating(true);
      try {
        await action();
        await refresh();
        return true;
      } catch (e) {
        console.error('[Teammates]', e);
        toast.error((e as Error)?.message || t('workspaceSetting.members.actionFailed'));
        return false;
      } finally {
        setMutating(false);
      }
    },
    [t],
  );

  const refreshMembers = useCallback(() => mutate(teammatesKeys.members(false)), []);
  const refreshInvitations = useCallback(() => mutate(teammatesKeys.invitations()), []);
  const refreshProjectMembers = useCallback(
    (projectId: string) => mutate(teammatesKeys.projectMembers(projectId)),
    [],
  );

  const invite = useCallback(
    (input: InviteInput) => teammatesClient.workspaceMember.invite.mutate(input),
    [],
  );

  const changeRole = useCallback(
    (userId: string, role: WorkspaceRole, expectedAuthzVersion?: number) =>
      report(
        () =>
          teammatesClient.workspaceMember.changeRole.mutate({ expectedAuthzVersion, role, userId }),
        refreshMembers,
      ),
    [report, refreshMembers],
  );

  const suspend = useCallback(
    (userId: string) =>
      report(() => teammatesClient.workspaceMember.suspend.mutate({ userId }), refreshMembers),
    [report, refreshMembers],
  );

  const resume = useCallback(
    (userId: string) =>
      report(() => teammatesClient.workspaceMember.resume.mutate({ userId }), refreshMembers),
    [report, refreshMembers],
  );

  const remove = useCallback(
    (userId: string, reassignToUserId?: string) =>
      report(
        () => teammatesClient.workspaceMember.remove.mutate({ reassignToUserId, userId }),
        REFRESH_MEMBERS_AND_INVITATIONS,
      ),
    [report],
  );

  const leave = useCallback(
    () => report(() => teammatesClient.workspaceMember.leave.mutate(), refreshMembers),
    [report, refreshMembers],
  );

  const resendInvitation = useCallback(
    (invitationId: string) =>
      report(() => teammatesClient.invitation.resend.mutate({ invitationId }), refreshInvitations),
    [report, refreshInvitations],
  );

  const revokeInvitation = useCallback(
    (invitationId: string) =>
      report(() => teammatesClient.invitation.revoke.mutate({ invitationId }), refreshInvitations),
    [report, refreshInvitations],
  );

  const addProjectMember = useCallback(
    (projectId: string, userId: string, role: ProjectRole) =>
      report(
        () => teammatesClient.projectMember.add.mutate({ projectId, role, userId }),
        () => refreshProjectMembers(projectId),
      ),
    [report, refreshProjectMembers],
  );

  const changeProjectMemberRole = useCallback(
    (projectId: string, userId: string, role: ProjectRole) =>
      report(
        () => teammatesClient.projectMember.changeRole.mutate({ projectId, role, userId }),
        () => refreshProjectMembers(projectId),
      ),
    [report, refreshProjectMembers],
  );

  const removeProjectMember = useCallback(
    (projectId: string, userId: string) =>
      report(
        () => teammatesClient.projectMember.remove.mutate({ projectId, userId }),
        () => refreshProjectMembers(projectId),
      ),
    [report, refreshProjectMembers],
  );

  return {
    addProjectMember,
    changeProjectMemberRole,
    changeRole,
    invite,
    leave,
    mutating,
    remove,
    removeProjectMember,
    resendInvitation,
    resume,
    revokeInvitation,
    suspend,
  };
};
