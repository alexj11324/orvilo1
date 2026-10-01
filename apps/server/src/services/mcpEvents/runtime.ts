import type { EventDispatchAdmission } from '@orvilo/agent-execution/controlPlane';

import type { OrviloDatabase } from '@/database/type';

import { McpEventDispatchAdmissionService } from './admission';
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
export async function sweepMcpEventInbox(db: OrviloDatabase, admission?: EventDispatchAdmission) {
  // The authoritative server adapter is the default; tests may substitute a
  // fake, but there is no path that enters dispatch without durable evidence.
  const resolved = admission ?? new McpEventDispatchAdmissionService(db);
  const database = createMcpEventsSql(db);
  return new McpEventWorker({
    admission: resolved,
    inbox: new SqlMcpEventInbox(database),
    repository: new SqlMcpEventWorkRepository(database),
  }).pump();
}
