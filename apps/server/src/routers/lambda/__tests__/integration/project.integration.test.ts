// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import { agents, knowledgeBases, tasks } from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { projectRouter } from '../../project';
import { taskRouter } from '../../task';
import { cleanupTestUser, createTestContext, createTestUser } from './setup';

let testDB: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return testDB;
  }),
}));

describe('Project Router Integration', () => {
  let serverDB: OrviloDatabase;
  let userId: string;
  let caller: ReturnType<typeof projectRouter.createCaller>;

  beforeEach(async () => {
    serverDB = await getTestDB();
    testDB = serverDB;
    userId = await createTestUser(serverDB);
    caller = projectRouter.createCaller(createTestContext(userId));
  });

  afterEach(async () => {
    await cleanupTestUser(serverDB, userId);
  });

  it('updates and clears the summary independently of the long description', async () => {
    const created = await caller.create({
      description: 'Full project scope',
      identifier: 'SUM',
      name: 'Summary project',
      summary: 'Original summary',
    });
    const input = { id: created.data.id, summary: 'Revised summary' };
    await caller.update(input);
    const revised = await caller.detail({ id: created.data.id });
    expect(revised.data.project.summary).toBe('Revised summary');
    expect(revised.data.project.description).toBe('Full project scope');
    await caller.update({ ...input, summary: '' });
    expect((await caller.detail({ id: created.data.id })).data.project.summary).toBe('');
    await expect(caller.update({ ...input, summary: 'x'.repeat(281) })).rejects.toThrow();
  });

  it('validates label edits instead of silently stripping them from project updates', async () => {
    const { data: project } = await caller.create({ identifier: 'LABEL', name: 'Label contract' });
    await expect(caller.update({ id: project.id, labelIds: ['not-a-uuid'] })).rejects.toThrow();
    await expect(
      caller.update({
        id: project.id,
        name: 'Must not save',
        labelIds: ['00000000-0000-0000-0000-000000000000'],
      }),
    ).rejects.toThrow('Project label is not available');
    const detail = await caller.detail({ id: project.id });
    expect(detail.data.project.name).toBe('Label contract');
    expect(detail.data.labels).toEqual([]);
    await caller.update({ id: project.id, labelIds: [] });
    expect((await caller.detail({ id: project.id })).data.labels).toEqual([]);
  });

  it('creates, edits and removes project links through the API without accepting unsafe URLs', async () => {
    const { data: project } = await caller.create({ identifier: 'LINK', name: 'Link contract' });
    const { data: link } = await caller.saveLink({
      id: project.id,
      title: 'Brief',
      url: 'https://example.com/brief',
    });
    expect((await caller.listLinks({ id: project.slug! })).data).toEqual([link]);
    await caller.saveLink({
      id: project.id,
      linkId: link.id,
      title: 'Updated brief',
      url: 'https://example.com/revised',
    });
    expect((await caller.listLinks({ id: project.id })).data[0]).toMatchObject({
      id: link.id,
      title: 'Updated brief',
    });
    await expect(
      caller.saveLink({ id: project.id, title: 'Unsafe', url: 'javascript:alert(1)' }),
    ).rejects.toThrow();
    await caller.saveLink({ id: project.id, linkId: link.id, url: 'https://example.com' });
    expect((await caller.listLinks({ id: project.id })).data[0]).toMatchObject({
      title: '',
      url: 'https://example.com/',
    });
    const stranger = await createTestUser(serverDB);
    try {
      const other = projectRouter.createCaller(createTestContext(stranger));
      await expect(other.listLinks({ id: project.id })).rejects.toThrow('Project not found');
      await expect(other.removeLink({ id: project.id, linkId: link.id })).rejects.toThrow(
        'Project not found',
      );
    } finally {
      await cleanupTestUser(serverDB, stranger);
    }
    await caller.removeLink({ id: project.id, linkId: link.id });
    expect((await caller.listLinks({ id: project.id })).data).toEqual([]);
  });

  it('persists planning edits, validates them against saved dates, and supports clearing', async () => {
    const { data: project } = await caller.create({ identifier: 'PLAN', name: 'Planning edits' });
    await caller.update({
      id: project.id,
      priority: 2,
      startDate: '2026-09-01',
      targetDate: '2026-12-01',
      startDatePrecision: 'month',
      targetDatePrecision: 'quarter',
    });
    expect((await caller.detail({ id: project.id })).data.project).toMatchObject({
      priority: 2,
      startDate: '2026-09-01',
      targetDate: '2026-12-01',
      startDatePrecision: 'month',
      targetDatePrecision: 'quarter',
    });
    await expect(caller.update({ id: project.id, startDate: '2027-01-01' })).rejects.toThrow(
      'Target date must not precede start date',
    );
    await expect(caller.update({ id: project.id, targetDate: '2026-08-01' })).rejects.toThrow(
      'Target date must not precede start date',
    );
    await caller.update({
      id: project.id,
      priority: 0,
      startDate: null,
      targetDate: null,
      startDatePrecision: null,
      targetDatePrecision: null,
    });
    expect((await caller.detail({ id: project.id })).data.project).toMatchObject({
      priority: 0,
      startDate: null,
      targetDate: null,
      startDatePrecision: null,
      targetDatePrecision: null,
    });
    await expect(caller.update({ id: project.id, startDate: '2026-02-30' })).rejects.toThrow();
    const stranger = await createTestUser(serverDB);
    try {
      const other = projectRouter.createCaller(createTestContext(stranger));
      await expect(other.update({ id: project.id, priority: 1 })).rejects.toThrow(
        'Project not found',
      );
      expect((await caller.detail({ id: project.id })).data.project.priority).toBe(0);
    } finally {
      await cleanupTestUser(serverDB, stranger);
    }
  });

  it('persists and clears the project lead without assigning an unrelated user', async () => {
    const { data: project } = await caller.create({ identifier: 'LEAD', name: 'Editable lead' });
    await caller.update({ id: project.id, leadUserId: userId });
    expect((await caller.detail({ id: project.id })).data.project.leadUserId).toBe(userId);
    const stranger = await createTestUser(serverDB);
    try {
      await expect(caller.update({ id: project.id, leadUserId: stranger })).rejects.toThrow(
        'Project lead must be an active workspace member',
      );
      expect((await caller.detail({ id: project.id })).data.project.leadUserId).toBe(userId);
      await caller.update({ id: project.id, leadUserId: null });
      expect((await caller.detail({ id: project.id })).data.project.leadUserId).toBeNull();
    } finally {
      await cleanupTestUser(serverDB, stranger);
    }
  });

  it('serves the complete project management and human review flow', async () => {
    const created = await caller.create({
      identifier: 'apollo',
      name: 'Apollo',
      visibility: 'private',
    });
    expect(created.data.identifier).toBe('APOLLO');
    expect(created.data.coordinatorAgentId).toBeTruthy();
    await caller.updateStatus({ id: created.data.id, status: 'active' });

    const [agent] = await serverDB.insert(agents).values({ title: 'Lead', userId }).returning();
    const [knowledgeBase] = await serverDB
      .insert(knowledgeBases)
      .values({ name: 'Mission data', userId })
      .returning();
    await caller.addAgent({ agentId: agent.id, id: created.data.id, role: 'lead' });
    await caller.addKnowledgeBase({ id: created.data.id, knowledgeBaseId: knowledgeBase.id });

    const taskCaller = taskRouter.createCaller(createTestContext(userId));
    const task = await taskCaller.create({
      instruction: 'Prepare launch',
      projectId: created.data.id,
    });
    const detail = await caller.detail({ id: created.data.id });
    expect(detail.data.agents).toHaveLength(2);
    expect(detail.data.agents).toContainEqual(
      expect.objectContaining({
        agent: expect.objectContaining({ id: created.data.coordinatorAgentId }),
        binding: expect.objectContaining({ role: 'coordinator' }),
      }),
    );
    expect(detail.data.knowledgeBases).toHaveLength(1);
    expect(detail.data.tasks?.[0].id).toBe(task.data.id);

    await caller.requestCompletion({ id: created.data.id });
    const completed = await caller.acceptCompletion({
      comment: 'Human approved',
      id: created.data.id,
    });
    expect(completed.data.project.status).toBe('completed');
    expect(completed.data.review.reviewerUserId).toBe(userId);

    const reopened = await caller.reopen({ id: created.data.id });
    expect(reopened.data.status).toBe('active');
  });

  it('links a task to a milestone and serves the completion readout it earns', async () => {
    const created = await caller.create({
      identifier: 'MILE',
      milestones: [{ name: 'Launch' }],
      name: 'Milestone contract',
    });
    const { id: projectId } = created.data;
    const milestoneId = (await caller.detail({ id: projectId })).data.milestones[0].id;
    const taskCaller = taskRouter.createCaller(createTestContext(userId));
    const first = await taskCaller.create({ instruction: 'First', projectId });
    const second = await taskCaller.create({ instruction: 'Second', projectId });

    const readout = async () => {
      const detail = await caller.detail({ id: projectId });
      return detail.data.milestones.find(({ id }) => id === milestoneId)?.progress;
    };

    // Nothing linked: an honest zero, not a placeholder percentage.
    expect(await readout()).toEqual({ completed: 0, issues: 0, percent: 0 });

    await caller.setTaskMilestone({ id: projectId, milestoneId, taskId: first.data.id });
    await caller.setTaskMilestone({ id: projectId, milestoneId, taskId: second.data.id });
    expect(await readout()).toEqual({ completed: 0, issues: 2, percent: 0 });

    // Workflow category is what "done" means for an issue, and the API only
    // accepts it alongside a linked Linear issue — so the state is written
    // directly. The readout under test is the one the API serves.
    await serverDB
      .update(tasks)
      .set({ workflowCategory: 'done' })
      .where(eq(tasks.id, first.data.id));
    expect(await readout()).toEqual({ completed: 1, issues: 2, percent: 50 });

    await expect(
      caller.setTaskMilestone({
        id: projectId,
        milestoneId: '00000000-0000-0000-0000-000000000000',
        taskId: second.data.id,
      }),
    ).rejects.toThrow('Milestone is not available in this project');
    await caller.setTaskMilestone({ id: projectId, milestoneId: null, taskId: first.data.id });
    expect(await readout()).toEqual({ completed: 0, issues: 1, percent: 0 });
  });

  it('creates, edits, reorders and deletes milestones through the API', async () => {
    const created = await caller.create({
      identifier: 'CRUD',
      milestones: [{ name: 'Launch' }],
      name: 'Milestone CRUD',
    });
    const { id: projectId } = created.data;
    const [launch] = (await caller.detail({ id: projectId })).data.milestones;

    const added = await caller.createMilestone({
      date: '2026-12-01',
      description: 'Post-launch fixes',
      id: projectId,
      name: 'Stabilise',
    });
    expect(added.data).toMatchObject({
      date: '2026-12-01',
      description: 'Post-launch fixes',
      name: 'Stabilise',
      projectId,
    });
    // Appended after the seeded milestone — where `+ Milestone` lands a card.
    let names = (await caller.detail({ id: projectId })).data.milestones.map(({ name }) => name);
    expect(names).toEqual(['Launch', 'Stabilise']);

    const edited = await caller.updateMilestone({
      id: projectId,
      milestoneId: launch.id,
      name: 'Launch day',
    });
    expect(edited.data.name).toBe('Launch day');
    expect(
      (await caller.detail({ id: projectId })).data.milestones.find(({ id }) => id === launch.id)
        ?.name,
    ).toBe('Launch day');

    const reordered = await caller.reorderMilestones({
      id: projectId,
      milestoneIds: [added.data.id, launch.id],
    });
    expect(reordered.data.map(({ id }) => id)).toEqual([added.data.id, launch.id]);
    names = (await caller.detail({ id: projectId })).data.milestones.map(({ name }) => name);
    expect(names).toEqual(['Stabilise', 'Launch day']);

    // Linked issues stay in the project when their milestone goes away.
    const taskCaller = taskRouter.createCaller(createTestContext(userId));
    const task = await taskCaller.create({ instruction: 'Survives', projectId });
    await caller.setTaskMilestone({
      id: projectId,
      milestoneId: added.data.id,
      taskId: task.data.id,
    });
    await caller.deleteMilestone({ id: projectId, milestoneId: added.data.id });
    const detail = await caller.detail({ id: projectId });
    expect(detail.data.milestones.map(({ id }) => id)).toEqual([launch.id]);
    expect(detail.data.tasks?.find(({ id }) => id === task.data.id)?.projectMilestoneId).toBeNull();
  });

  it('rejects malformed milestone writes and strangers', async () => {
    const created = await caller.create({ identifier: 'GUARD', name: 'Milestone guards' });
    const { id: projectId } = created.data;
    const milestoneId = '00000000-0000-0000-0000-000000000000';

    await expect(caller.createMilestone({ id: projectId, name: '   ' })).rejects.toThrow();
    await expect(
      caller.updateMilestone({ id: projectId, milestoneId, name: 'Nope' }),
    ).rejects.toThrow();
    await expect(caller.deleteMilestone({ id: projectId, milestoneId })).rejects.toThrow(
      'Milestone not found',
    );
    await expect(
      caller.reorderMilestones({ id: projectId, milestoneIds: [milestoneId] }),
    ).rejects.toThrow();
    // A non-uuid milestone id never reaches the model.
    await expect(caller.deleteMilestone({ id: projectId, milestoneId: 'ms_1' })).rejects.toThrow();

    const stranger = await createTestUser(serverDB);
    try {
      const other = projectRouter.createCaller(createTestContext(stranger));
      await expect(other.createMilestone({ id: projectId, name: 'Nope' })).rejects.toThrow(
        'Project not found',
      );
      await expect(
        other.updateMilestone({ id: projectId, milestoneId, name: 'Nope' }),
      ).rejects.toThrow('Project not found');
      await expect(other.deleteMilestone({ id: projectId, milestoneId })).rejects.toThrow(
        'Project not found',
      );
    } finally {
      await cleanupTestUser(serverDB, stranger);
    }
    expect((await caller.detail({ id: projectId })).data.milestones).toEqual([]);
  });

  it('reads and fences project orchestration policy writes', async () => {
    const project = await caller.create({ identifier: 'POLICY', name: 'Policy project' });
    const [agent] = await serverDB
      .insert(agents)
      .values({ title: 'Implementer', userId })
      .returning();
    await caller.addAgent({ agentId: agent.id, id: project.data.id, role: 'implementer' });

    const initial = await caller.getOrchestrationPolicy({ id: project.data.id });
    expect(initial.data.orchestrationPolicyRevision).toBe(1);

    const saved = await caller.updateOrchestrationPolicy({
      coordinatorAgentId: agent.id,
      expectedRevision: initial.data.orchestrationPolicyRevision,
      id: project.data.id,
      orchestrationPolicy: {
        allowedAgentIds: [agent.id],
        allowedRoles: ['implementer'],
        autoDispatch: true,
        concurrencyLimit: 2,
        executionBudget: { maxRuns: 5 },
        replanMode: 'suggest',
        requireHumanReview: true,
      },
    });
    expect(saved.data).toEqual(
      expect.objectContaining({ coordinatorAgentId: agent.id, orchestrationPolicyRevision: 2 }),
    );

    const stale = await caller.updateOrchestrationPolicy({
      coordinatorAgentId: project.data.coordinatorAgentId!,
      expectedRevision: initial.data.orchestrationPolicyRevision,
      id: project.data.id,
      orchestrationPolicy: {
        ...saved.data.orchestrationPolicy,
        autoDispatch: false,
      },
    });
    expect(stale.data).toEqual(expect.objectContaining({ stale: true }));
    expect(
      (await caller.getOrchestrationPolicy({ id: project.data.id })).data.orchestrationPolicy
        .autoDispatch,
    ).toBe(true);
  });

  it('rejects cross-project task dependencies', async () => {
    const first = await caller.create({ identifier: 'FIRST', name: 'First' });
    const second = await caller.create({ identifier: 'SECOND', name: 'Second' });
    const taskCaller = taskRouter.createCaller(createTestContext(userId));
    const firstTask = await taskCaller.create({ instruction: 'First', projectId: first.data.id });
    const secondTask = await taskCaller.create({
      instruction: 'Second',
      projectId: second.data.id,
    });

    await expect(
      taskCaller.addDependency({ dependsOnId: secondTask.data.id, taskId: firstTask.data.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('requires a valid project identifier', async () => {
    await expect(caller.create({ identifier: 'not-valid!', name: 'Invalid' })).rejects.toThrow(
      'Invalid project identifier',
    );
  });

  it.each(['team/launch', 'roadmap?draft', '#plan', 'two--hyphens'])(
    'rejects the route-unsafe slug %s when creating a project',
    async (slug) => {
      await expect(
        caller.create({ identifier: 'VALID', name: 'Invalid slug', slug }),
      ).rejects.toThrow('Invalid project slug');
    },
  );

  it.each(['team/launch', 'roadmap?draft', '#plan', 'two--hyphens'])(
    'rejects the route-unsafe slug %s when updating a project',
    async (slug) => {
      const project = await caller.create({
        identifier: 'VALID',
        name: 'Valid project',
        slug: 'valid-project',
      });

      await expect(caller.update({ id: project.data.id, slug })).rejects.toThrow(
        'Invalid project slug',
      );
    },
  );

  it('accepts underscores in project slugs', async () => {
    const project = await caller.create({
      identifier: 'VALID',
      name: 'Valid project',
      slug: 'team_launch',
    });
    expect(project.data.slug).toBe('team_launch');

    const updated = await caller.update({ id: project.data.id, slug: 'team_launch_v2' });
    expect(updated.data.slug).toBe('team_launch_v2');
  });
});
