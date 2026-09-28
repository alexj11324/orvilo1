import { EVENT_CONSUMERS } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';

import { CollaborationOutboxProjector } from '../outboxProjector';
import type { OutboxEventRow } from '../projection';
import type { RoomPublisher } from '../roomPublisher';

const {
  claimPending,
  markDelivered,
  markFailed,
  fanOut,
  claimReceipts,
  markReceiptDelivered,
  markReceiptFailed,
  drainPending,
} = vi.hoisted(() => ({
  claimPending: vi.fn(),
  claimReceipts: vi.fn(),
  drainPending: vi.fn(),
  fanOut: vi.fn(),
  markDelivered: vi.fn(),
  markFailed: vi.fn(),
  markReceiptDelivered: vi.fn(),
  markReceiptFailed: vi.fn(),
}));

vi.mock('@/database/models/eventOutbox', () => ({
  EventOutboxModel: class {
    claimPending = claimPending;
    markDelivered = markDelivered;
    markFailed = markFailed;
  },
}));

vi.mock('@/database/models/eventConsumerReceipt', () => ({
  EventConsumerReceiptModel: class {
    claimPending = claimReceipts;
    fanOut = fanOut;
    markDelivered = markReceiptDelivered;
    markFailed = markReceiptFailed;
  },
}));

vi.mock('@/server/services/workAttention', () => ({
  NotificationProjectionService: class {
    drainPending = drainPending;
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

const projector = (
  publish = vi.fn().mockResolvedValue(undefined),
  db: unknown = { select: selectStub },
) =>
  new CollaborationOutboxProjector(
    db as OrviloDatabase,
    {
      publish,
    } as unknown as RoomPublisher,
  );

const selectStub = vi.fn(() => ({
  from: () => ({
    where: () => ({
      limit: async () => [],
    }),
  }),
}));

describe('CollaborationOutboxProjector.projectPending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markDelivered.mockResolvedValue(true);
    markFailed.mockResolvedValue(undefined);
    fanOut.mockResolvedValue(undefined);
    claimReceipts.mockResolvedValue([]);
    markReceiptDelivered.mockResolvedValue(true);
    markReceiptFailed.mockResolvedValue(undefined);
    drainPending.mockResolvedValue(0);
  });

  it('fans out receipts then marks the parent outbox delivered without publishing yet', async () => {
    claimPending.mockResolvedValueOnce([row('a'), row('b')]).mockResolvedValueOnce([row('c')]);
    const publish = vi.fn().mockResolvedValue(undefined);

    const result = await projector(publish).projectPending(2);

    expect(result).toEqual({ dispatched: 3, projected: 0, realtime: 0 });
    expect(claimPending).toHaveBeenCalledTimes(2);
    expect(fanOut.mock.calls.map(([, params]) => params.eventId)).toEqual([
      'evt-a',
      'evt-b',
      'evt-c',
    ]);
    expect(markDelivered.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c']);
    expect(publish).not.toHaveBeenCalled();
  });

  it('defers a failing fan-out and keeps draining the rest of the page', async () => {
    claimPending.mockResolvedValueOnce([row('bad'), row('good')]).mockResolvedValueOnce([]);
    fanOut.mockRejectedValueOnce(new Error('insert failed')).mockResolvedValue(undefined);

    const result = await projector().projectPending(2);

    expect(result.dispatched).toBe(1);
    expect(markFailed).toHaveBeenCalledWith('bad', { retryDelayMs: 30_000 });
    expect(markDelivered).toHaveBeenCalledWith('good');
  });

  it('lets collaboration realtime fail without swallowing the notification consumer', async () => {
    claimPending.mockResolvedValue([]);
    drainPending.mockResolvedValue(4);
    claimReceipts
      .mockResolvedValueOnce([
        {
          consumer: EVENT_CONSUMERS.COLLABORATION_REALTIME,
          eventId: 'evt-live',
          id: 'rcpt-1',
        },
      ])
      .mockResolvedValueOnce([]);
    markReceiptFailed.mockResolvedValue(undefined);

    const publish = vi.fn().mockRejectedValue(new Error('gateway down'));
    const selectWithEvent = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [row('live')],
        }),
      }),
    }));
    const result = await projector(publish, { select: selectWithEvent }).projectPending();

    expect(result.projected).toBe(4);
    expect(result.realtime).toBe(0);
    expect(markReceiptFailed).toHaveBeenCalledWith('rcpt-1', { retryDelayMs: 30_000 });
    expect(drainPending).toHaveBeenCalled();
  });

  it('returns empty counters on an empty backlog without publishing', async () => {
    claimPending.mockResolvedValueOnce([]);
    const publish = vi.fn().mockResolvedValue(undefined);

    const result = await projector(publish).projectPending();

    expect(result).toEqual({ dispatched: 0, projected: 0, realtime: 0 });
    expect(publish).not.toHaveBeenCalled();
    expect(markDelivered).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });
});
