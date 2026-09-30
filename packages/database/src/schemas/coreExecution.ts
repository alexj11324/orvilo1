import { bigint, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

/** Durable effect reservation. Authority stays in Orvilo; this row never expires a reservation. */
export const actionReceipts = pgTable(
  'action_receipts',
  {
    id: text('id').primaryKey(),
    reservationKey: text('reservation_key').notNull(),
    ownerToken: text('owner_token').notNull(),
    receipt: jsonb('receipt').notNull(),
  },
  (table) => [uniqueIndex('action_receipts_reservation_key_unique').on(table.reservationKey)],
);

/** Immutable authority snapshot. A later effect still requires fresh admission. */
export const coreSessionSnapshots = pgTable('core_session_snapshots', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  userId: text('user_id').notNull(),
  taskId: text('task_id').notNull(),
  topicId: text('topic_id').notNull(),
  registrationId: text('registration_id').notNull(),
  epoch: bigint('epoch', { mode: 'number' }).notNull(),
  capturedAt: bigint('captured_at', { mode: 'number' }).notNull(),
  digest: text('digest').notNull(),
  snapshot: jsonb('snapshot').notNull(),
});
