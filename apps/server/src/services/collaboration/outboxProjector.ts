import debug from 'debug';

import { EventOutboxModel } from '@/database/models/eventOutbox';
import type { LobeChatDatabase } from '@/database/type';

import { projectOutboxEvent } from './projection';
import { getRoomPublisher, type RoomPublisher } from './roomPublisher';

const log = debug('lobe-server:collaboration:outbox');

/** Backoff between retries for a row whose deliveries keep failing. */
const RETRY_DELAY_MS = 30_000;

/**
 * Durable fan-out half of the room contract: business writes commit outbox
 * rows in the same transaction, and this projector drains them into room
 * deliveries. Publishing is at-least-once — a row is only marked delivered
 * after every delivery it projected has been accepted by the publisher, so a
 * gateway outage pauses the tail instead of dropping events. Rows that keep
 * failing stay 'pending' with a deferred `nextAttemptAt` until the model's
 * attempt ceiling parks them 'failed' (reordering is acceptable: clients
 * converge through `snapshot`, not the stream).
 */
export class CollaborationOutboxProjector {
  private readonly db: LobeChatDatabase;
  private readonly outbox: EventOutboxModel;
  private readonly publisher: RoomPublisher;

  constructor(db: LobeChatDatabase, publisher: RoomPublisher = getRoomPublisher()) {
    this.db = db;
    this.outbox = new EventOutboxModel(db);
    this.publisher = publisher;
  }

  /** Drain up to `limit` due pending rows. Returns the number of rows drained. */
  projectPending = async (limit = 200) => {
    const rows = await this.outbox.fetchPending({ limit });

    let drained = 0;
    for (const row of rows) {
      try {
        for (const delivery of projectOutboxEvent(row)) {
          await this.publisher.publish(delivery.room, delivery.publish);
        }
        await this.outbox.markDelivered(row.id);
        drained += 1;
      } catch (error) {
        // Deferred retry — the next sweep picks the row up once its backoff
        // lapses. Log without payload so private room content never lands in
        // logs.
        await this.outbox.markFailed(row.id, { retryDelayMs: RETRY_DELAY_MS });
        log('projection failed for outbox %s: %O', row.id, error);
      }
    }
    return drained;
  };
}
