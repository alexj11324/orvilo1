import type { TeamMemberItem } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import type { WorkspaceMemberSummary } from '../../Teammates/api/contract';
import { resolveTeamHomeMembers, teamMemberDisplayName } from './teamHomeMembers';

const teamMember = (userId: string, role: 'lead' | 'member' = 'member'): TeamMemberItem => ({
  id: `tm-${userId}`,
  joinedAt: new Date('2026-09-01T00:00:00Z'),
  role,
  teamId: 'team-42',
  userId,
  workspaceId: 'ws-1',
});

const profile = (userId: string, user: WorkspaceMemberSummary['user']): WorkspaceMemberSummary => ({
  role: 'member',
  user,
  userId,
});

describe('teamMemberDisplayName', () => {
  it('falls back fullName → username → email → userId', () => {
    expect(
      teamMemberDisplayName(
        profile('u1', { avatar: null, email: 'e@x.dev', fullName: 'Full', username: 'user' }),
      ),
    ).toBe('Full');
    expect(
      teamMemberDisplayName(
        profile('u1', { avatar: null, email: 'e@x.dev', fullName: null, username: 'user' }),
      ),
    ).toBe('user');
    expect(
      teamMemberDisplayName(
        profile('u1', { avatar: null, email: 'e@x.dev', fullName: null, username: null }),
      ),
    ).toBe('e@x.dev');
    expect(
      teamMemberDisplayName(
        profile('u1', { avatar: null, email: null, fullName: null, username: null }),
      ),
    ).toBe('u1');
    expect(teamMemberDisplayName(profile('u1', null))).toBe('u1');
  });
});

describe('resolveTeamHomeMembers', () => {
  const ws = [
    profile('u-lead', {
      avatar: 'a.png',
      email: 'lead@x.dev',
      fullName: 'Zed Lead',
      username: 'zed',
    }),
    profile('u-ann', { avatar: null, email: 'ann@x.dev', fullName: 'Ann Member', username: 'ann' }),
    profile('u-bob', { avatar: null, email: 'bob@x.dev', fullName: 'bob member', username: 'bob' }),
  ];

  it('joins team membership with profiles and sorts lead-first then by name', () => {
    const rows = resolveTeamHomeMembers(
      [teamMember('u-ann'), teamMember('u-bob'), teamMember('u-lead', 'lead')],
      ws,
    );
    expect(rows.map((row) => row.userId)).toEqual(['u-lead', 'u-ann', 'u-bob']);
    expect(rows[0]).toMatchObject({
      avatar: 'a.png',
      email: 'lead@x.dev',
      name: 'Zed Lead',
      role: 'lead',
    });
    expect(rows[1].name).toBe('Ann Member');
    expect(rows[2].name).toBe('bob member');
  });

  it('drops members with no resolvable workspace profile', () => {
    const rows = resolveTeamHomeMembers([teamMember('u-ghost'), teamMember('u-ann')], ws);
    expect(rows.map((row) => row.userId)).toEqual(['u-ann']);
  });

  it('returns an empty list for an empty roster', () => {
    expect(resolveTeamHomeMembers([], ws)).toEqual([]);
    expect(resolveTeamHomeMembers([teamMember('u-ann')], [])).toEqual([]);
  });
});
