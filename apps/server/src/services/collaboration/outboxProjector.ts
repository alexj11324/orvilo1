import debug from 'debug';
import { and, asc, eq, isNull } from 'drizzle-orm';

import type { LobeChatDatabase } from '@/database/type';

import { eventOutbox } from './contractTables';
import { projectOutboxEvent, type OutboxEventRow } from './projection';
import { getRoomPublisher, type RoomPublisher } from './roomPublisher';

const log = debug('lobe-server:collaboration:outbox');

/**
 * Durable fan-out half of the room contract: business writes commit outbox
 * rows in the same transaction, and this projector drains them into room
 * deliveries. Publishing is at-least-once — a row is only marked published
 * after every delivery it projected has been accepted by the publisher, so a
 * gateway outage pauses the tail instead of dropping events. Rows that keep
 * failing are left unpublished and retried on the next sweep (reordering is
 * acceptable: clients converge through `snapshot`, not the stream).
 */
export class CollaborationOutboxProjector {
  private readonly db: LobeChatDatabase;
  private readonly publisher: RoomPublisher;

  constructor(db: LobeChatDatabase, publisher: RoomPublisher = getRoomPublisher()) {
    this.db = db;
    this.publisher = publisher;
  }

  /** Drain up to `limit` unpublished rows. Returns the number of rows drained. */
  projectPending = async (limit = 200) => {
    const rows = (await this.db
      .select()
      .from(eventOutbox)
      .where(isNull(eventOutbox.publishedAt))
      .orderBy(asc(eventOutbox.createdAt))
      .limit(limit)) as unknown as (OutboxEventRow & { id: string })[];

    let drained = 0;
    for (const row of rows) {
      try {
        for (const delivery of projectOutboxEvent(row)) {
          await this.publisher.publish(delivery.room, delivery.publish);
        }
        await this.markPublished(row.id);
        drained += 1;
      } catch (error) {
        // Leave unpublished — the next sweep retries. Log without payload so
        // private room content never lands in logs.
        log('projection failed for outbox %s: %O', row.id, error);
      }
    }
    return drained;
  };

  private markPublished = async (id: string) => {
    await this.db
      .update(eventOutbox)
      .set({ publishedAt: new Date() })
      .where(and(eq(eventOutbox.id, id), isNull(eventOutbox.publishedAt)));
  };
}
