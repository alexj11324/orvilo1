import type { HatchetClient } from '@hatchet-dev/typescript-sdk/v1';

import { getServerDB } from '@/database/server';
import { CollaborationOutboxProjector } from '@/server/services/collaboration';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';

export const createCollaborationHatchetTasks = (hatchet: HatchetClient) => {
  // Outbox → room projection. Runs on the same worker as the core tasks; a
  // dedicated worker can pick it up later by name without code changes.
  const collaborationOutboxSweep = hatchet.task({
    name: HATCHET_TASK_NAMES.collaborationOutboxSweep,
    executionTimeout: '10m',
    fn: async () => {
      const db = await getServerDB();
      return new CollaborationOutboxProjector(db).projectPending();
    },
    onCrons: ['* * * * *'],
    retries: 3,
  });

  return [collaborationOutboxSweep];
};
