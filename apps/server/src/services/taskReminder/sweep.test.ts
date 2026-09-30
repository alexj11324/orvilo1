// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationModel } from '@/database/models/notification';
import { TaskModel } from '@/database/models/task';
import { claimDueTaskReminders, markTaskReminderDelivered } from '@/database/models/taskReminder';

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
  deliveredAt: null,
  id,
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

  it('isolates a poisoned row: earlier deliveries keep their stamps, later rows still deliver', async () => {
    const rows = [reminder('r1'), reminder('r2'), reminder('r3')];
    vi.mocked(claimDueTaskReminders).mockResolvedValue(rows as never);

    // r2's notification insert throws inside its savepoint.
    mockCreate(((payload: { dedupeKey: string }) => {
      if (payload.dedupeKey.includes('r2')) throw new Error('constraint violation');
      return { id: 'notification-1' };
    }) as never);

    const result = await runTaskReminderSweep();

    // r1 + r3 delivered inside their own savepoints; r2 rolled back alone and
    // is stamped delivered in the outer transaction so it never re-claims.
    expect(result).toEqual({ claimed: 3, delivered: 2, failed: 1, skipped: 0 });
    expect(markTaskReminderDelivered).toHaveBeenCalledWith(rowTx, 'r1');
    expect(markTaskReminderDelivered).toHaveBeenCalledWith(tx, 'r2');
    expect(markTaskReminderDelivered).toHaveBeenCalledWith(rowTx, 'r3');
    expect(markTaskReminderDelivered).toHaveBeenCalledTimes(3);
  });

  it('keeps a permanently bad row out of the pending set on the next sweep', async () => {
    // Second sweep: claim no longer returns r2 because it was stamped; the
    // batch still processes normally.
    const rows = [reminder('r1')];
    vi.mocked(claimDueTaskReminders).mockResolvedValue(rows as never);

    const result = await runTaskReminderSweep();

    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0, skipped: 0 });
  });
});
