import type { HatchetDispatchPayload, HatchetDispatchStatus } from '@orvilo/types';
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';

export const hatchetDispatches = pgTable(
  'hatchet_dispatches',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),

    deduplicationKey: text('deduplication_key').notNull(),
    status: text('status').$type<HatchetDispatchStatus>().notNull().default('pending'),
    laneKey: text('lane_key').notNull(),
    payload: jsonb('payload').$type<HatchetDispatchPayload>().notNull(),
    providerRunId: text('provider_run_id'),
    error: text('error'),

    ...timestamps,
  },
  (t) => [
    index('hatchet_dispatches_status_updated_at_idx').on(t.status, t.updatedAt),
    uniqueIndex('hatchet_dispatches_active_deduplication_key_unique')
      .on(t.deduplicationKey)
      .where(sql`${t.status} IN ('pending', 'queued', 'running')`),
  ],
);

export type HatchetDispatchItem = typeof hatchetDispatches.$inferSelect;
export type NewHatchetDispatchItem = typeof hatchetDispatches.$inferInsert;
