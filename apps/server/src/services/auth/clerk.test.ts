// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserItem } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { authEnv } from '@/envs/auth';

import {
  assertClerkSessionActive,
  type ClerkApiUser,
  ClerkAuthError,
  provisionClerkUser,
} from './clerk';

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

type Profile = Partial<UserItem> & Pick<UserItem, 'id'>;
const makeDb = ({
  findResults = [] as any[],
  profiles,
  bindings = [],
}: {
  findResults?: any[];
  profiles?: Profile[];
  bindings?: { providerId: string; accountId: string; userId: string }[];
} = {}) => {
  const findFirst = vi.fn();
  for (const row of findResults) findFirst.mockResolvedValueOnce(row);
  findFirst.mockResolvedValue(undefined);

  const insertValues = vi.fn();
  const updateSet = vi.fn().mockReturnValue({
    returning: vi.fn(() => [{ id: 'updated' }]),
    where: vi.fn(() => ({ returning: vi.fn(() => [{ id: 'updated' }]) })),
  });
  if (profiles) {
    findFirst.mockImplementation(async ({ where }: { where: SQL }) => {
      const query = new PgDialect().sqlToQuery(where);
      return query.sql.includes('"users"."id"')
        ? profiles.find((row) => row.id === query.params[0])
        : profiles.find(
            (row) => row.normalizedEmail === query.params[0] || row.email === query.params[1],
          );
    });
    insertValues.mockImplementation((row: Profile) => ({
      returning: async () => {
        profiles.push({ ...row });
        return [row];
      },
    }));
    updateSet.mockImplementation((patch: Partial<UserItem>) => ({
      where: (where: SQL) => ({
        returning: async () => {
          const profile = profiles.find(
            (row) => row.id === new PgDialect().sqlToQuery(where).params[0],
          );
          if (!profile) return [];
          Object.assign(profile, patch);
          return [profile];
        },
      }),
    }));
  }

  return {
    db: {
      insert: vi.fn(() => ({ returning: vi.fn(() => []), values: insertValues })),
      query: {
        users: { findFirst },
        account: {
          findMany: async ({ where }: { where: SQL }) => {
            const { params } = new PgDialect().sqlToQuery(where);
            return bindings.filter(
              (row) => row.providerId === params[0] && row.accountId === params[1],
            );
          },
        },
      },
      update: vi.fn(() => ({ set: updateSet })),
    },
    findFirst,
    insertValues,
    updateSet,
  };
};

describe('provisionClerkUser', () => {
  beforeEach(() => vi.clearAllMocks());
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

  const original: Profile = {
    id: 'legacy-canonical-z',
    email: 'old@fixture.test',
    normalizedEmail: 'old@fixture.test',
    emailVerified: true,
    fullName: 'Existing',
    clerkCreatedAt: new Date(0),
  };
  const mapped = { providerId: 'clerk', accountId: clerkUser.id, userId: original.id };
  const changedUser: ClerkApiUser = {
    ...clerkUser,
    email_addresses: [
      { id: 'em_1', email_address: 'changed@fixture.test', verification: { status: 'verified' } },
    ],
  };
  it('keeps the trusted canonical identity when the verified Clerk primary email changes', async () => {
    const profiles = [{ ...original }];
    const { db, insertValues } = makeDb({ profiles, bindings: [mapped] });
    const user = await provisionClerkUser(db as unknown as OrviloDatabase, changedUser);
    expect(user.id).toBe(original.id);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ id: original.id, email: 'changed@fixture.test' });
    expect(insertValues).not.toHaveBeenCalled();
    expect(initUser).not.toHaveBeenCalled();
  });
  it('fails closed when a trusted mapping has no remaining canonical row', async () => {
    const profiles: Profile[] = [];
    const { db, insertValues } = makeDb({ profiles, bindings: [mapped] });
    await expect(provisionClerkUser(db as unknown as OrviloDatabase, changedUser)).rejects.toThrow(
      'Clerk account binding is unavailable',
    );
    expect(profiles).toEqual([]);
    expect(insertValues).not.toHaveBeenCalled();
    expect(initUser).not.toHaveBeenCalled();
  });
  it('rejects conflicting trusted canonical mappings before writing profile fields', async () => {
    const profiles = [{ ...original }];
    const { db, insertValues, updateSet } = makeDb({
      profiles,
      bindings: [mapped, { ...mapped, userId: 'another-canonical-user' }],
    });
    await expect(provisionClerkUser(db as unknown as OrviloDatabase, changedUser)).rejects.toThrow(
      'Clerk account binding conflict',
    );
    expect(profiles).toEqual([original]);
    expect(insertValues).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
    expect(initUser).not.toHaveBeenCalled();
  });
});

describe('Clerk upstream session authorization', () => {
  const claims = { sessionId: 'sid-fixture', userId: 'user-fixture' };
  beforeEach(() => {
    vi.spyOn(authEnv, 'CLERK_SECRET_KEY', 'get').mockReturnValue('fixture-secret');
  });
  afterEach(() => vi.restoreAllMocks());
  it.each([
    { id: 'foreign', user_id: claims.userId, status: 'active' },
    { id: claims.sessionId, user_id: 'foreign', status: 'active' },
    { id: claims.sessionId, user_id: claims.userId, status: 'revoked' },
    { id: claims.sessionId, user_id: claims.userId, status: 'active', actor: {} },
    {
      id: claims.sessionId,
      user_id: claims.userId,
      status: 'active',
      expire_at: Date.now() - 1000,
    },
  ])('rejects mismatched, revoked, impersonated or expired upstream sessions', async (body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body));
    await expect(assertClerkSessionActive(claims)).rejects.toMatchObject({ status: 401 });
  });
  it('classifies missing SID as invalid authentication', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    await expect(assertClerkSessionActive(claims)).rejects.toMatchObject({ status: 401 });
  });
  it.each(['network', 'server', 'malformed'])(
    'classifies %s failure as infrastructure',
    async (failure) => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      if (failure === 'network') fetch.mockRejectedValue(new Error('network unavailable'));
      else
        fetch.mockResolvedValue(
          new Response(failure === 'malformed' ? 'broken' : null, {
            status: failure === 'server' ? 503 : 200,
          }),
        );
      await expect(assertClerkSessionActive(claims)).rejects.toMatchObject({
        status: 503,
        name: ClerkAuthError.name,
      });
    },
  );
});
