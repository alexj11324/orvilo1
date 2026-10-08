// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthSessionItem } from '@/database/models/authSession';
import type * as AuthSessionModule from '@/database/models/authSession';
import type { OrviloDatabase } from '@/database/type';

import type * as ClerkModule from './clerk';
import { ClerkAuthError } from './clerk';
import { resolveAuthSessionFromCookies, resolveAuthSessionFromHeaders } from './session';

const mocks = vi.hoisted(() => ({ find: vi.fn(), renew: vi.fn(), active: vi.fn() }));
vi.mock('@/database/models/authSession', async (original) => ({
  ...(await original<typeof AuthSessionModule>()),
  AuthSessionModel: class {
    findValidByToken = mocks.find;
    renew = mocks.renew;
  },
}));
vi.mock('./clerk', async (original) => ({
  ...(await original<typeof ClerkModule>()),
  assertClerkSessionActive: mocks.active,
}));
const record = {
  id: 'session-fixture',
  clerkSessionId: 'sid-verified',
  clerkUserId: 'upstream-user',
  userId: 'canonical-user',
} as AuthSessionItem;
const setup = (bindings = [{ userId: record.userId }]) =>
  ({
    select: () => ({ from: () => ({ where: async () => bindings }) }),
  }) as unknown as OrviloDatabase;
const headers = new Headers({ cookie: `orvilo_auth=${'a'.repeat(64)}` });

describe('cookie authorization verified Clerk binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockResolvedValue({ ...record });
    mocks.renew.mockResolvedValue({ ...record });
    mocks.active.mockResolvedValue(undefined);
  });
  it('rechecks stored SID/sub and authorizes the canonical local user before renewal', async () => {
    expect((await resolveAuthSessionFromHeaders(setup(), headers))?.userId).toBe(record.userId);
    expect(mocks.active).toHaveBeenCalledWith({
      sessionId: record.clerkSessionId,
      userId: record.clerkUserId,
    });
    expect(mocks.renew).toHaveBeenCalledOnce();
    expect((await resolveAuthSessionFromCookies(setup(), () => 'a'.repeat(64)))?.userId).toBe(
      record.userId,
    );
  });
  it.each([null, { ...record, clerkSessionId: null }, { ...record, clerkUserId: null }])(
    'rejects absent or legacy unbound rows',
    async (row) => {
      mocks.find.mockResolvedValue(row);
      expect(await resolveAuthSessionFromHeaders(setup(), headers)).toBeNull();
      expect(mocks.active).not.toHaveBeenCalled();
      expect(mocks.renew).not.toHaveBeenCalled();
    },
  );
  it.each([
    { bindings: [] },
    { bindings: [{ userId: 'foreign' }] },
    { bindings: [{ userId: record.userId }, { userId: 'foreign' }] },
  ])('rejects missing or conflicting canonical mapping', async ({ bindings }) => {
    expect(await resolveAuthSessionFromHeaders(setup(bindings), headers)).toBeNull();
    expect(mocks.active).not.toHaveBeenCalled();
    expect(mocks.renew).not.toHaveBeenCalled();
  });
  it('rejects revocation without renewal', async () => {
    mocks.active.mockRejectedValue(new ClerkAuthError('revoked'));
    expect(await resolveAuthSessionFromHeaders(setup(), headers)).toBeNull();
    expect(mocks.renew).not.toHaveBeenCalled();
  });
  it('propagates infrastructure outage preserving the row and skipping renewal', async () => {
    const outage = new ClerkAuthError('unavailable', 503);
    mocks.active.mockRejectedValue(outage);
    await expect(resolveAuthSessionFromHeaders(setup(), headers)).rejects.toBe(outage);
    expect(mocks.renew).not.toHaveBeenCalled();
  });
});
