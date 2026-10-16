import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { WORKSPACE_LIST_KEY } from '@/business/client/hooks/useFetchWorkspaces';
import { toast } from '@/components/toast';
import { mutate, useClientDataSWR } from '@/libs/swr';

import { type InviteInput, teammatesService } from './client';
import type { ProjectRole, WorkspaceRole } from './contract';
import { teammatesKeys } from './keys';

const REFRESH_MEMBERS_AND_INVITATIONS = async () => {
  await Promise.all([mutate(teammatesKeys.members(false)), mutate(teammatesKeys.invitations())]);
};

const REFRESH_MEMBERS_AND_OWNERSHIP = async () => {
  // Accepting a transfer changes the caller's own workspace role — the
  // workspace list carries that role, so it must revalidate too.
  await Promise.all([
    mutate(teammatesKeys.members(false)),
    mutate(teammatesKeys.ownershipTransfer()),
    mutate(WORKSPACE_LIST_KEY),
  ]);
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
    teammatesService.workspaceMember.list({ includeDeleted }),
  );

  return { data, error, isLoading, members: data, mutate: revalidate };
};

/** Pending + lifecycle history of invitations for the active workspace. */
export const useWorkspaceInvitationsQuery = (options?: { enabled?: boolean }) => {
  const workspaceId = useActiveWorkspaceId();
  const enabled = options?.enabled ?? true;

  return useClientDataSWR(workspaceId && enabled ? teammatesKeys.invitations() : null, () =>
    teammatesService.workspaceMember.listInvitations(),
  );
};

/**
 * In-flight ownership hand-off visible to the caller — `null` for everyone
 * who is not the initiator or the invited member.
 */
export const usePendingOwnershipTransferQuery = (options?: { enabled?: boolean }) => {
  const workspaceId = useActiveWorkspaceId();
  const enabled = options?.enabled ?? true;

  const query = useClientDataSWR(
    workspaceId && enabled ? teammatesKeys.ownershipTransfer() : null,
    () => teammatesService.workspace.pendingOwnershipTransfer(),
    { refreshInterval: 30_000 },
  );

  // A resolved hand-off (pending → null) changes BOTH parties' roles and
  // roster rows, but only the clicker's own mutations revalidate those keys.
  // The other side only sees this poll tick to null — refresh the dependent
  // caches here so the previous owner doesn't sit on a stale owner badge.
  const hadPendingRef = useRef(false);
  const data = query.data;
  useEffect(() => {
    const hasPending = !!data;
    if (hadPendingRef.current && !hasPending) {
      void mutate(teammatesKeys.members(false));
      void mutate(WORKSPACE_LIST_KEY);
    }
    hadPendingRef.current = hasPending;
  }, [data]);

  return query;
};

/** Workspace-visible agent roster — read-only surface in v1. */
export const useWorkspaceAgentsQuery = (options?: { enabled?: boolean }) => {
  const workspaceId = useActiveWorkspaceId();
  const enabled = options?.enabled ?? true;

  return useClientDataSWR(workspaceId && enabled ? teammatesKeys.agents() : null, () =>
    teammatesService.workspaceAgent.list(),
  );
};

/** Member list of one project. */
export const useProjectMembersQuery = (projectId: string | undefined, enabled = true) =>
  useClientDataSWR(
    projectId && enabled ? teammatesKeys.projectMembers(projectId) : null,
    () => teammatesService.projectMember.list({ projectId: projectId! }),
    { revalidateOnFocus: false },
  );

/**
 * Impact preview for removing one member — only fetched while the confirm
 * dialog is open so the dialog's empty/loading states stay honest.
 */
