import type { EventDispatchAdmission } from '@orvilo/agent-execution/controlPlane';

import { TaskModel } from '@/database/models/task';
import { getServerDB } from '@/database/server';
import type { OrviloDatabase } from '@/database/type';
import { snapshotAutomationDefinition } from '@/database/utils/automationOccurrence';
import { appEnv } from '@/envs/app';
import { enqueueHatchetTask } from '@/libs/hatchet';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';

import { McpEventDispatchAdmissionService } from './admission';
import type { McpEventsDatabase } from './database';
import { createMcpEventsSql } from './database';
import { SqlMcpEventBindingRepository, SqlMcpEventInbox } from './inbox';
import { McpEventReceiver } from './receiver';
import { McpEventWorker } from './worker';
import { recordMcpEventWorkerHealth } from './workerHealth';
import { SqlMcpEventWorkRepository } from './workerRepository';

/** Receive only: acknowledgement never depends on starting an agent process. */
export function createMcpEventReceiver(db: McpEventsDatabase) {
  const database = createMcpEventsSql(db);
  return new McpEventReceiver({
    bindings: new SqlMcpEventBindingRepository(database),
    inbox: new SqlMcpEventInbox(database),
  });
}

/** Shared by the Hatchet consumer and the watchdog recovery pass. */
export async function sweepMcpEventInbox(db: OrviloDatabase, admission?: EventDispatchAdmission) {
  // The authoritative server adapter is the default; tests may substitute a
  // fake, but there is no path that enters dispatch without durable evidence.
  const resolved = admission ?? new McpEventDispatchAdmissionService(db);
  const database = createMcpEventsSql(db);
  return new McpEventWorker({
    admission: resolved,
    inbox: new SqlMcpEventInbox(database),
    repository: new SqlMcpEventWorkRepository(database, async (trigger) => {
      const task = await new TaskModel(db, trigger.userId, trigger.workspaceId).findById(
        trigger.taskId,
      );
      if (!task) throw new Error('Automation definition unavailable');
      return snapshotAutomationDefinition(task);
    }),
  }).pump();
}

/** The SQL inbox is the recovery source if enqueue loses its acknowledgement. */
export async function scheduleMcpEventInboxSweep() {
  if (!appEnv.enableQueueAgentRuntime) {
    const { wakeLocalEventInboxLoop } = await import('./localLoop');
    wakeLocalEventInboxLoop();
    return 'local-event-inbox';
  }
  return enqueueHatchetTask(HATCHET_TASK_NAMES.mcpEventInboxSweep, {});
}

/** Only an actual worker invocation records readiness; configured credentials do not. */
export async function runMcpEventInboxSweep() {
  try {
    const result = await sweepMcpEventInbox(await getServerDB());
    await recordMcpEventWorkerHealth(
      result.claimed === result.completed + result.retried ? 'ready' : 'unavailable',
    );
    return result;
  } catch (error) {
    await recordMcpEventWorkerHealth('unavailable');
    throw error;
  }
}
