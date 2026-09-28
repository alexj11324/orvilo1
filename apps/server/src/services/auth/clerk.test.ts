// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { type ClerkApiUser, provisionClerkUser } from './clerk';

const initUser = vi.hoisted(() => vi.fn());

vi.mock('../user', () => ({
  UserService: class {
    initUser = initUser;
  },
}));

const clerkUser: ClerkApiUser = {
  created_at: 1_700_000_000_000,
  email_addresses: [
    {
      email_address: 'orvilo-test@aspectlylabs.com',
      id: 'em_1',
      verification: { status: 'verified' },
    },
  ],
  first_name: 'Orvilo',
  id: 'user_clerk_1',
  image_url: 'https://img.clerk.com/x',
  last_name: 'Test',
  primary_email_address_id: 'em_1',
};

const makeDb = ({ findResults = [] as any[] } = {}) => {
  const findFirst = vi.fn();
  for (const row of findResults) findFirst.mockResolvedValueOnce(row);
  findFirst.mockResolvedValue(undefined);

  const insertValues = vi.fn();
  const updateSet = vi.fn();

  return {
    db: {
      insert: vi.fn(() => ({ returning: vi.fn(() => []), values: insertValues })),
      query: { users: { findFirst } },
      update: vi.fn(() => ({
        set: updateSet.mockReturnValue({
          returning: vi.fn(() => [{ id: 'updated' }]),
          where: vi.fn(() => ({ returning: vi.fn(() => [{ id: 'updated' }]) })),
        }),
      })),
    },
    findFirst,
    insertValues,
    updateSet,
  };
};

describe('provisionClerkUser', () => {
  it('creates the user keyed by the Clerk id when no row exists', async () => {
    const { db, insertValues } = makeDb();
    db.insert.mockReturnValue({
      returning: vi.fn(() => [{ id: clerkUser.id }]),
      values: insertValues.mockReturnThis(),
    } as any);

    await provisionClerkUser(db as any, clerkUser);

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ id: 'user_clerk_1' }));
    expect(initUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'user_clerk_1' }));
  });

  it('links a migrated legacy row matched by email instead of inserting', async () => {
    const legacyRow = {
      clerkCreatedAt: null,
      email: 'orvilo-test@aspectlylabs.com',
      emailVerified: false,
      id: 'legacy_ba_user_id',
      normalizedEmail: 'orvilo-test@aspectlylabs.com',
    };
    // id lookup misses, email lookup hits
    const { db, findFirst, updateSet } = makeDb({ findResults: [undefined, legacyRow] });

    const user = await provisionClerkUser(db as any, clerkUser);

    expect(db.insert).not.toHaveBeenCalled();
    expect(initUser).not.toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkCreatedAt: expect.any(Date),
        emailVerified: true,
      }),
    );
    expect(user).toEqual({ id: 'updated' });
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('matches by raw email when normalizedEmail is missing on the legacy row', async () => {
    const legacyRow = {
      email: 'orvilo-test@aspectlylabs.com',
      emailVerified: true,
      id: 'legacy_ba_user_id',
      normalizedEmail: null,
    };
    const { db } = makeDb({ findResults: [undefined, legacyRow] });

    await provisionClerkUser(db as any, clerkUser);

    expect(db.insert).not.toHaveBeenCalled();
  });
});
