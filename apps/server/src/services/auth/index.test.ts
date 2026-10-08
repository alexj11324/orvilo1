// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSessionModel } from '@/database/models/authSession';
import type { session, UserItem } from '@/database/schemas';
import { account, users } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import type * as ClerkService from './clerk';
import { exchangeClerkSession } from './index';

const mocks = vi.hoisted(() => ({
  assertClerkSessionActive: vi.fn(),
  fetchClerkUser: vi.fn(),
  provisionClerkUser: vi.fn(),
  mintSession: vi.fn(),
  initUser: vi.fn(),
  verifyClerkSessionToken: vi.fn(),
}));
vi.mock('./clerk', async (original) => ({
  ...(await original<typeof ClerkService>()),
  ...mocks,
}));

vi.mock('../user', () => ({
  UserService: class {
    initUser = mocks.initUser;
  },
}));

const externalId = 'user_external_clerk';
const canonicalId = 'legacy-local-user';
type Binding = Pick<typeof account.$inferSelect, 'accountId' | 'id' | 'providerId' | 'userId'>;
const binding = (userId = canonicalId, id = `clerk:${externalId}`): Binding => ({
  accountId: externalId,
  id,
  providerId: 'clerk',
  userId,
});

type Profile = Partial<UserItem> & Pick<UserItem, 'id'>;
const createDb = (initial: Binding[] = [], initialProfiles: Profile[] = []) => {
  const profiles = initialProfiles.map((row) => ({ ...row }));
  const bindings = initial.map((row) => ({ ...row }));
  const findMany = vi.fn(async ({ where }: { where: SQL }) => {
    const { params } = new PgDialect().sqlToQuery(where);
    return bindings.filter((row) => row.providerId === params[0] && row.accountId === params[1]);
  });
  const findFirst = vi.fn(async ({ where }: { where: SQL }) => {
    const { params } = new PgDialect().sqlToQuery(where);
    return bindings.find((row) => row.id === params[0]);
  });
  const insert = vi.fn((table: unknown) => ({
    values: (row: Binding | Profile) =>
      table === account
        ? {
            onConflictDoNothing: async () => {
              if (!bindings.some((existing) => existing.id === row.id))
                bindings.push({ ...row } as Binding);
            },
          }
        : table === users
          ? {
              returning: async () => {
                profiles.push({ ...row } as Profile);
                return [row];
              },
            }
          : { returning: async () => [await mocks.mintSession(row)] },
  }));
  const db = {
    insert,
    query: {
      account: { findFirst, findMany },
      users: {
        findFirst: async ({ where }: { where: SQL }) => {
          const query = new PgDialect().sqlToQuery(where);
          return query.sql.includes('"users"."id"')
            ? profiles.find((row) => row.id === query.params[0])
            : profiles.find(
                (row) => row.normalizedEmail === query.params[0] || row.email === query.params[1],
              );
        },
      },
    },
    update: () => ({
      set: (patch: Partial<UserItem>) => ({
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
      }),
    }),
    transaction: async <T>(work: (tx: OrviloDatabase) => Promise<T>) => {
      const before = bindings.map((row) => ({ ...row }));
      const beforeProfiles = profiles.map((row) => ({ ...row }));
      try {
        return await work(db as unknown as OrviloDatabase);
      } catch (error) {
        bindings.splice(0, bindings.length, ...before);
        profiles.splice(0, profiles.length, ...beforeProfiles);
        throw error;
      }
    },
  };
  return { profiles, bindings, db: db as unknown as OrviloDatabase, insert };
};

