import { describe, expect, it } from 'vitest';

import {
  canGrantRole,
  canInviteMembers,
  canInviteToProject,
  canManageMember,
  canRequestOwnershipTransfer,
  changeableRolesFor,
  grantableWorkspaceRoles,
  isAdminRole,
  isOwnerRole,
  memberStatus,
} from './roleCapabilities';

describe('memberStatus', () => {
  it('reports removed when deletedAt is set', () => {
    expect(memberStatus({ deletedAt: new Date(), suspendedAt: null })).toBe('removed');
  });

  it('reports suspended when suspendedAt is set and not deleted', () => {
    expect(memberStatus({ deletedAt: null, suspendedAt: new Date() })).toBe('suspended');
  });

  it('reports active otherwise', () => {
    expect(memberStatus({ deletedAt: null, suspendedAt: null })).toBe('active');
    expect(memberStatus({ deletedAt: undefined, suspendedAt: undefined })).toBe('active');
  });
});

describe('role predicates and invite capability', () => {
  it('identifies owner/admin only by exact role', () => {
    expect(isOwnerRole('owner')).toBe(true);
    expect(isOwnerRole('admin')).toBe(false);
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('owner')).toBe(false);
  });

  it('only owner and admin may invite', () => {
    expect(canInviteMembers('owner')).toBe(true);
    expect(canInviteMembers('admin')).toBe(true);
    expect(canInviteMembers('member')).toBe(false);
    expect(canInviteMembers('viewer')).toBe(false);
    expect(canInviteMembers(null)).toBe(false);
    expect(canInviteMembers(undefined)).toBe(false);
  });
});

describe('grantableWorkspaceRoles', () => {
  it('owner grants everything except ownership itself', () => {
    expect(grantableWorkspaceRoles('owner')).toEqual(['admin', 'member', 'viewer']);
  });

  it('admin grants only member and viewer', () => {
    expect(grantableWorkspaceRoles('admin')).toEqual(['member', 'viewer']);
  });

  it('members and viewers grant nothing', () => {
    expect(grantableWorkspaceRoles('member')).toEqual([]);
    expect(grantableWorkspaceRoles('viewer')).toEqual([]);
    expect(grantableWorkspaceRoles(null)).toEqual([]);
  });

  it('canGrantRole mirrors the grantable list', () => {
    expect(canGrantRole('owner', 'admin')).toBe(true);
    expect(canGrantRole('owner', 'owner')).toBe(false);
    expect(canGrantRole('admin', 'admin')).toBe(false);
    expect(canGrantRole('admin', 'member')).toBe(true);
  });
});

describe('canManageMember', () => {
  it('never allows acting on an owner row — not even for the owner', () => {
    expect(canManageMember('owner', { role: 'owner', userId: 'u-owner' }, 'u-other')).toBe(false);
    expect(canManageMember('owner', { role: 'owner', userId: 'u-owner' }, 'u-owner')).toBe(false);
  });

  it('never allows acting on yourself — self-removal goes through leave()', () => {
    expect(canManageMember('owner', { role: 'admin', userId: 'u-1' }, 'u-1')).toBe(false);
    expect(canManageMember('admin', { role: 'member', userId: 'u-1' }, 'u-1')).toBe(false);
  });

  it('owner manages any non-owner member', () => {
    expect(canManageMember('owner', { role: 'admin', userId: 'a' }, 'o')).toBe(true);
    expect(canManageMember('owner', { role: 'member', userId: 'm' }, 'o')).toBe(true);
    expect(canManageMember('owner', { role: 'viewer', userId: 'v' }, 'o')).toBe(true);
  });

  it('admin manages strictly below-admin roles', () => {
    expect(canManageMember('admin', { role: 'member', userId: 'm' }, 'a')).toBe(true);
    expect(canManageMember('admin', { role: 'viewer', userId: 'v' }, 'a')).toBe(true);
    expect(canManageMember('admin', { role: 'admin', userId: 'b' }, 'a')).toBe(false);
    expect(canManageMember('admin', { role: 'owner', userId: 'o' }, 'a')).toBe(false);
  });

  it('members and viewers manage nobody', () => {
    expect(canManageMember('member', { role: 'viewer', userId: 'v' }, 'm')).toBe(false);
    expect(canManageMember('viewer', { role: 'member', userId: 'm' }, 'v')).toBe(false);
    expect(canManageMember(null, { role: 'member', userId: 'm' }, 'x')).toBe(false);
  });
});

describe('changeableRolesFor', () => {
  it('offers only roles the caller can grant, excluding the current one', () => {
    expect(changeableRolesFor('owner', 'member')).toEqual(['admin', 'viewer']);
    expect(changeableRolesFor('admin', 'member')).toEqual(['viewer']);
    expect(changeableRolesFor('admin', 'viewer')).toEqual(['member']);
    expect(changeableRolesFor('member', 'viewer')).toEqual([]);
  });
});

describe('canInviteToProject', () => {
  it('offers invites on public projects to anyone who can invite', () => {
    expect(canInviteToProject(true, { userId: 'other', visibility: 'public' }, 'me')).toBe(true);
    expect(canInviteToProject(true, { userId: 'me', visibility: 'public' }, 'me')).toBe(true);
  });

  it('offers private-project invites only to the project owner', () => {
    // The invite endpoint rejects non-owner grants on private projects —
    // workspace admin status is not a bypass, so the affordance hides.
    expect(canInviteToProject(true, { userId: 'me', visibility: 'private' }, 'me')).toBe(true);
    expect(canInviteToProject(true, { userId: 'other', visibility: 'private' }, 'me')).toBe(false);
  });

  it('never offers invites to callers without the workspace capability', () => {
    expect(canInviteToProject(false, { userId: 'me', visibility: 'private' }, 'me')).toBe(false);
    expect(canInviteToProject(false, { userId: 'me', visibility: 'public' }, 'me')).toBe(false);
  });

  it('denies private invites when the caller identity is missing', () => {
    expect(canInviteToProject(true, { userId: 'me', visibility: 'private' }, undefined)).toBe(
      false,
    );
    expect(canInviteToProject(true, { userId: 'me', visibility: 'private' }, null)).toBe(false);
  });
});

describe('canRequestOwnershipTransfer', () => {
  const admin = { role: 'admin', userId: 'u-admin' };

  it('lets the owner offer a transfer to an active admin', () => {
    expect(canRequestOwnershipTransfer('owner', admin, 'u-owner', false)).toBe(true);
  });

  it('is never offered to non-owners or while a transfer is pending', () => {
    expect(canRequestOwnershipTransfer('admin', admin, 'u-admin2', false)).toBe(false);
    expect(canRequestOwnershipTransfer('member', admin, 'u-m', false)).toBe(false);
    expect(canRequestOwnershipTransfer('owner', admin, 'u-owner', true)).toBe(false);
  });

  it('requires an active admin recipient — not self, member, viewer, or suspended', () => {
    expect(canRequestOwnershipTransfer('owner', { role: 'admin', userId: 'me' }, 'me', false)).toBe(
      false,
    );
    expect(canRequestOwnershipTransfer('owner', { role: 'member', userId: 'm' }, 'me', false)).toBe(
      false,
    );
    expect(
      canRequestOwnershipTransfer(
        'owner',
        { role: 'admin', suspendedAt: new Date(), userId: 's' },
        'me',
        false,
      ),
    ).toBe(false);
    // A legacy non-primary owner row still counts as admin for the swap.
    expect(canRequestOwnershipTransfer('owner', { role: 'owner', userId: 'co' }, 'me', false)).toBe(
      true,
    );
  });
});
