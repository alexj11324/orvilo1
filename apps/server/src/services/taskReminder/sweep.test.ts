// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationModel } from '@/database/models/notification';
import { TaskModel } from '@/database/models/task';
import {
  claimDueTaskReminders,
  markTaskReminderDelivered,
  recordTaskReminderAttempt,
} from '@/database/models/taskReminder';

import { runTaskReminderSweep } from './sweep';

const { db, tx, rowTx } = vi.hoisted(() => {
  const rowTx = { kind: 'row-tx' };
  const tx = {
    kind: 'tx',
    transaction: vi.fn(async (fn: (t: typeof rowTx) => unknown) => fn(rowTx)),
  };
  const db = {
    transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { db, tx, rowTx };
});

vi.mock('@/database/server', () => ({
  getServerDB: vi.fn().mockResolvedValue(db),
}));

vi.mock('@/database/models/taskReminder', () => ({
  claimDueTaskReminders: vi.fn(),
  markTaskReminderDelivered: vi.fn().mockResolvedValue(undefined),
  recordTaskReminderAttempt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(),
}));

vi.mock('@/database/models/notification', () => ({
  NotificationModel: vi.fn(),
}));

vi.mock('@/database/models/notificationFeed', () => ({
  allocateFeedRevision: vi.fn().mockResolvedValue(1),
}));

const reminder = (id: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  attemptCount: 0,
  deliveredAt: null,
  id,
  nextAttemptAt: null,
  remindAt: new Date('2026-01-01T00:00:00Z'),
  taskId: `task-${id}`,
  userId: `user-${id}`,
  workspaceId: 'ws-1',
  ...overrides,
});

const mockFindById = (task: unknown) => {
  vi.mocked(TaskModel).mockImplementation(function () {
    return { findById: vi.fn().mockResolvedValue(task) } as never;
  });
};

const mockCreate = (impl: (...args: never[]) => unknown) => {
  vi.mocked(NotificationModel).mockImplementation(function () {
    return { create: vi.fn(impl) } as never;
  });
};

describe('runTaskReminderSweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.transaction.mockImplementation(async (fn: (t: typeof rowTx) => unknown) => fn(rowTx));
    db.transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
    mockFindById({ id: 'task-1', identifier: 'T-1', name: 'Do the thing' });
    mockCreate(async () => ({ id: 'notification-1' }) as never);
  });

  it('delivers a due reminder and stamps it', async () => {
    vi.mocked(claimDueTaskReminders).mockResolvedValue([reminder('r1')] as never);

    const result = await runTaskReminderSweep();

    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0, skipped: 0 });
    expect(markTaskReminderDelivered).toHaveBeenCalledWith(rowTx, 'r1');
  });

  it('skips and stamps a reminder whose task is no longer readable', async () => {
    vi.mocked(claimDueTaskReminders).mockResolvedValue([reminder('r1')] as never);
    mockFindById(null);

    const result = await runTaskReminderSweep();

    expect(result).toEqual({ claimed: 1, delivered: 0, failed: 0, skipped: 1 });
    expect(markTaskReminderDelivered).toHaveBeenCalledWith(rowTx, 'r1');
  });

  it('reschedules a transient failure on backoff without stamping delivered', async () => {
    vi.mocked(claimDueTaskReminders).mockResolvedValue([reminder('r1'), reminder('r2')] as never);
    mockCreate(((payload: { dedupeKey: string }) => {
      if (payload.dedupeKey.includes('r1')) throw new Error('deadlock detected');
      return { id: 'notification-1' };
    }) as never);

    const now = new Date('2026-02-01T12:00:00Z');
    const result = await runTaskReminderSweep({ now });

    expect(result).toEqual({ claimed: 2, delivered: 1, failed: 1, skipped: 0 });
    expect(recordTaskReminderAttempt).toHaveBeenCalledWith(
      tx,
      'r1',
      1,
      new Date(now.getTime() + 60_000),
    );
    expect(markTaskReminderDelivered).not.toHaveBeenCalledWith(tx, 'r1');
    expect(markTaskReminderDelivered).toHaveBeenCalledWith(rowTx, 'r2');
  });

  it('delivers a row on retry after a transient failure', async () => {
    // Next sweep re-claims r1 (nextAttemptAt elapsed per the claim predicate)
    // and delivers it — retries must succeed, not be treated as poison.
    vi.mocked(claimDueTaskReminders).mockResolvedValue([
      reminder('r1', { attemptCount: 1, nextAttemptAt: new Date('2026-02-01T12:01:00Z') }),
    ] as never);

    const result = await runTaskReminderSweep({ now: new Date('2026-02-01T12:05:00Z') });

    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0, skipped: 0 });
    expect(markTaskReminderDelivered).toHaveBeenCalledWith(rowTx, 'r1');
  });

  it('keeps a high-attempt poison row parked on capped backoff, never stamped, while later rows deliver', async () => {
    const rows = [reminder('r1', { attemptCount: 40 }), reminder('r2')];
    vi.mocked(claimDueTaskReminders).mockResolvedValue(rows as never);
    mockCreate(((payload: { dedupeKey: string }) => {
      if (payload.dedupeKey.includes('r1')) throw new Error('constraint violation');
      return { id: 'notification-1' };
    }) as never);

    const now = new Date('2026-02-01T12:00:00Z');
    const result = await runTaskReminderSweep({ now });

    expect(result).toEqual({ claimed: 2, delivered: 1, failed: 1, skipped: 0 });
    // Retry at the capped 30-minute delay; the row stays undelivered so it
    // can still deliver once the failure cause clears.
    expect(recordTaskReminderAttempt).toHaveBeenCalledWith(
      tx,
      'r1',
      41,
      new Date(now.getTime() + 30 * 60_000),
    );
    expect(markTaskReminderDelivered).not.toHaveBeenCalledWith(tx, 'r1');
    expect(markTaskReminderDelivered).not.toHaveBeenCalledWith(rowTx, 'r1');
    expect(markTaskReminderDelivered).toHaveBeenCalledWith(rowTx, 'r2');
  });
});
