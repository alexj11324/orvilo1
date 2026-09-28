// @vitest-environment node
import { EVENT_CONSUMERS } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users, workspaces } from '../../schemas';
import { eventConsumerReceipts } from '../../schemas/workAttention';
import type { OrviloDatabase } from '../../type';
import { EventConsumerReceiptModel } from '../eventConsumerReceipt';
import { EventOutboxModel, newEventId } from '../eventOutbox';

const serverDB: OrviloDatabase = await getTestDB();
const userId = 'receipt-user';
const workspaceId = 'receipt-ws';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values({ id: userId });
  await serverDB
    .insert(workspaces)
    .values({ id: workspaceId, name: 'WS', primaryOwnerId: userId, slug: 'receipt-ws' });
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('EventConsumerReceiptModel', () => {
  it('fans out one receipt per consumer without sharing outbox delivered', async () => {
    const outbox = new EventOutboxModel(serverDB);
    const receipts = new EventConsumerReceiptModel(serverDB);
    const eventId = newEventId();
    const row = await outbox.insertOutboxEvent(serverDB, {
      aggregateId: 'task-1',
      aggregateType: 'task',
      eventId,
      eventType: 'task.assigned',
      payload: {},
      workspaceId,
    });

    await receipts.fanOut(serverDB, { eventId, outboxId: row.id });
    await receipts.fanOut(serverDB, { eventId, outboxId: row.id });

    const stored = await serverDB.select().from(eventConsumerReceipts);
    expect(stored).toHaveLength(2);
    expect(stored.map((item) => item.consumer).sort()).toEqual(
      [EVENT_CONSUMERS.COLLABORATION_REALTIME, EVENT_CONSUMERS.NOTIFICATION_PROJECTION].sort(),
    );
    expect(stored.every((item) => item.status === 'pending')).toBe(true);
  });

  it('lets one consumer succeed without swallowing the other', async () => {
    const receipts = new EventConsumerReceiptModel(serverDB);
    const eventId = newEventId();
    await receipts.fanOut(serverDB, { eventId, outboxId: 'outbox-1' });

    const stored = await serverDB.select().from(eventConsumerReceipts);
    const notification = stored.find(
      (item) => item.consumer === EVENT_CONSUMERS.NOTIFICATION_PROJECTION,
    );
    const realtime = stored.find(
      (item) => item.consumer === EVENT_CONSUMERS.COLLABORATION_REALTIME,
    );
    expect(notification && realtime).toBeTruthy();
    await receipts.markDelivered(notification!.id);

    const leftover = await serverDB
      .select()
      .from(eventConsumerReceipts)
      .where(eq(eventConsumerReceipts.id, realtime!.id));
    expect(leftover[0]?.status).toBe('pending');
  });
});
