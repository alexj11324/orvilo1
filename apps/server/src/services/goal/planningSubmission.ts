import type { GenerateObjectSchema } from '@orvilo/model-runtime';
import {
  GOAL_CRITERIA_DRAFT_JSON_SCHEMA,
  GOAL_DECOMPOSE_JSON_SCHEMA,
  GOAL_EXPLORE_JSON_SCHEMA,
} from '@orvilo/prompts';
import { TRPCError } from '@trpc/server';
import Ajv from 'ajv';
import { and, eq, sql } from 'drizzle-orm';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { agentOperations } from '@/database/schemas/agentOperations';
import type { OrviloDatabase } from '@/database/type';

import { assertGoalExecutionAvailable } from './retirement';

const schemas = new Map<string, GenerateObjectSchema>([
  ['goal.criteriaDraft', GOAL_CRITERIA_DRAFT_JSON_SCHEMA],
  ['goal.decompose', GOAL_DECOMPOSE_JSON_SCHEMA],
  ['goal.explore', GOAL_EXPLORE_JSON_SCHEMA],
]);
const ajv = new Ajv({ allErrors: true, strict: false });

/** An operation may submit only its own server-issued planning round, once. */
export const submitPlanningResult = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId: string | undefined,
  input: { operationId: string; token: string; result: unknown },
) => {
  assertGoalExecutionAvailable();
  const operation = await new AgentOperationModel(db, userId, workspaceId).findById(
    input.operationId,
  );
  const judgment = operation?.appContext?.judgment;
  const schema = judgment && schemas.get(judgment.purpose);
  if (
    !operation ||
    operation.userId !== userId ||
    operation.workspaceId !== (workspaceId ?? null) ||
    judgment?.outputMode !== 'tool' ||
    judgment.intentKey !== input.token ||
    !schema
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'ACP_PLANNING_SUBMISSION_FORBIDDEN' });
  }
  if (operation.status !== 'running') {
    throw new TRPCError({ code: 'CONFLICT', message: 'ACP_PLANNING_TURN_ENDED' });
  }
  if (!ajv.validate(schema.schema, input.result)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'ACP_PLANNING_SCHEMA_MISMATCH' });
  }
  // Compare-and-set prevents two submissions from replacing a previously accepted result.
  const rows = await db
    .update(agentOperations)
    .set({
      metadata: sql`coalesce(${agentOperations.metadata}, '{}'::jsonb) || ${JSON.stringify({ planningResult: input.result })}::jsonb`,
    })
    .where(
      and(
        eq(agentOperations.id, operation.id),
        eq(agentOperations.userId, userId),
        sql`${agentOperations.workspaceId} IS NOT DISTINCT FROM ${workspaceId ?? null}`,
        eq(agentOperations.status, 'running'),
        sql`${agentOperations.metadata}->'planningResult' IS NULL`,
      ),
    )
    .returning({ id: agentOperations.id });
  if (!rows.length) {
    throw new TRPCError({ code: 'CONFLICT', message: 'ACP_PLANNING_ALREADY_SUBMITTED' });
  }
  return { success: true as const };
};
