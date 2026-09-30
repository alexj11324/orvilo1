import type { McpEventsDatabase } from './database';
import { createMcpEventsSql } from './database';
import { SqlMcpEventBindingRepository, SqlMcpEventInbox } from './inbox';
import { McpEventReceiver } from './receiver';
import type { McpEventDispatchAdmission } from './worker';
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
  admission?: McpEventDispatchAdmission,
) {
  // The optional core port is intentionally not fabricated from TaskRunner.
  // Until the authoritative core adapter is installed, worker admission waits.
  // Do not burn finite delivery retries while a required deployment is absent.
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
