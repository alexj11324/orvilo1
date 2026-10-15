// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { GoalModel } from '@/database/models/goal';
import { GoalGraphModel } from '@/database/models/goalGraph';
import {
  agentOperations,
  goalEdges,
  goalEvents,
  goalNodes,
  goals,
  tasks,
  users,
} from '@/database/schemas';
import { goalRouter } from '@/server/routers/lambda/goal';

import { GoalManagerService } from './manager';
import { submitPlanningResult } from './planningSubmission';

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => db }));
vi.mock('@/libs/oidc-provider/access-control', () => ({ assertOIDCUserActive: async () => {} }));
vi.mock('@/database/models/rbac', () => ({
  RbacModel: class {
    hasAnyPermission = async () => true;
  },
}));
const db = await getTestDB();
const userId = 'goal-retired-api-owner';
const snapshot = () =>
  Promise.all(
    [goals, goalNodes, goalEdges, goalEvents, tasks, agentOperations].map((table) =>
      db.select().from(table),
    ),
  );

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values({ id: userId });
});
afterEach(async () => {
  await db.delete(users);
});

const operationCaller = () =>
  goalRouter.createCaller({
    oidcAuth: {
      payload: {},
      aud: 'urn:orvilo:hetero-operation',
      capabilities: ['hetero:ingest'],
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      iss: 'urn:orvilo:internal',
      jti: 'retired-plan',
      operation_id: 'old-operation',
      purpose: 'hetero-operation',
      sub: userId,
    },
  });

describe('retired Goal API and manager boundaries', () => {
  it('rejects all 20 writers including operation-token submissions with an unchanged ledger', async () => {
    const caller = goalRouter.createCaller({ userId });
    const mutations = Object.entries(goalRouter._def.procedures)
      .filter(([, procedure]) => procedure._def.type === 'mutation')
      .map(([name]) => name);
    expect(mutations).toHaveLength(20);
    const before = await snapshot();
    for (const name of mutations) {
      const selected = name.startsWith('submitOperation') ? operationCaller() : caller;
      const method = (selected as unknown as Record<string, (input: unknown) => Promise<unknown>>)[
        name
      ];
      await expect(method({})).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    }
    expect(await snapshot()).toEqual(before);
  });
  it('preserves authenticated graph and supervision queries', async () => {
    const goal = await new GoalModel(db, userId).create({ title: 'Recorded goal' });
    await new GoalGraphModel(db, userId).createNode(goal.id, {
      kind: 'finding',
      title: 'Recorded finding',
    });
    const caller = goalRouter.createCaller({ userId });
    expect((await caller.graph({ id: goal.id })).data.nodes[0].title).toBe('Recorded finding');
    expect((await caller.supervision({ id: goal.id })).success).toBe(true);
    expect((await caller.list({})).goals[0].goal.id).toBe(goal.id);
  });
  it('rejects stale direct manager and draft calls before using the database', async () => {
    const before = await snapshot();
    const manager = new GoalManagerService(db, userId);
    await expect(
      manager.submit('old-goal', 'old-token', 'old-operation', {
        action: 'verify',
        reason: 'Late result',
      }),
    ).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    await expect(
      submitPlanningResult(db, userId, undefined, {
        operationId: 'old-operation',
        token: 'old-token',
        result: {},
      }),
    ).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    expect(await snapshot()).toEqual(before);
  });
});
