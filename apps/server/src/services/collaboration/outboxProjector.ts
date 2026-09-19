import { EVENT_CONSUMERS } from '@orvilo/types';
import debug from 'debug';
import { eq } from 'drizzle-orm';

import { EventConsumerReceiptModel } from '@/database/models/eventConsumerReceipt';
import { EventOutboxModel } from '@/database/models/eventOutbox';
import { eventOutbox } from '@/database/schemas/eventOutbox';
import type { OrviloDatabase } from '@/database/type';
import { NotificationProjectionService } from '@/server/services/workAttention';

import { projectOutboxEvent } from './projection';
import { getRoomPublisher, type RoomPublisher } from './roomPublisher';

const log = debug('lobe-server:collaboration:outbox');

/** Backoff between retries for a row whose deliveries keep failing. */
const RETRY_DELAY_MS = 30_000;

/**
 * How long a claimed page stays invisible to other sweeps — sized above the
 * worst-case processing time of a full page so only a dead tick, not a busy
 * one, lets another worker re-claim the same rows.
 */
const VISIBILITY_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Durable dispatcher + per-consumer ACK (D09). Claiming an outbox row fans out
 * one receipt per registered consumer and then marks the parent delivered so
 * the next scanner never races on the same `delivered` flag. Collaboration
 * realtime and notification projection ACK independently; a gateway outage
 * retries only the realtime receipt.
 */
export class CollaborationOutboxProjector {
  private readonly db: OrviloDatabase;
  private readonly outbox: EventOutboxModel;
  private readonly publisher: RoomPublisher;
  private readonly receipts: EventConsumerReceiptModel;
  private readonly notifications: NotificationProjectionService;

  constructor(db: OrviloDatabase, publisher: RoomPublisher = getRoomPublisher()) {
    this.db = db;
    this.outbox = new EventOutboxModel(db);
    this.publisher = publisher;
    this.receipts = new EventConsumerReceiptModel(db);
    this.notifications = new NotificationProjectionService(db);
  }

  /**
   * Fan-out pending outbox rows, then drain each consumer. A backlog larger
   * than one page still fully drains inside the same tick.
   */
  projectPending = async (limit = 200) => {
    const dispatched = await this.dispatchFanOut(limit);
    const realtime = await this.drainCollaboration(limit);
    const projected = await this.notifications.drainPending(limit);
    return { dispatched, projected, realtime };
  };

  private dispatchFanOut = async (limit: number) => {
    let dispatched = 0;
    for (;;) {
      const rows = await this.outbox.claimPending({
        limit,
        visibilityTimeoutMs: VISIBILITY_TIMEOUT_MS,
      });
      for (const row of rows) {
        try {
          await this.receipts.fanOut(this.db, { eventId: row.eventId, outboxId: row.id });
          await this.outbox.markDelivered(row.id);
          dispatched += 1;
        } catch (error) {
          await this.outbox.markFailed(row.id, { retryDelayMs: RETRY_DELAY_MS });
          log('fan-out failed for outbox %s: %O', row.id, error);
        }
      }
      if (rows.length < limit) return dispatched;
    }
  };

  private drainCollaboration = async (limit: number) => {
    let drained = 0;
    for (;;) {
      const claimed = await this.receipts.claimPending({
        consumer: EVENT_CONSUMERS.COLLABORATION_REALTIME,
        limit,
        visibilityTimeoutMs: VISIBILITY_TIMEOUT_MS,
      });
      for (const receipt of claimed) {
        try {
          const [row] = await this.db
            .select()
            .from(eventOutbox)
            .where(eq(eventOutbox.eventId, receipt.eventId))
            .limit(1);
          if (row) {
            for (const delivery of projectOutboxEvent(row)) {
              await this.publisher.publish(delivery.room, delivery.publish);
            }
          }
          await this.receipts.markDelivered(receipt.id);
          drained += 1;
        } catch (error) {
          await this.receipts.markFailed(receipt.id, { retryDelayMs: RETRY_DELAY_MS });
          log('collaboration receipt failed for event %s: %O', receipt.eventId, error);
        }
      }
      if (claimed.length < limit) return drained;
    }
  };
}