export const useRemovalPreview = (userId: string | undefined, enabled: boolean) =>
  useClientDataSWR(
    userId && enabled ? teammatesKeys.removalPreview(userId) : null,
    () => teammatesService.workspaceMember.removalPreview({ userId: userId! }),
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
    (input: InviteInput) => teammatesService.workspaceMember.invite(input),
    [],
  );

  const changeRole = useCallback(
    (userId: string, role: WorkspaceRole, expectedAuthzVersion?: number) =>
      report(
        () => teammatesService.workspaceMember.changeRole({ expectedAuthzVersion, role, userId }),
        refreshMembers,
      ),
    [report, refreshMembers],
  );

  const suspend = useCallback(
    (userId: string) =>
      report(() => teammatesService.workspaceMember.suspend({ userId }), refreshMembers),
    [report, refreshMembers],
  );

  const resume = useCallback(
    (userId: string) =>
      report(() => teammatesService.workspaceMember.resume({ userId }), refreshMembers),
    [report, refreshMembers],
  );

  const remove = useCallback(
    (userId: string, reassignToUserId?: string) =>
      report(
        () => teammatesService.workspaceMember.remove({ reassignToUserId, userId }),
        REFRESH_MEMBERS_AND_INVITATIONS,
      ),
    [report],
  );

  const leave = useCallback(
    // No member-roster refresh here: the mutation removes the caller's own
    // membership, so re-querying the departed workspace's roster would fail
    // and flip a successful leave into a reported failure. Callers refresh
    // the workspace list and navigate out instead.
    () =>
      report(
        () => teammatesService.workspaceMember.leave(),
        () => Promise.resolve(),
      ),
    [report],
  );

  const refreshOwnershipTransfer = useCallback(() => mutate(teammatesKeys.ownershipTransfer()), []);

  const requestOwnershipTransfer = useCallback(
    (newOwnerUserId: string) =>
      report(
        () => teammatesService.workspace.transferOwnership({ newOwnerUserId }),
        refreshOwnershipTransfer,
      ),
    [report, refreshOwnershipTransfer],
  );

  const respondOwnershipTransfer = useCallback(
    (accept: boolean) =>
      report(
        () => teammatesService.workspace.respondOwnershipTransfer({ accept }),
        // Accepting changes the caller's own role — the members roster must
        // refresh alongside the cleared pending state.
        REFRESH_MEMBERS_AND_OWNERSHIP,
      ),
    [report],
  );

  const cancelOwnershipTransfer = useCallback(
    () =>
      report(() => teammatesService.workspace.cancelOwnershipTransfer(), refreshOwnershipTransfer),
    [report, refreshOwnershipTransfer],
  );

  const resendInvitation = useCallback(
    (invitationId: string) =>
      report(() => teammatesService.invitation.resend({ invitationId }), refreshInvitations),
    [report, refreshInvitations],
  );

  const revokeInvitation = useCallback(
    (invitationId: string) =>
      report(() => teammatesService.invitation.revoke({ invitationId }), refreshInvitations),
    [report, refreshInvitations],
  );

  const addProjectMember = useCallback(
    (projectId: string, userId: string, role: ProjectRole) =>
      report(
        () => teammatesService.projectMember.add({ projectId, role, userId }),
        () => refreshProjectMembers(projectId),
      ),
    [report, refreshProjectMembers],
  );

  const changeProjectMemberRole = useCallback(
    (projectId: string, userId: string, role: ProjectRole) =>
      report(
        () => teammatesService.projectMember.changeRole({ projectId, role, userId }),
        () => refreshProjectMembers(projectId),
      ),
    [report, refreshProjectMembers],
  );

  const removeProjectMember = useCallback(
    (projectId: string, userId: string) =>
      report(
        () => teammatesService.projectMember.remove({ projectId, userId }),
        () => refreshProjectMembers(projectId),
      ),
    [report, refreshProjectMembers],
  );

  return {
    addProjectMember,
    cancelOwnershipTransfer,
    changeProjectMemberRole,
    changeRole,
    invite,
    leave,
    mutating,
    remove,
    removeProjectMember,
    requestOwnershipTransfer,
    resendInvitation,
    respondOwnershipTransfer,
    resume,
    revokeInvitation,
    suspend,
  };
};
