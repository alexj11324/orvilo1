import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { tasks, taskTopics } from './task';

export interface TaskExecutionControl {
  activeHandoffId: string | null;
  leaseExpiresAt: number;
  leaseId: string;
  ownerId: string;
  registrationId: string;
  sessionId: string | null;
  state: 'registering' | 'running' | 'held' | 'stopped';
  supervisorId: string | null;
  treeId: string | null;
  version: 1;
}
export interface TaskExecutionProof {
  observedAt: number;
  pendingActions: number;
  remainingProcesses: number;
  supervisorId: string;
  treeId: string;
}
export interface TaskExecutionHandoffRecord {
  dispatchFence: number;
  dispatchId: string;
  generation: number;
  grantId: string;
  heldAt: number;
  leaseMs: number;
  operationId: string;
  policyRevision: number;
  proof?: TaskExecutionProof;
  source: TaskExecutionControl;
  sourceEpoch: number;
  stateRevision: number;
  successorLeaseId: string;
  successorOwnerId: string;
  successorRegistrationId: string;
}

/** Durable intent/history only. Live execution authority remains on task_topics. */
export const taskExecutionHandoffs = pgTable(
  'task_execution_handoffs',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    taskTopicId: uuid('task_topic_id')
      .notNull()
      .references(() => taskTopics.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').notNull(),
    userId: text('user_id').notNull(),
    phase: text('phase')
      .$type<'prepared' | 'quiescing' | 'quiescent' | 'transferred' | 'resumed'>()
      .notNull(),
    revision: integer('revision').notNull().default(0),
    record: jsonb('record').$type<TaskExecutionHandoffRecord>().notNull(),
  },
  (table) => [
    uniqueIndex('task_execution_handoffs_active')
      .on(table.taskId)
      .where(sql`${table.phase} <> 'resumed'`),
    check(
      'task_execution_handoffs_phase_check',
      sql`${table.phase} IN ('prepared','quiescing','quiescent','transferred','resumed')`,
    ),
  ],
);

/** Isolated acceptance DDL, not an installed production migration. */
export const TASK_EXECUTION_CONTROL_CANDIDATE_SQL = `
ALTER TABLE task_topics ADD COLUMN IF NOT EXISTS execution_control jsonb;
ALTER TABLE task_topics ADD COLUMN IF NOT EXISTS execution_control_revision integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS task_execution_handoffs (
 id text PRIMARY KEY, task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, task_topic_id uuid NOT NULL REFERENCES task_topics(id) ON DELETE CASCADE, workspace_id text NOT NULL,
 user_id text NOT NULL, phase text NOT NULL CHECK(phase IN ('prepared','quiescing','quiescent','transferred','resumed')), revision integer NOT NULL DEFAULT 0, record jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS task_execution_handoffs_active ON task_execution_handoffs(task_id) WHERE phase <> 'resumed';`;

/** Prepared execution accepts one command. This installer is for disposable tests, not production startup. */
export async function installTaskExecutionControlCandidate(db: {
  execute: (query: ReturnType<typeof sql.raw>) => Promise<unknown>;
}) {
  for (const statement of TASK_EXECUTION_CONTROL_CANDIDATE_SQL.split(';')) {
    const command = statement.trim();
    if (command) await db.execute(sql.raw(command));
  }
}
