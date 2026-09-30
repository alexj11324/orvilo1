import { installTaskExecutionControlCandidate } from '@/database/schemas/taskExecutionControl';
import type { OrviloDatabase } from '@/database/type';

/** Explicit disposable-test installer. Never called by a runtime or production startup. */
export async function installCandidateExecutionSchema(db: OrviloDatabase) {
  await installTaskExecutionControlCandidate(db);
}
