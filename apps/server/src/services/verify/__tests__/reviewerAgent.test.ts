// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import { agents, tasks, workspaceMembers, workspaces } from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cleanupTestUser,
  createTestUser,
} from '../../../routers/lambda/__tests__/integration/setup';
import { createVerifierAgentRunner } from '../agentVerifier';
import { resolveIssueReviewer } from '../reviewerAgent';

const { execAgent } = vi.hoisted(() => ({ execAgent: vi.fn() }));
vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn().mockImplementation(function () {
    return { execAgent };
  }),
}));

describe('Issue reviewer execution admission (server integration)', () => {
  let db: OrviloDatabase;
  let userId: string;
  let workspaceId: string;
  let taskId: string;
  let reviewerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = await getTestDB();
    userId = await createTestUser(db);
    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: 'Reviewer checks',
        primaryOwnerId: userId,
        slug: `reviewer-${crypto.randomUUID()}`,
      })
      .returning();
    workspaceId = workspace.id;
    await db.insert(workspaceMembers).values({ userId, workspaceId, role: 'owner' });
    const [agent] = await db
      .insert(agents)
      .values({
        userId,
        workspaceId,
        title: 'Issue reviewer',
        agencyConfig: { heterogeneousProvider: { type: 'codex' } },
      })
      .returning();
    reviewerId = agent.id;
    // Other available Agents must never supply an implicit reviewer.
    await db.insert(agents).values({ userId, workspaceId, title: 'Available assignee' });
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        workspaceId,
        name: 'Review delivery',
        instruction: 'Review the delivery',
        identifier: 'REVIEW-1',
        seq: 1,
      })
      .returning();
    taskId = task.id;
  });
  afterEach(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await cleanupTestUser(db, userId);
  });
  const run = () =>
    createVerifierAgentRunner({ db, userId, workspaceId, taskId, deliverable: 'delivery' })!({
      operationId: 'parent',
      goal: 'goal',
      checkItem: {
        id: 'check',
        index: 0,
        title: 'criterion',
        required: true,
        onFail: 'manual',
        verifierType: 'agent',
        verifierConfig: {},
      },
    });

  it('starts zero runs when no Issue reviewer is selected', async () => {
    expect(run).toThrow('Standalone Acceptance/Verify is retired');
    expect(execAgent).not.toHaveBeenCalled();
  });
  it('starts zero runs when the selected runtime cannot mount the result tool', async () => {
    await db.update(tasks).set({ reviewerAgentId: reviewerId }).where(eq(tasks.id, taskId));
    await db
      .update(agents)
      .set({ agencyConfig: { heterogeneousProvider: { type: 'pi' } } })
      .where(eq(agents.id, reviewerId));
    expect(run).toThrow('Standalone Acceptance/Verify is retired');
    expect(execAgent).not.toHaveBeenCalled();
  });
  it('reads the current Issue binding rather than a parent or acceptance default', async () => {
    await db.update(tasks).set({ reviewerAgentId: reviewerId }).where(eq(tasks.id, taskId));
    await expect(resolveIssueReviewer(db, userId, taskId, workspaceId)).resolves.toBe(reviewerId);
    await db.update(tasks).set({ reviewerAgentId: null }).where(eq(tasks.id, taskId));
    expect(run).toThrow('Standalone Acceptance/Verify is retired');
    expect(execAgent).not.toHaveBeenCalled();
  });
});
