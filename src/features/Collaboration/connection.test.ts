// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getCollaborationStoreState } from '@/store/collaboration';

import { acquireRoomConnection, releaseRoomConnection } from './connection';

const { authorize } = vi.hoisted(() => ({ authorize: vi.fn() }));

vi.mock('@/features/Teammates/api/client', () => ({
  teammatesClient: { collaboration: { authorize: { mutate: authorize } } },
}));

const room = { id: 'p-1', scope: 'project' as const };
const key = 'project:p-1';

const statusOf = () => getCollaborationStoreState().rooms[key]?.status;

const flush = async () => {
  // Let the authorize microtask chain settle.
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
};

describe('room connection authorize failures', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authorize.mockReset();
  });

  afterEach(() => {
    releaseRoomConnection(room);
    vi.useRealTimers();
  });

  it('parks a permanent authorize failure instead of retrying forever', async () => {
    authorize.mockRejectedValue({ data: { code: 'BAD_REQUEST' } });

    acquireRoomConnection(room);
    await flush();

    expect(statusOf()).toBe('revoked');

    // Hours of backoff must not produce another authorize call.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it.each(['FORBIDDEN', 'UNAUTHORIZED', 'NOT_FOUND'])(
    'treats %s as terminal — no reconnect loop',
    async (code) => {
      authorize.mockRejectedValue({ data: { code } });

      acquireRoomConnection(room);
      await flush();

      expect(statusOf()).toBe('revoked');
      await vi.advanceTimersByTimeAsync(60 * 1000);
      expect(authorize).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps retrying transient failures', async () => {
    authorize.mockRejectedValue(new Error('socket hangup'));

    acquireRoomConnection(room);
    await flush();

    expect(statusOf()).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(authorize.mock.calls.length).toBeGreaterThan(1);
  });
});
