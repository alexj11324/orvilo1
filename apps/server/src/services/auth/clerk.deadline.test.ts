// @vitest-environment node
import debug from 'debug';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/(backend)/api/auth/session/route';
import type { AuthSessionItem } from '@/database/models/authSession';
import type * as SessionModel from '@/database/models/authSession';
import type { OrviloDatabase } from '@/database/type';
import { authEnv } from '@/envs/auth';

import { assertClerkSessionActive } from './clerk';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  renew: vi.fn(),
  deleted: vi.fn(),
  findUser: vi.fn(),
}));
vi.mock('@/database/models/authSession', async (original) => ({
  ...(await original<typeof SessionModel>()),
  AuthSessionModel: class {
    findValidByToken = mocks.find;
    renew = mocks.renew;
    deleteByToken = mocks.deleted;
  },
}));
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: async () => db }));
vi.mock('@/database/models/user', () => ({ UserModel: { findById: mocks.findUser } }));

const record = {
  id: 'local-fixture',
  userId: 'canonical-fixture',
  clerkUserId: 'upstream-fixture',
  clerkSessionId: 'SID_SENTINEL_DO_NOT_LOG',
} as AuthSessionItem;
const db = {
  select: () => ({ from: () => ({ where: async () => [{ userId: record.userId }] }) }),
} as unknown as OrviloDatabase;
const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
const waitForAbort = (signal?: AbortSignal | null): Promise<never> =>
  new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
const bounded = <T>(promise: Promise<T>) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Clerk operation did not reach its deadline')), 200),
    ),
  ]);

describe('bounded Clerk operation and SID-safe logs', () => {
  beforeEach(() => {
    vi.spyOn(authEnv, 'CLERK_SECRET_KEY', 'get').mockReturnValue('fixture-secret');
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => nativeTimeout(20));
    mocks.find.mockResolvedValue(record);
    mocks.renew.mockResolvedValue(record);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    debug.disable();
  });
  it.each(['headers', 'body'])(
    'stalled %s becomes infrastructure without renewal or cookie/row mutation',
    async (stall) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_, options) => {
        if (stall === 'headers') return waitForAbort(options?.signal);
        const response = Response.json({});
        response.json = () => waitForAbort(options?.signal);
        return response;
      });
      const headers = new Headers({ cookie: `orvilo_auth=${'a'.repeat(64)}` });
      const response = await bounded(
        GET(new Request('https://fixture.invalid/api/auth/session', { headers })),
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(mocks.findUser).not.toHaveBeenCalled();
      expect(AbortSignal.timeout).toHaveBeenCalledWith(10_000);
      expect(mocks.renew).not.toHaveBeenCalled();
      expect(mocks.deleted).not.toHaveBeenCalled();
      expect(headers.get('cookie')).toBe(`orvilo_auth=${'a'.repeat(64)}`);
    },
  );
  it('enabled real Clerk logger preserves status while excluding SID values', async () => {
    const output: unknown[][] = [];
    vi.spyOn(debug, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args);
    });
    debug.enable('orvilo-auth:clerk');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      assertClerkSessionActive({ sessionId: record.clerkSessionId!, userId: record.clerkUserId! }),
    ).rejects.toMatchObject({ status: 503 });
    expect(output.length).toBeGreaterThan(0);
    const logged = JSON.stringify(output);
    expect(logged).toContain('503');
    expect(logged).not.toContain(record.clerkSessionId);
  });
});
