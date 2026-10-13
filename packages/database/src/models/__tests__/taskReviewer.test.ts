// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  tasks,
  teams,
  teamWorkflowStates,
  users,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { AgentModel } from '../agent';
import { TaskModel } from '../task';

const db = await getTestDB();
const userId = 'task-reviewer-user';
const otherUserId = 'task-reviewer-other';
const reviewerId = 'task-reviewer-agent';
let model: TaskModel;

beforeEach(async () => {
  await db.delete(tasks);
  await db.delete(users);
  await db.insert(users).values([{ id: userId }, { id: otherUserId }]);
  await db.insert(agents).values({ id: reviewerId, slug: reviewerId, userId });
  model = new TaskModel(db, userId);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete(tasks);
  await db.delete(users);
});

describe('Issue reviewer Agent invariant', () => {
  it('rejects creating an Issue in review without an explicit reviewer', async () => {
    await expect(
      model.create({ instruction: 'Review me', workflowCategory: 'in_review' }),
    ).rejects.toThrow('TASK_REVIEWER_REQUIRED');
  });

  it('rejects review entry and reviewer clearing through shared writers', async () => {
    const issue = await model.create({ instruction: 'Review me' });
    await expect(model.update(issue.id, { workflowCategory: 'in_review' })).rejects.toThrow(
      'TASK_REVIEWER_REQUIRED',
    );
    await model.update(issue.id, { reviewerAgentId: reviewerId, workflowCategory: 'in_review' });
    await expect(model.update(issue.id, { reviewerAgentId: null })).rejects.toThrow(
      'TASK_REVIEWER_REQUIRED',
    );
    expect((await model.findById(issue.id))?.reviewerAgentId).toBe(reviewerId);
  });

  it('validates review entry in every conditional and bulk status writer', async () => {
    const issue = await model.create({ instruction: 'Review me' });
    await expect(
      model.updateStatusIfCurrent(issue.id, 'backlog', 'paused', {
        workflowCategory: 'in_review',
      }),
    ).rejects.toThrow('TASK_REVIEWER_REQUIRED');
    await model.update(issue.id, { runReservationId: 'review-reservation' });
    await expect(
      model.updateStatusIfReservation(issue.id, 'review-reservation', 'backlog', 'paused', {
        workflowCategory: 'in_review',
      }),
    ).rejects.toThrow('TASK_REVIEWER_REQUIRED');
    await expect(
      model.updateStatusForExecutionContract(
        issue.id,
        'paused',
        {
          assigneeAgentId: null,
          executionGeneration: issue.executionGeneration,
          policyRevision: issue.policyRevision,
          requirementRevision: issue.requirementRevision,
        },
        { workflowCategory: 'in_review' },
      ),
    ).rejects.toThrow('TASK_REVIEWER_REQUIRED');
    await expect(
      model.updateStatusForIds([issue.id], 'paused', { workflowCategory: 'in_review' }),
    ).rejects.toThrow('TASK_REVIEWER_REQUIRED');
  });

  it('keeps obsolete execution contracts and reservations as no-op writes', async () => {
    const issue = await model.create({ instruction: 'Review me' });
    await expect(
      model.updateStatusForExecutionContract(
        issue.id,
        'paused',
        {
          assigneeAgentId: null,
          executionGeneration: issue.executionGeneration + 1,
          policyRevision: issue.policyRevision,
          requirementRevision: issue.requirementRevision,
        },
        { workflowCategory: 'in_review' },
      ),
    ).resolves.toBeNull();
    await expect(
      model.updateStatusIfReservation(issue.id, 'obsolete-reservation', 'backlog', 'paused', {
        workflowCategory: 'in_review',
      }),
    ).resolves.toBeNull();
    expect((await model.findById(issue.id))?.workflowCategory).toBe('backlog');
  });

  it('does not infer a reviewer from a pause, assignee, or creator', async () => {
    const issue = await model.create({ instruction: 'Pause me', assigneeUserId: userId });
    expect((await model.update(issue.id, { status: 'paused' }))?.reviewerAgentId).toBeNull();
  });

  it('rejects a reviewer outside the Issue scope', async () => {
    await db
      .insert(agents)
      .values({ id: 'foreign-reviewer', slug: 'foreign-reviewer', userId: otherUserId });
    await expect(
      model.create({ instruction: 'Review me', reviewerAgentId: 'foreign-reviewer' }),
    ).rejects.toThrow('Reviewer Agent not found');
  });

  it('enforces review ownership even when bypassing TaskModel', async () => {
    const issue = await model.create({ instruction: 'Review me' });
    await expect(
      db.update(tasks).set({ workflowCategory: 'in_review' }).where(eq(tasks.id, issue.id)),
    ).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'tasks_in_review_reviewer_required' },
    });
  });

  it('enforces the invariant for a custom team state mapped to In Review', async () => {
    await db
      .insert(workspaces)
      .values({ id: 'review-ws', name: 'Review', slug: 'review-ws', primaryOwnerId: userId });
    await db.insert(workspaceMembers).values({ workspaceId: 'review-ws', userId, role: 'owner' });
    await db
      .insert(teams)
      .values({ id: 'review-team', key: 'RV', name: 'Review team', workspaceId: 'review-ws' });
    const [state] = await db
      .insert(teamWorkflowStates)
      .values({
        category: 'in_review',
        name: 'Quality audit',
        position: 1,
        teamId: 'review-team',
        workspaceId: 'review-ws',
      })
      .returning();
    const scoped = new TaskModel(db, userId, 'review-ws');
    const issue = await scoped.create({ instruction: 'Review me', teamId: 'review-team' });
    await expect(
      scoped.update(issue.id, { workflowCategory: 'in_review', workflowStateRefId: state.id }),
    ).rejects.toThrow('TASK_REVIEWER_REQUIRED');
    await expect(
      db
        .update(tasks)
        .set({ workflowCategory: 'in_review', workflowStateRefId: state.id })
        .where(eq(tasks.id, issue.id)),
    ).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'tasks_in_review_reviewer_required' },
    });
  });

  it('copies a reviewed Issue as fresh work and rejects moving review without a destination reviewer', async () => {
    const issue = await model.create({
      instruction: 'Review me',
      reviewerAgentId: reviewerId,
      workflowCategory: 'in_review',
    });
    const copy = await model.copyToWorkspace(issue.id, null, userId);
    expect(await model.findById(copy.rootId)).toMatchObject({
      workflowCategory: 'backlog',
      reviewerAgentId: null,
    });
    await expect(model.transferTo(issue.id, null, otherUserId)).rejects.toThrow(
      'TASK_REVIEWER_REQUIRED',
    );
    expect((await model.findById(issue.id))?.createdByUserId).toBe(userId);
  });

  it('keeps reviewer scope locked between personal creation validation and insertion', async () => {
    await db.insert(workspaces).values({
      id: 'create-review-ws',
      name: 'Review destination',
      slug: 'create-review-ws',
      primaryOwnerId: userId,
    });
    const validation = model as unknown as {
      assertReviewerAgent: (db: OrviloDatabase, reviewerAgentId?: string | null) => Promise<void>;
    };
    const original = validation.assertReviewerAgent.bind(model);
    let transfer: Promise<boolean> | undefined;
    vi.spyOn(validation, 'assertReviewerAgent').mockImplementation(async (runner, agentId) => {
      await original(runner, agentId);
      transfer = new AgentModel(db, userId)
        .transferAgents([reviewerId], 'create-review-ws', userId)
        .then(
          () => true,
          () => false,
        );
      // Interleave the transfer after validation, while create still holds its reviewer lock.
      await Promise.race([transfer, new Promise((resolve) => setTimeout(resolve, 500))]);
    });
    const issue = await model.create({
      instruction: 'Review me',
      reviewerAgentId: reviewerId,
      workflowCategory: 'in_review',
    });
    expect(await transfer).toBe(false);
    const [reviewer] = await db.select().from(agents).where(eq(agents.id, reviewerId));
    expect(reviewer.workspaceId).toBe(issue.workspaceId);
  });

  it('only transfers reviewer-bound work when its reviewer stays in the destination scope', async () => {
    await db.insert(workspaces).values({
      id: 'transfer-review-ws',
      name: 'Review destination',
      slug: 'transfer-review-ws',
      primaryOwnerId: userId,
    });
    await db.insert(agents).values({ id: 'review-executor', slug: 'review-executor', userId });
    const issue = await model.create({
      instruction: 'Review me',
      name: 'Keep reviewer',
      assigneeAgentId: 'review-executor',
      reviewerAgentId: reviewerId,
      workflowCategory: 'in_review',
    });
    const agentModel = new AgentModel(db, userId);
    await expect(
      agentModel.transferAgents(['review-executor'], 'transfer-review-ws', userId),
    ).rejects.toThrow(`${issue.identifier} (Keep reviewer)`);
    expect((await model.findById(issue.id))?.workspaceId).toBeNull();
    await agentModel.transferAgents(['review-executor', reviewerId], 'transfer-review-ws', userId);
    const [moved] = await db.select().from(tasks).where(eq(tasks.id, issue.id));
    expect(moved).toMatchObject({ workspaceId: 'transfer-review-ws', reviewerAgentId: reviewerId });
  });

  it('reports Issue identifiers and titles before deleting a reviewer Agent', async () => {
    const issue = await model.create({
      instruction: 'Review me',
      name: 'Release acceptance',
      reviewerAgentId: reviewerId,
      workflowCategory: 'in_review',
    });
    await expect(new AgentModel(db, userId).delete(reviewerId)).rejects.toThrow(
      `${issue.identifier} (Release acceptance)`,
    );
    expect((await model.findById(issue.id))?.reviewerAgentId).toBe(reviewerId);
    await model.update(issue.id, { workflowCategory: 'todo', reviewerAgentId: null });
    await new AgentModel(db, userId).delete(reviewerId);
    expect(await db.select().from(agents).where(eq(agents.id, reviewerId))).toEqual([]);
  });
});
