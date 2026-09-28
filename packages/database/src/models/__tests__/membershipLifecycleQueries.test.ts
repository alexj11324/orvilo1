import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listMembersWithProfiles } from '@/business/server/membershipLifecycle/queries';

import { getTestDB } from '../../core/getTestDB';
import { users, workspaceMembers, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';

const serverDB: OrviloDatabase = await getTestDB();

const userId = 'member-profile-user';
const workspaceId = 'member-profile-ws';

const seedMembership = async () => {
  await serverDB.insert(users).values({
    // No avatar: the nested `user: { avatar, ... }` select mapped the whole
    // joined object to null whenever its first field was null (drizzle-orm
    // 0.45.2), so avatar-less members rendered nameless.
    avatar: null,
    email: 'member@example.com',
    fullName: 'Fixture Member',
    id: userId,
    username: 'fixturemember',
  });
  await serverDB.insert(workspaces).values({
    id: workspaceId,
    name: 'Fixture Workspace',
    primaryOwnerId: userId,
    slug: 'fixture-workspace',
  });
  await serverDB.insert(workspaceMembers).values({ role: 'member', userId, workspaceId });
};

beforeEach(seedMembership);

afterEach(async () => {
  await serverDB.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  await serverDB.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await serverDB.delete(users).where(eq(users.id, userId));
});

describe('listMembersWithProfiles', () => {
  // Regression: the original nested `user: {...}` select over the leftJoin
  // mapped to null on a joined row, so the members directory rendered names
  // empty for everyone.
  it('returns the joined user profile for an existing member', async () => {
    const rows = await listMembersWithProfiles(serverDB, workspaceId, false);

    const row = rows.find((r) => r.member.userId === userId);
    expect(row).toBeDefined();
    expect(row?.user).not.toBeNull();
    expect(row?.user?.fullName).toBe('Fixture Member');
    expect(row?.user?.username).toBe('fixturemember');
  });
});
