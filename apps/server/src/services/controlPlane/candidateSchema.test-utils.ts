import { sql } from 'drizzle-orm';

import { TASK_EXECUTION_CONTROL_CANDIDATE_SQL } from '@/database/schemas/taskExecutionControl';
import type { OrviloDatabase } from '@/database/type';

/** Explicit disposable-test installer. Never called by a runtime or production startup. */
export async function installCandidateExecutionSchema(db: OrviloDatabase) {
  await db.execute(sql.raw(TASK_EXECUTION_CONTROL_CANDIDATE_SQL));
}
