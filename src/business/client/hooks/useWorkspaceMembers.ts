import { useEffect } from 'react';

import type { WorkspaceMemberSummary } from '@/features/Teammates/api/contract';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';

import { getWorkspaceContextState } from '../workspaceContextStore';
import { useActiveWorkspaceId } from './useActiveWorkspaceId';

export interface WorkspaceMemberUserProfile {
  avatar?: string | null;
  email?: string | null;
  fullName?: string | null;
  username?: string | null;
}

/**
 * Membership row enriched with the member's display profile — the real
 * `workspaceMember.list` response, scoped to the active workspace through
 * `useClientDataSWR`. Personal mode returns the empty roster.
 */
export type WorkspaceMemberWithProfile = WorkspaceMemberSummary;

const EMPTY: WorkspaceMemberWithProfile[] = [];

/**
 * Latest roster snapshot mirrored for imperative callers, stamped with the
 * workspace it belongs to. `useWorkspaceMembers` is the writer — a consumer
 * that only calls `getWorkspaceMembers` without any mounted hook still sees
 * the last snapshot (or the empty roster before the first fetch), matching
 * the previous stub's read semantics. The workspace stamp is what keeps a
 * stale snapshot from leaking across a workspace switch on routes where no
 * roster hook is mounted.
 */
let latestMembers: {
  members: WorkspaceMemberWithProfile[];
  workspaceId: null | string;
} = { members: EMPTY, workspaceId: null };

export const useWorkspaceMembers = (): WorkspaceMemberWithProfile[] => {
  const workspaceId = useActiveWorkspaceId();
  const { data } = useWorkspaceMembersQuery();
  const members = data ?? EMPTY;

  useEffect(() => {
    latestMembers = { members, workspaceId };
  }, [workspaceId, members]);

  return members;
};

/**
 * Non-hook snapshot of the same list, for imperative callers such as tool
 * executors. Returns the most recent roster observed by a mounted
 * `useWorkspaceMembers` for the CURRENT active workspace; empty when none has
 * resolved yet or the snapshot belongs to a different scope.
 */
export const getWorkspaceMembers = (): WorkspaceMemberWithProfile[] =>
  latestMembers.workspaceId === getWorkspaceContextState().activeWorkspaceId
    ? latestMembers.members
    : EMPTY;
