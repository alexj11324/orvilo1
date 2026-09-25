import type {
  WorkspaceAgentSummary,
  WorkspaceInvitationSummary,
  WorkspaceMemberSummary,
} from '../Teammates/api/contract';
import { memberStatus } from '../Teammates/api/roleCapabilities';

export type DirectoryRow =
  | { id: string; kind: 'agent'; sortName: string; value: WorkspaceAgentSummary }
  | { id: string; kind: 'invitation'; sortName: string; value: WorkspaceInvitationSummary }
  | { id: string; kind: 'person'; sortName: string; value: WorkspaceMemberSummary };

export type DirectoryFilter = 'agent' | 'all' | 'invitation' | 'person';

const normalize = (value: string | null | undefined) => (value ?? '').toLowerCase();

/**
 * Flattens the three identity sources into one sorted row list. Workspace
 * agents are execution agents — kind `agent`, never `application`; there is
 * no real applications source, so no applications rows exist. Settled
 * invitations (accepted/revoked) are excluded — the member row already
 * covers them.
 */
export const buildDirectoryRows = (
  members: WorkspaceMemberSummary[] | undefined,
  agents: WorkspaceAgentSummary[] | undefined,
  invitations: WorkspaceInvitationSummary[] | undefined,
): DirectoryRow[] => {
  const rows: DirectoryRow[] = [];
  for (const member of members ?? []) {
    rows.push({
      id: `person:${member.userId}`,
      kind: 'person',
      sortName: normalize(member.user?.fullName || member.user?.username || member.user?.email),
      value: member,
    });
  }
  for (const agent of agents ?? []) {
    rows.push({
      id: `agent:${agent.id}`,
      kind: 'agent',
      sortName: normalize(agent.name),
      value: agent,
    });
  }
  for (const invitation of invitations ?? []) {
    if (invitation.status === 'accepted' || invitation.status === 'revoked') continue;
    rows.push({
      id: `invitation:${invitation.id}`,
      kind: 'invitation',
      sortName: normalize(invitation.email),
      value: invitation,
    });
  }
  return rows.sort((a, b) => a.sortName.localeCompare(b.sortName));
};

/** Search matches name/email/username for people; name for the rest. */
export const filterDirectoryRows = (
  rows: DirectoryRow[],
  query: string,
  groupFilter: DirectoryFilter,
): DirectoryRow[] => {
  const needle = normalize(query).trim();
  return rows.filter((row) => {
    if (groupFilter !== 'all' && row.kind !== groupFilter) return false;
    if (!needle) return true;
    const haystack =
      row.kind === 'person'
        ? normalize(row.value.user?.email) + normalize(row.value.user?.username)
        : '';
    return row.sortName.includes(needle) || haystack.includes(needle);
  });
};

/**
 * Band the directory renders each row under. The reference groups by member
 * lifecycle state — Active / Invited / Application — not by data source, so
 * people split by `memberStatus` while invitations and agents keep their own
 * bands. `removed` is unreachable today (`includeDeleted: false`) but keeps a
 * real band at the end instead of silently re-bucketing a deleted member.
 */
export type DirectorySection = 'active' | 'agent' | 'invited' | 'removed' | 'suspended';

export const DIRECTORY_SECTION_ORDER: readonly DirectorySection[] = [
  'active',
  'suspended',
  'invited',
  'agent',
  'removed',
];

export const directorySectionKey = (row: DirectoryRow): DirectorySection => {
  if (row.kind === 'person') return memberStatus(row.value);
  if (row.kind === 'invitation') return 'invited';
  return 'agent';
};
