import type { EventDispatchAdmission } from '@orvilo/agent-execution/controlPlane';

import type { McpEventsDatabase } from './database';
import { createMcpEventsSql } from './database';
import { SqlMcpEventBindingRepository, SqlMcpEventInbox } from './inbox';
import { McpEventReceiver } from './receiver';
import { McpEventWorker } from './worker';
import { SqlMcpEventWorkRepository } from './workerRepository';

/** Receive only: acknowledgement never depends on starting an agent process. */
export function createMcpEventReceiver(db: McpEventsDatabase) {
  const database = createMcpEventsSql(db);
  return new McpEventReceiver({
    bindings: new SqlMcpEventBindingRepository(database),
    inbox: new SqlMcpEventInbox(database),
  });
}

/** Called by the existing task watchdog, never by a second polling runner. */
export async function sweepMcpEventInbox(
  db: McpEventsDatabase,
  admission?: EventDispatchAdmission,
) {
  // The canonical port is optional and is not fabricated from TaskRunner.
  // Until an authoritative adapter is installed, admission waits.
  // Do not burn finite delivery retries while that adapter is absent.
  if (!admission) {
    return {
      claimed: 0,
      completed: 0,
      retried: 0,
      status: 'waiting',
      reason: 'runtime-unavailable',
    };
  }
  const database = createMcpEventsSql(db);
  return new McpEventWorker({
    admission,
    inbox: new SqlMcpEventInbox(database),
    repository: new SqlMcpEventWorkRepository(database),
  }).pump();
}
