import { sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { tasks } from '../schemas/task';
import type { OrviloDatabase } from '../type';

/** #769 has no existing users or row migration. Only fresh disposable test databases call this. */
export const initializeFreshTaskReviewerSchema = async (db: OrviloDatabase): Promise<void> => {
  const [existing] = await db.select({ id: tasks.id }).from(tasks).limit(1);
  if (existing)
    throw new Error('Fresh reviewer schema initialization requires an empty tasks table');

  await db.transaction(async (tx) => {
    await tx.execute(sql`ALTER TABLE tasks DROP COLUMN IF EXISTS reviewer_user_id`);
    await tx.execute(sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewer_agent_id text`);
    await tx.execute(
      sql`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_reviewer_agent_id_agents_id_fk`,
    );
    await tx.execute(
      sql`ALTER TABLE tasks ADD CONSTRAINT tasks_reviewer_agent_id_agents_id_fk FOREIGN KEY (reviewer_agent_id) REFERENCES agents(id) ON DELETE SET NULL`,
    );
    const constraint = getTableConfig(tasks).checks.find(
      (item) => item.name === 'tasks_in_review_reviewer_required',
    )!;
    await tx.execute(
      sql`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_in_review_reviewer_required`,
    );
    await tx.execute(
      sql`ALTER TABLE tasks ADD CONSTRAINT tasks_in_review_reviewer_required CHECK (${constraint.value})`,
    );
  });
};
