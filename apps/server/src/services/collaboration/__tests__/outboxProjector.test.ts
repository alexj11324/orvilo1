import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';

import { CollaborationOutboxProjector } from '../outboxProjector';
import type { OutboxEventRow } from '../projection';
import type { RoomPublisher } from '../roomPublisher';

const { claimPending, markDelivered, markFailed } = vi.hoisted(() => ({
  claimPending: vi.fn(),
  markDelivered: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock('@/database/models/eventOutbox', () => ({
  EventOutboxModel: class {
    claimPending = claimPending;
    markDelivered = markDelivered;
    markFailed = markFailed;
  },
}));

const row = (id: string): OutboxEventRow => ({
  aggregateId: `task_${id}`,
  aggregateType: 'task',
  createdAt: new Date('2026-09-18T00:00:00Z'),
  eventId: `evt-${id}`,
  eventType: 'task.input.submitted',
  id,
  payload: {},
});

const projector = (publish = vi.fn().mockResolvedValue(undefined)) =>
  new CollaborationOutboxProjector({} as OrviloDatabase, {
    publish,
  } as unknown as RoomPublisher);

describe('CollaborationOutboxProjector.projectPending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markDelivered.mockResolvedValue(true);
    markFailed.mockResolvedValue(undefined);
  });

  it('drains claimed pages until a short page — a full page is not the end', async () => {
    // Regression: the pre-claim drain returned after one 200-row page, so a
    // backlog waited a full sweep interval per page.
    claimPending.mockResolvedValueOnce([row('a'), row('b')]).mockResolvedValueOnce([row('c')]);
    const publish = vi.fn().mockResolvedValue(undefined);

    const drained = await projector(publish).projectPending(2);

    expect(drained).toBe(3);
    expect(claimPending).toHaveBeenCalledTimes(2);
    expect(claimPending).toHaveBeenCalledWith({ limit: 2, visibilityTimeoutMs: 300_000 });
    expect(publish).toHaveBeenCalledTimes(3);
    expect(markDelivered.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c']);
  });

  it('defers a failing row and keeps draining the rest of the page', async () => {
    claimPending.mockResolvedValueOnce([row('bad'), row('good')]).mockResolvedValueOnce([]);
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error('gateway down'))
      .mockResolvedValue(undefined);

    const drained = await projector(publish).projectPending(2);

    expect(drained).toBe(1);
    expect(markFailed).toHaveBeenCalledWith('bad', { retryDelayMs: 30_000 });
    expect(markDelivered).toHaveBeenCalledWith('good');
  });

  it('returns 0 on an empty backlog without publishing', async () => {
    claimPending.mockResolvedValueOnce([]);
    const publish = vi.fn().mockResolvedValue(undefined);

    const drained = await projector(publish).projectPending();

    expect(drained).toBe(0);
    expect(publish).not.toHaveBeenCalled();
    expect(markDelivered).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });
});
