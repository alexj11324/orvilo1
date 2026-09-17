import { describe, expect, it } from 'vitest';

import {
  canGrantRole,
  canInviteMembers,
  canManageMember,
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
