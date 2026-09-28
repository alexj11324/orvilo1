import type { TeamMemberItem, TeamMembershipRole } from '@orvilo/types';

import type { WorkspaceMemberSummary } from '../../Teammates/api/contract';

/**
 * One rendered member row — the team membership joined with the workspace
 * profile the row displays. `joinedAt` stays the raw team-membership value;
 * formatting is a render concern (`toLocaleDateString`, same as MembersPanel).
 */
export interface TeamHomeMember {
  avatar: string | null;
  email: string | null;
  joinedAt: Date | null;
  name: string;
  role: TeamMembershipRole;
  userId: string;
}

/** Same fallback chain the members rail and MembersPanel already use. */
export const teamMemberDisplayName = (member: WorkspaceMemberSummary): string =>
  member.user?.fullName || member.user?.username || member.user?.email || member.userId;

/**
 * Join `team_members` rows to the workspace roster and order for display:
 * leads first, then case-insensitive name, `userId` as the deterministic tie
 * break. Members whose workspace profile cannot be resolved are dropped —
 * showing a bare userId would leak nothing useful, and the join only misses
 * for suspended/removed profiles the roster already hides.
 */
export const resolveTeamHomeMembers = (
  teamMembers: TeamMemberItem[],
  workspaceMembers: WorkspaceMemberSummary[],
): TeamHomeMember[] => {
  const profileByUserId = new Map(workspaceMembers.map((member) => [member.userId, member]));
  const rows: TeamHomeMember[] = [];

  for (const member of teamMembers) {
    const profile = profileByUserId.get(member.userId);
    if (!profile) continue;
    rows.push({
      avatar: profile.user?.avatar ?? null,
      email: profile.user?.email ?? null,
      joinedAt: member.joinedAt,
      name: teamMemberDisplayName(profile),
      role: member.role,
      userId: member.userId,
    });
  }

  return rows.sort(
    (a, b) =>
      Number(b.role === 'lead') - Number(a.role === 'lead') ||
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
      a.userId.localeCompare(b.userId),
  );
};
