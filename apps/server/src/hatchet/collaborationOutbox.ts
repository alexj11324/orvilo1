import type { HatchetClient, InputType } from '@hatchet-dev/typescript-sdk/v1';
import { z } from 'zod';

import { getServerDB } from '@/database/server';
import { AutomationResultDeliveryService } from '@/server/services/automationResultDelivery';
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

  // Result output failures retry only this durable stage. They neither
  // restart Agents nor block room/notification projection.
  const automationResultOutputSweep = hatchet.task({
    name: HATCHET_TASK_NAMES.automationResultOutputSweep,
    executionTimeout: '2m',
    fn: async (input: { createdByUserId?: string; workspaceId?: string } & InputType) => ({
      outputsProcessed: await AutomationResultDeliveryService.recoverDue(
        await getServerDB(),
        input,
      ),
    }),
    inputValidator: z.object({
      createdByUserId: z.string().optional(),
      workspaceId: z.string().optional(),
    }),
    onCrons: ['* * * * *'],
    retries: 3,
  });

  return [collaborationOutboxSweep, automationResultOutputSweep];
};