describe('exchangeClerkSession trusted external identity binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyClerkSessionToken.mockResolvedValue({
      sessionId: 'clerk-session',
      userId: externalId,
    });
    mocks.assertClerkSessionActive.mockResolvedValue(undefined);
    mocks.fetchClerkUser.mockResolvedValue({ id: externalId });
    mocks.provisionClerkUser.mockResolvedValue({ created: false, user: { id: canonicalId } });
  });
  afterEach(() => vi.restoreAllMocks());

  const mint = () =>
    mocks.mintSession.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      bearerToken: 'web-session-fixture',
      createdAt: new Date(),
      token: 'sha256:fixture',
      userId: canonicalId,
    } as Awaited<ReturnType<AuthSessionModel['create']>>);

  it.each([canonicalId, externalId])(
    'binds verified Clerk identity before minting canonical session %s',
    async (localId) => {
      const { bindings, db } = createDb();
      mocks.provisionClerkUser.mockResolvedValue({ created: false, user: { id: localId } });
      const create = mint().mockImplementation(async ({ userId }: typeof session.$inferInsert) => {
        expect(bindings).toEqual([binding(localId)]);
        return {
          expiresAt: new Date(Date.now() + 60_000),
          bearerToken: 'web-session-fixture',
          createdAt: new Date(),
          token: 'sha256:fixture',
          userId,
        } as Awaited<ReturnType<AuthSessionModel['create']>>;
      });

      const result = await exchangeClerkSession(db, { sessionToken: 'verified-token-fixture' });

      expect(result.user.id).toBe(localId);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: localId,
          clerkSessionId: 'clerk-session',
          clerkUserId: externalId,
        }),
      );
      expect(result.cookie.value).toMatch(/^[\w-]{64}$/);
      expect(result.cookie.options.expires!.getTime()).toBeGreaterThan(
        Date.now() + 29 * 24 * 60 * 60 * 1000,
      );
      expect(mocks.fetchClerkUser).toHaveBeenCalledExactlyOnceWith(externalId);
    },
  );

  it('keeps repeat exchanges idempotent and preserves non-Clerk provider rows', async () => {
    const other = {
      ...binding(),
      accountId: 'google-account',
      id: 'google-binding',
      providerId: 'google',
    };
    const { bindings, db } = createDb([other]);
    mint();
    await exchangeClerkSession(db, { sessionToken: 'verified-token-fixture' });
    await exchangeClerkSession(db, { sessionToken: 'verified-token-fixture' });
    expect(bindings).toEqual([other, binding()]);
  });

  it('reuses an existing matching provider binding with its original row ID', async () => {
    const existing = binding(canonicalId, 'existing-provider-row');
    const { bindings, db, insert } = createDb([existing]);
    mint();
    await exchangeClerkSession(db, { sessionToken: 'verified-token-fixture' });
    expect(bindings).toEqual([existing]);
    expect(insert).not.toHaveBeenCalledWith(account);
  });

  it('rejects an external identity already bound to another canonical actor before minting', async () => {
    const existing = binding('another-local-user', 'existing-provider-row');
    const { bindings, db } = createDb([existing]);
    const create = mint();
    await expect(
      exchangeClerkSession(db, { sessionToken: 'verified-token-fixture' }),
    ).rejects.toThrow('Clerk account binding conflict');
    expect(create).not.toHaveBeenCalled();
    expect(bindings).toEqual([existing]);
  });

  it('rejects a conflicting deterministic row rather than rebinding its owner', async () => {
    const existing = { ...binding('another-local-user'), providerId: 'google' };
    const { bindings, db } = createDb([existing]);
    const create = mint();
    await expect(
      exchangeClerkSession(db, { sessionToken: 'verified-token-fixture' }),
    ).rejects.toThrow('Clerk account binding conflict');
    expect(create).not.toHaveBeenCalled();
    expect(bindings).toEqual([existing]);
  });

  it('does not bind or mint when Clerk token verification fails', async () => {
    const { bindings, db, insert } = createDb();
    const create = mint();
    mocks.verifyClerkSessionToken.mockRejectedValue(new Error('verification rejected'));
    await expect(
      exchangeClerkSession(db, { sessionToken: 'rejected-token-fixture' }),
    ).rejects.toThrow('verification rejected');
    expect(bindings).toEqual([]);
    expect(insert).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not bind or mint a Clerk user response that differs from the verified recipient', async () => {
    const { bindings, db } = createDb();
    const create = mint();
    mocks.fetchClerkUser.mockResolvedValue({ id: 'foreign-clerk-user' });
    await expect(
      exchangeClerkSession(db, { sessionToken: 'verified-token-fixture' }),
    ).rejects.toThrow('Clerk user does not match verified session');
    expect(mocks.provisionClerkUser).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(bindings).toEqual([]);
  });

  it('rolls back a new binding when web-session minting fails', async () => {
    const { bindings, db } = createDb();
    mint().mockRejectedValue(new Error('session insert failed'));
    await expect(
      exchangeClerkSession(db, { sessionToken: 'verified-token-fixture' }),
    ).rejects.toThrow('session insert failed');
    expect(bindings).toEqual([]);
  });

  const profile: Profile = {
    id: canonicalId,
    email: 'old@fixture.test',
    normalizedEmail: 'old@fixture.test',
    emailVerified: true,
    fullName: 'Existing',
    clerkCreatedAt: new Date(0),
  };
  const changedUser: ClerkService.ClerkApiUser = {
    id: externalId,
    primary_email_address_id: 'verified-email',
    email_addresses: [
      {
        id: 'verified-email',
        email_address: 'changed@fixture.test',
        verification: { status: 'verified' },
      },
    ],
  };
  const useRealProvision = async () => {
    const actual = await vi.importActual<typeof ClerkService>('./clerk');
    mocks.provisionClerkUser.mockImplementation(actual.provisionClerkUser);
    mocks.fetchClerkUser.mockResolvedValue(changedUser);
  };

  it('uses real provisioning to retain the mapped canonical actor after verified email changes', async () => {
    await useRealProvision();
    const { bindings, profiles, db } = createDb([binding()], [profile]);
    mint();
    const result = await exchangeClerkSession(db, { sessionToken: 'verified-token-fixture' });
    expect(result.user.id).toBe(canonicalId);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ id: canonicalId, email: 'changed@fixture.test' });
    expect(bindings).toEqual([binding()]);
  });

  it.each([true, false])(
    'rolls back real profile provisioning on session-mint failure, existing mapping=%s',
    async (mapped) => {
      await useRealProvision();
      const initial = mapped ? [profile] : [];
      const { bindings, profiles, db } = createDb(mapped ? [binding()] : [], initial);
      mint().mockRejectedValue(new Error('session insert failed'));
      await expect(
        exchangeClerkSession(db, { sessionToken: 'verified-token-fixture' }),
      ).rejects.toThrow('session insert failed');
      expect(profiles).toEqual(initial);
      expect(bindings).toEqual(mapped ? [binding()] : []);
    },
  );

  it('rejects conflicting trusted bindings without real profile writes or session minting', async () => {
    await useRealProvision();
    const initial = [{ ...profile, id: externalId }, profile];
    const existing = [
      binding(canonicalId, 'existing-binding'),
      binding('other-canonical-actor', 'conflicting-binding'),
    ];
    const { bindings, profiles, db } = createDb(existing, initial);
    const create = mint();
    await expect(
      exchangeClerkSession(db, { sessionToken: 'verified-token-fixture' }),
    ).rejects.toThrow('Clerk account binding conflict');
    expect(profiles).toEqual(initial);
    expect(bindings).toEqual(existing);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('post-commit initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyClerkSessionToken.mockResolvedValue({ sessionId: 'session', userId: externalId });
    mocks.fetchClerkUser.mockResolvedValue({ id: externalId });
    mocks.provisionClerkUser.mockResolvedValue({ created: true, user: { id: canonicalId } });
  });
  it('never bootstraps a rolled-back exchange', async () => {
    const { db } = createDb();
    mocks.mintSession.mockRejectedValue(new Error('session insert failed'));
    await expect(exchangeClerkSession(db, { sessionToken: 'fixture' })).rejects.toThrow(
      'session insert failed',
    );
    expect(mocks.initUser).not.toHaveBeenCalled();
  });
  it('bootstraps only after the transaction has committed', async () => {
    const { db } = createDb();
    let committed = false;
    const tx = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation(async (fn: any) => {
      const result = await tx(fn);
      committed = true;
      return result;
    });
    mocks.mintSession.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      token: 'fixture',
      userId: canonicalId,
    });
    mocks.initUser.mockImplementation(async () => {
      expect(committed).toBe(true);
    });
    await exchangeClerkSession(db, { sessionToken: 'fixture' });
    expect(mocks.initUser).toHaveBeenCalledOnce();
  });
});
