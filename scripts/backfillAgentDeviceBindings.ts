/** bun scripts/backfillAgentDeviceBindings.ts [--apply] [--after=agt_ID] [--batch-size=100] */
import { parseArgs } from 'node:util';

import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { AgentModel } from '../packages/database/src/models/agent';
import * as schema from '../packages/database/src/schemas';
import type { OrviloDatabase } from '../packages/database/src/type';

/** Bounded keyset batches. Only stored host bindings or explicit builtin defaults are repaired. */
export const backfillAgentDeviceBindings = async (
  db: OrviloDatabase,
  options: { apply?: boolean; after?: string; batchSize?: number } = {},
) => {
  const batchSize = Math.min(500, Math.max(1, options.batchSize ?? 100));
  let cursor = options.after ?? '';
  const totals = { examined: 0, repaired: 0, blocked: 0, cursor };
  while (true) {
    const rows = await db
      .select()
      .from(schema.agents)
      .where(and(isNull(schema.agents.boundDeviceRowId), gt(schema.agents.id, cursor)))
      .orderBy(asc(schema.agents.id))
      .limit(batchSize);
    if (!rows.length) break;
    for (const agent of rows) {
      totals.examined++;
      try {
        if (options.apply) {
          if (agent.agencyConfig?.boundDeviceId) {
            // The trigger resolves the original explicit identity in the exact
            // authorized scope, including historical retired registry rows.
            await db
              .update(schema.agents)
              .set({
                agencyConfig: {
                  ...agent.agencyConfig,
                  executionTarget:
                    agent.agencyConfig.executionTarget === 'local' ? 'local' : 'device',
                },
              })
              .where(and(eq(schema.agents.id, agent.id), isNull(schema.agents.boundDeviceRowId)));
          } else {
            const model = new AgentModel(db, agent.userId, agent.workspaceId ?? undefined);
            const repaired = agent.slug ? await model.getBuiltinAgent(agent.slug) : null;
            if (!repaired?.boundDeviceRowId) throw new Error('Explicit runtime setup required');
          }
          totals.repaired++;
        }
      } catch {
        // Preserve history; do not guess an online host or delete an invalid row.
        totals.blocked++;
      }
      cursor = agent.id;
      totals.cursor = cursor;
    }
    console.info('agent-device-binding backfill', totals);
  }
  return totals;
};

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      'apply': { type: 'boolean', default: false },
      'after': { type: 'string' },
      'batch-size': { type: 'string' },
    },
  });
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.info(
      await backfillAgentDeviceBindings(drizzle(pool, { schema }) as OrviloDatabase, {
        apply: values.apply,
        after: values.after,
        batchSize: values['batch-size'] ? Number(values['batch-size']) : undefined,
      }),
    );
  } finally {
    await pool.end();
  }
}
