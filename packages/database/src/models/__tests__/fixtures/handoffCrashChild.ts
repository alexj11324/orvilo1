/** Trusted test worker, never a runtime kernel or production host. */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../../../schemas';
import type { OrviloDatabase } from '../../../type';
import type { HandoffIntent, RuntimeRunBinding } from '../../taskExecutionControl';
import { TaskExecutionControlModel } from '../../taskExecutionControl';

async function main() {
  const input = JSON.parse(process.env.HANDOFF_CRASH_INPUT!) as {
    binding: RuntimeRunBinding;
    intent: HandoffIntent;
    stage: 'prepared' | 'quiescing' | 'quiescent' | 'transferred' | 'resumed';
  };
  const pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 1 });
  const db = drizzle(pool, { schema }) as unknown as OrviloDatabase;
  const model = new TaskExecutionControlModel(db, input.binding.userId, input.binding.workspaceId);
  const identity = {
    treeId: 'source-tree',
    supervisorId: 'trusted-supervisor',
    sessionId: 'source-session',
  };
  switch (input.stage) {
    case 'prepared': {
      await model.beginHandoff(input.binding, input.intent);
      break;
    }
    case 'quiescing': {
      await model.advance(input.intent.id, 0, 'quiescing');
      break;
    }
    case 'quiescent': {
      await model.advance(input.intent.id, 1, 'quiescent', {
        ...identity,
        observedAt: Date.now(),
        remainingProcesses: 0,
        pendingActions: 0,
      });
      break;
    }
    case 'transferred': {
      await model.transfer(input.intent.id, 2);
      break;
    }
    case 'resumed': {
      await model.resume(input.intent.id, 3, { ...identity, treeId: 'successor-tree' });
      break;
    }
  }
  process.send?.({
    phase: (await model.read(input.intent.id))?.phase,
    snapshot: await model.readControl(input.binding),
  });
  // Parent kills this exact process after receiving the committed snapshot. Keep
  // its real DB connection open so SIGKILL exercises abrupt client disappearance.
  setInterval(() => undefined, 1000);
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
  process.disconnect?.();
});
