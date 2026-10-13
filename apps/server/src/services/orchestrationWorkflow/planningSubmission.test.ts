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
      judgment: {
        purpose: 'orchestrationWorkflow.criteriaDraft',
        outputMode: 'tool',
        intentKey: 'turn',
      },
    },
    metadata: { keep: 'existing' },
  });
});
afterEach(async () => {
  await db.delete(agentOperations).where(eq(agentOperations.id, operationId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
});

describe('planning result submission', () => {
  it('requires exact actor and scope even when workspace visibility permits reading the row', async () => {
    await expect(submitPlanningResult(db, userId, workspaceId, input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await db
      .update(agentOperations)
      .set({ workspaceId })
      .where(eq(agentOperations.id, operationId));
    await expect(submitPlanningResult(db, 'other-user', workspaceId, input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(submitPlanningResult(db, userId, workspaceId, input)).resolves.toEqual({
      success: true,
    });
  });
  it('records one validated result without losing operation metadata', async () => {
    await expect(submitPlanningResult(db, userId, undefined, input)).resolves.toEqual({
      success: true,
    });
    const op = await new AgentOperationModel(db, userId).findById(operationId);
    expect(op?.metadata).toEqual({ keep: 'existing', planningResult: input.result });
    await expect(submitPlanningResult(db, userId, undefined, input)).rejects.toMatchObject({
      message: 'ACP_PLANNING_ALREADY_SUBMITTED',
    });
  });
  it('rejects a different owner and a stale turn token', async () => {
    for (const [owner, token] of [
      ['other-user', 'turn'],
      [userId, 'other-turn'],
    ]) {
      await expect(
        submitPlanningResult(db, owner, undefined, { ...input, token }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });
  it('rejects invalid results before writing', async () => {
    await expect(
      submitPlanningResult(db, userId, undefined, {
        ...input,
        result: { title: 'Missing fields' },
      }),
    ).rejects.toMatchObject({ message: 'ACP_PLANNING_SCHEMA_MISMATCH' });
    expect((await new AgentOperationModel(db, userId).findById(operationId))?.metadata).toEqual({
      keep: 'existing',
    });
  });
  it('rejects a finished operation', async () => {
    await new AgentOperationModel(db, userId).recordCompletion(operationId, { status: 'done' });
    await expect(submitPlanningResult(db, userId, undefined, input)).rejects.toMatchObject({
      message: 'ACP_PLANNING_TURN_ENDED',
    });
  });
  it('only accepts one concurrent submission', async () => {
    const outcomes = await Promise.allSettled([
      submitPlanningResult(db, userId, undefined, input),
      submitPlanningResult(db, userId, undefined, input),
    ]);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  });
});
