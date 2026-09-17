import { boolean, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { timestamps, timestamptz } from './_helpers';
import { hatchetDispatches } from './hatchetDispatch';

/**
 * Completed logical steps for a Hatchet dispatch.
 *
 * Hatchet retries a task from its function entry point. Keeping the completed
 * step output outside the dispatch payload lets the provider-neutral workflow
 * context replay a completed step without invoking its side effects again once
 * the checkpoint has been committed.
 */
export const hatchetWorkflowSteps = pgTable(
  'hatchet_workflow_steps',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    dispatchId: uuid('dispatch_id')
      .references(() => hatchetDispatches.id, { onDelete: 'cascade' })
      .notNull(),
    stepName: text('step_name').notNull(),
    status: text('status').$type<'completed' | 'running'>().notNull().default('running'),
    ownerToken: text('owner_token').notNull(),
    leaseExpiresAt: timestamptz('lease_expires_at').notNull(),
    result: jsonb('result'),
    resultIsUndefined: boolean('result_is_undefined').notNull().default(false),
    completedAt: timestamptz('completed_at'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('hatchet_workflow_steps_dispatch_id_step_name_unique').on(t.dispatchId, t.stepName),
    index('hatchet_workflow_steps_lease_idx').on(t.status, t.leaseExpiresAt),
  ],
);

export type HatchetWorkflowStepItem = typeof hatchetWorkflowSteps.$inferSelect;
export type NewHatchetWorkflowStepItem = typeof hatchetWorkflowSteps.$inferInsert;
