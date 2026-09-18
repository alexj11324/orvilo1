import { useEffect } from 'react';

import type { WorkspaceMemberSummary } from '@/features/Teammates/api/contract';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';

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
 * Latest roster snapshot mirrored for imperative callers. `useWorkspaceMembers`
 * is the writer — a consumer that only calls `getWorkspaceMembers` without any
 * mounted hook still sees the last snapshot (or the empty roster before the
 * first fetch), matching the previous stub's read semantics.
 */
let latestMembers: WorkspaceMemberWithProfile[] = EMPTY;

export const useWorkspaceMembers = (): WorkspaceMemberWithProfile[] => {
  const { data } = useWorkspaceMembersQuery();
  const members = data ?? EMPTY;

  useEffect(() => {
    latestMembers = members;
  }, [members]);

  return members;
};

/**
 * Non-hook snapshot of the same list, for imperative callers such as tool
 * executors. Returns the most recent roster observed by a mounted
 * `useWorkspaceMembers`; empty when none has resolved yet.
 */
export const getWorkspaceMembers = (): WorkspaceMemberWithProfile[] => latestMembers;
