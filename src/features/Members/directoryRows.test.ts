import { describe, expect, it } from 'vitest';

import type {
  WorkspaceAgentSummary,
  WorkspaceInvitationSummary,
  WorkspaceMemberSummary,
} from '../Teammates/api/contract';
import {
  buildDirectoryRows,
  DIRECTORY_SECTION_ORDER,
  directorySectionKey,
  filterDirectoryRows,
} from './directoryRows';

const member: WorkspaceMemberSummary = {
  joinedAt: '2024-01-02T00:00:00.000Z',
  role: 'admin',
  user: {
    avatar: null,
    email: 'ada@example.com',
    fullName: 'Ada Lovelace',
    username: 'ada',
  },
  userId: 'user-1',
};

const agent: WorkspaceAgentSummary = {
  id: 'agent-1',
  name: 'Scout',
  status: 'active',
};

const pendingInvitation: WorkspaceInvitationSummary = {
  createdAt: '2024-02-01T00:00:00.000Z',
  email: 'grace@example.com',
  expiresAt: '2024-03-01T00:00:00.000Z',
  id: 'inv-1',
  inviter: null,
  projects: [],
  role: 'member',
  status: 'pending',
};

const acceptedInvitation: WorkspaceInvitationSummary = {
  ...pendingInvitation,
  id: 'inv-2',
  status: 'accepted',
};

describe('buildDirectoryRows', () => {
  it('keeps every identity under its real kind (UI01)', () => {
    const rows = buildDirectoryRows([member], [agent], [pendingInvitation]);

    // Execution agents are agents — never "applications" (the type union
    // no longer even admits that kind).
    expect(rows.map((row) => row.kind).sort()).toEqual(['agent', 'invitation', 'person']);
  });

  it('drops settled invitations so members are not double-counted', () => {
    const rows = buildDirectoryRows([member], [], [acceptedInvitation, pendingInvitation]);

    expect(rows.filter((row) => row.kind === 'invitation')).toHaveLength(1);
    expect(rows.find((row) => row.id === 'invitation:inv-2')).toBeUndefined();
  });

  it('sorts rows by name across sources', () => {
    const rows = buildDirectoryRows([member], [agent], [pendingInvitation]);

    expect(rows.map((row) => row.sortName)).toEqual([...rows.map((r) => r.sortName)].sort());
  });
});

describe('filterDirectoryRows', () => {
  const rows = buildDirectoryRows([member], [agent], [pendingInvitation]);

  it('filters by group kind', () => {
    expect(filterDirectoryRows(rows, '', 'agent')).toEqual([rows.find((r) => r.kind === 'agent')]);
    expect(filterDirectoryRows(rows, '', 'all')).toHaveLength(3);
  });

  it('searches email and username for people, not just the display name', () => {
    expect(filterDirectoryRows(rows, 'ada@example.com', 'all')).toHaveLength(1);
    expect(filterDirectoryRows(rows, 'nobody-matches-this', 'all')).toHaveLength(0);
  });
});

describe('directorySectionKey', () => {
  const rows = buildDirectoryRows([member], [agent], [pendingInvitation]);

  it('bands the directory by lifecycle state like the reference', () => {
    expect(directorySectionKey(rows.find((r) => r.kind === 'person')!)).toBe('active');
    expect(directorySectionKey(rows.find((r) => r.kind === 'invitation')!)).toBe('invited');
    expect(directorySectionKey(rows.find((r) => r.kind === 'agent')!)).toBe('agent');
  });

  it('splits suspended and removed people out of the active band', () => {
    const suspended = buildDirectoryRows([{ ...member, suspendedAt: '2024-03-01T00:00:00.000Z' }]);
    const removed = buildDirectoryRows([{ ...member, deletedAt: new Date() }]);

    expect(directorySectionKey(suspended[0])).toBe('suspended');
    expect(directorySectionKey(removed[0])).toBe('removed');
  });

  it('orders bands Active → Suspended → Invited → Agents like the reference', () => {
    expect(DIRECTORY_SECTION_ORDER.slice(0, 4)).toEqual([
      'active',
      'suspended',
      'invited',
      'agent',
    ]);
  });
});
