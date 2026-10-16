// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { AgentOperationModel } from '@/database/models/agentOperation';
import { agentOperations, users, workspaces } from '@/database/schemas';

import { submitPlanningResult } from './planningSubmission';

const db = await getTestDB();
const userId = 'planning-submission-user';
const operationId = 'planning-submission-op';
const workspaceId = 'planning-submission-workspace';
const input = {
  operationId,
  token: 'turn',
  result: { title: 'Release', instruction: 'Ship it', criteria: [] },
};
beforeEach(async () => {
  await db.insert(users).values({ id: userId }).onConflictDoNothing();
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: 'Planning', slug: workspaceId, primaryOwnerId: userId })
    .onConflictDoNothing();
  await new AgentOperationModel(db, userId).recordStart({
    operationId,
    appContext: {
      judgment: { purpose: 'goal.criteriaDraft', outputMode: 'tool', intentKey: 'turn' },
    },
    metadata: { keep: 'existing' },
  });
});
afterEach(async () => {
  await db.delete(agentOperations).where(eq(agentOperations.id, operationId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
});

describe('retired planning result submission', () => {
  it('rejects even a valid live operation token without changing operation metadata', async () => {
    const before = await db
      .select()
      .from(agentOperations)
      .where(eq(agentOperations.id, operationId));
    await expect(submitPlanningResult(db, userId, undefined, input)).rejects.toMatchObject({
      code: 'METHOD_NOT_SUPPORTED',
    });
    expect(
      await db.select().from(agentOperations).where(eq(agentOperations.id, operationId)),
    ).toEqual(before);
  });
});
