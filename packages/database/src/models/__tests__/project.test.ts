import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  knowledgeBases,
  projectCompletionReviews,
  projectMembers,
  projects,
  projectTeams,
  projectWorks,
  tasks,
  teamMembers,
  teams,
  users,
  works,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { AgentModel } from '../agent';
import type { CreateProjectInput } from '../project';
import { ProjectModel } from '../project';
import { TaskModel } from '../task';

const serverDB: OrviloDatabase = await getTestDB();
const userId = 'project-model-user';
const otherUserId = 'project-model-other-user';
let projectIdentifierSequence = 0;

const createProject = (projectModel: ProjectModel, input: Omit<CreateProjectInput, 'identifier'>) =>
  projectModel.create({
    ...input,
    identifier: `P${String(++projectIdentifierSequence).padStart(5, '0')}`,
  });

describe('ProjectModel', () => {
  const model = new ProjectModel(serverDB, userId);
  const otherModel = new ProjectModel(serverDB, otherUserId);

  beforeEach(async () => {
    await serverDB.delete(users);
    await serverDB.insert(users).values([{ id: userId }, { id: otherUserId }]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await serverDB.delete(users);
  });

  it('keeps comments separate from project health and scopes activity to the owner', async () => {
    const project = await createProject(model, { name: 'Activity' });
    await model.createUpdate(project.id, { body: 'Risk identified', health: 'atRisk' });
    const comment = await model.createUpdate(project.id, {
      body: 'Discuss the mitigation',
      health: 'onTrack',
      kind: 'comment',
    });

    expect(comment).toMatchObject({ kind: 'comment', health: null });
    expect(await model.findById(project.id)).toMatchObject({ health: 'atRisk' });
    expect(await model.listUpdates(project.id)).toHaveLength(2);
    expect(await otherModel.listUpdates(project.id)).toBeNull();
    expect(
      await otherModel.createUpdate(project.id, { body: 'Not allowed', kind: 'comment' }),
    ).toBeNull();
  });

  it('uses the same default health on the update and its project', async () => {
    const project = await createProject(model, { name: 'Default update health' });
    await model.createUpdate(project.id, { body: 'Blocked', health: 'offTrack' });
    const update = await model.createUpdate(project.id, { body: 'Recovered' });

    expect(update).toMatchObject({ kind: 'update', health: 'onTrack' });
    expect(await model.findById(project.id)).toMatchObject({ health: 'onTrack' });
  });

  it('recomputes denormalized health when the newest update is edited or deleted', async () => {
    const project = await createProject(model, { name: 'Health denorm' });
    const stale = await model.createUpdate(project.id, { body: 'Early', health: 'atRisk' });
    const latest = await model.createUpdate(project.id, { body: 'Now', health: 'onTrack' });
    expect(await model.findById(project.id)).toMatchObject({ health: 'onTrack' });

    // Editing the newest update's health moves the project health.
    const edited = await model.updateUpdate(project.id, latest!.id, {
      body: 'Now — revised',
      health: 'offTrack',
    });
    expect(edited).toMatchObject({ body: 'Now — revised', health: 'offTrack' });
    expect(await model.findById(project.id)).toMatchObject({ health: 'offTrack' });

    // Editing an older update leaves the newest one's health in charge.
    await model.updateUpdate(project.id, stale!.id, { body: 'Early', health: 'onTrack' });
    expect(await model.findById(project.id)).toMatchObject({ health: 'offTrack' });

    // Deleting the newest update falls back to the previous update's health.
    await model.deleteUpdate(project.id, latest!.id);
    expect(await model.findById(project.id)).toMatchObject({ health: 'onTrack' });

    // Deleting the last status update clears the denormalized health.
    await model.deleteUpdate(project.id, stale!.id);
    expect(await model.findById(project.id)).toMatchObject({ health: null });
    expect(await model.listUpdates(project.id)).toEqual([]);
  });

  it('keeps comments body-only on edit and never lets them move project health', async () => {
    const project = await createProject(model, { name: 'Comment edit' });
    const status = await model.createUpdate(project.id, { body: 'Status', health: 'atRisk' });
    const comment = await model.createUpdate(project.id, {
      body: 'Draft comment',
      kind: 'comment',
    });

    // A comment stays body-only: a health payload is ignored.
    const edited = await model.updateUpdate(project.id, comment!.id, {
      body: 'Edited comment',
      health: 'offTrack',
    });
    expect(edited).toMatchObject({ body: 'Edited comment', health: null, kind: 'comment' });
    expect(await model.findById(project.id)).toMatchObject({ health: 'atRisk' });

    // Deleting a comment does not disturb the denormalized health.
    await model.deleteUpdate(project.id, comment!.id);
    expect(await model.findById(project.id)).toMatchObject({ health: 'atRisk' });
    expect(await model.listUpdates(project.id)).toEqual([
      expect.objectContaining({ id: status!.id }),
    ]);
  });

  it('rejects update edits and deletes from users who cannot moderate them', async () => {
    const project = await createProject(model, { name: 'Moderated update' });
    const update = await model.createUpdate(project.id, { body: 'Owner status' });
    const missingId = '00000000-0000-0000-0000-000000000000';

    // Another user cannot even see the personal project, let alone moderate it.
    expect(await otherModel.updateUpdate(project.id, update!.id, { body: 'Nope' })).toBeNull();
    expect(await otherModel.deleteUpdate(project.id, update!.id)).toBeNull();
    // Missing rows and cross-project ids collapse to the same null.
    expect(await model.updateUpdate(project.id, missingId, { body: 'Nope' })).toBeNull();
    expect(await model.deleteUpdate(project.id, missingId)).toBeNull();
    const sibling = await createProject(model, { name: 'Sibling' });
    expect(await model.updateUpdate(sibling.id, update!.id, { body: 'Nope' })).toBeNull();
    expect(await model.deleteUpdate(sibling.id, update!.id)).toBeNull();
    expect(await model.listUpdates(project.id)).toHaveLength(1);
  });

  it('lets the author, project lead and workspace admin moderate updates', async () => {
    const workspaceId = 'project-update-mod-workspace';
    const leadId = 'project-update-lead';
    const memberId = 'project-update-member';
    await serverDB.insert(users).values([{ id: leadId }, { id: memberId }]);
    await serverDB.insert(workspaces).values({
      id: workspaceId,
      name: 'Update moderation',
      primaryOwnerId: userId,
      slug: workspaceId,
    });
    // project create validates the lead is an active workspace member.
    await serverDB.insert(workspaceMembers).values([
      { role: 'owner', userId, workspaceId },
      { role: 'member', userId: leadId, workspaceId },
      { role: 'member', userId: memberId, workspaceId },
      { role: 'admin', userId: otherUserId, workspaceId },
    ]);
    const owner = new ProjectModel(serverDB, userId, workspaceId);
    const lead = new ProjectModel(serverDB, leadId, workspaceId);
    const member = new ProjectModel(serverDB, memberId, workspaceId);
    const admin = new ProjectModel(serverDB, otherUserId, workspaceId, { canManageAll: true });
    const project = await createProject(owner, { leadUserId: leadId, name: 'Moderated' });

    const ownerUpdate = await owner.createUpdate(project.id, {
      body: 'Owner status',
      health: 'atRisk',
    });
    // Any member who can read the project may post a comment on it.
    const memberComment = await member.createUpdate(project.id, {
      body: 'Member note',
      kind: 'comment',
    });
    expect(memberComment).not.toBeNull();

    // The author edits their own comment; a plain member cannot touch the
    // owner's update.
    expect(
      await member.updateUpdate(project.id, memberComment!.id, { body: 'Member note v2' }),
    ).toMatchObject({ body: 'Member note v2' });
    expect(await member.updateUpdate(project.id, ownerUpdate!.id, { body: 'Nope' })).toBeNull();
    expect(await member.deleteUpdate(project.id, ownerUpdate!.id)).toBeNull();

    // The project lead may edit another member's update — denorm follows.
    expect(
      await lead.updateUpdate(project.id, ownerUpdate!.id, {
        body: 'Owner status',
        health: 'offTrack',
      }),
    ).toMatchObject({ health: 'offTrack' });
    expect(await owner.findById(project.id)).toMatchObject({ health: 'offTrack' });

    // A workspace admin may delete another member's comment; the owner may
    // delete the remaining update, which clears the denormalized health.
    expect(await admin.deleteUpdate(project.id, memberComment!.id)).toMatchObject({
      id: memberComment!.id,
    });
    expect(await owner.deleteUpdate(project.id, ownerUpdate!.id)).toMatchObject({
      id: ownerUpdate!.id,
    });
    expect(await owner.findById(project.id)).toMatchObject({ health: null });
  });

  it('persists external links independently and rejects cross-project or cross-user edits', async () => {
    const project = await createProject(model, { name: 'Linked project' });
    const sibling = await createProject(model, { name: 'Other project' });
    const input = { title: '  Design brief  ', url: 'https://example.com/brief' };
    const link = await model.saveLink(project.id, input);
    expect(link).toMatchObject({ title: 'Design brief', url: input.url, projectId: project.id });
    expect(await model.listLinks(project.id)).toEqual([link]);
    expect(await otherModel.listLinks(project.id)).toBeNull();
    expect(await otherModel.saveLink(project.id, input)).toBeNull();
    expect(await otherModel.removeLink(project.id, link!.id)).toBeNull();
    expect(await model.saveLink(sibling.id, { ...input, id: link!.id })).toBeNull();
    expect(await model.removeLink(sibling.id, link!.id)).toBeNull();
    await model.saveLink(project.id, {
      id: link!.id,
      title: 'Edited',
      url: 'https://example.com/revised',
    });
    expect(await model.listLinks(project.id)).toEqual([
      expect.objectContaining({
        id: link!.id,
        title: 'Edited',
        url: 'https://example.com/revised',
      }),
    ]);
    await model.removeLink(project.id, link!.id);
    expect(await model.listLinks(project.id)).toEqual([]);
    expect(await model.findById(project.id)).not.toBeNull();
  });

  it('rejects unsafe or invalid external link values without persisting them', async () => {
    const project = await createProject(model, { name: 'Link validation' });
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'file:///etc/passwd',
      '/relative',
      'https://user:pass@example.com',
      'https://example.com/' + 'a'.repeat(8192),
    ]) {
      await expect(model.saveLink(project.id, { title: 'Invalid', url })).rejects.toThrow();
    }
    for (const title of ['a'.repeat(256)]) {
      await expect(
        model.saveLink(project.id, { title, url: 'https://example.com' }),
      ).rejects.toThrow();
    }
    expect(await model.listLinks(project.id)).toEqual([]);
  });

  it('accepts an optional link title and allows clearing a previously saved title', async () => {
    const project = await createProject(model, { name: 'Optional title' });
    const link = await model.saveLink(project.id, { url: 'https://example.com/spec' });
    expect(link).toMatchObject({ title: '', url: 'https://example.com/spec' });
    await model.saveLink(project.id, { id: link!.id, title: 'Spec', url: link!.url });
    await model.saveLink(project.id, { id: link!.id, title: '  ', url: link!.url });
    expect(await model.listLinks(project.id)).toEqual([
      expect.objectContaining({ id: link!.id, title: '' }),
    ]);
  });

  it('does not expose project links across workspaces even to the same owner', async () => {
    const firstId = 'project-links-scope-a';
    const secondId = 'project-links-scope-b';
    for (const id of [firstId, secondId]) {
      await serverDB.insert(workspaces).values({ id, name: id, slug: id, primaryOwnerId: userId });
      await serverDB.insert(workspaceMembers).values({ workspaceId: id, userId, role: 'owner' });
    }
    const first = new ProjectModel(serverDB, userId, firstId);
    const second = new ProjectModel(serverDB, userId, secondId);
    const project = await createProject(first, { name: 'Scoped links' });
    const input = { title: 'Brief', url: 'https://example.com/brief' };
    const link = await first.saveLink(project.id, input);
    expect(await second.listLinks(project.id)).toBeNull();
    expect(await second.saveLink(project.id, input)).toBeNull();
    expect(await second.removeLink(project.id, link!.id)).toBeNull();
    expect(await first.listLinks(project.id)).toEqual([link]);
  });

  it('creates, lists, updates, and deletes a project in the owner scope', async () => {
    const project = await createProject(model, { description: 'A large effort', name: 'Apollo' });
    expect(project.status).toBe('backlog');
    expect(project.coordinatorAgentId).toBeTruthy();
    expect(
      await serverDB.select().from(agents).where(eq(agents.id, project.coordinatorAgentId!)),
    ).toEqual([expect.objectContaining({ virtual: true })]);
    expect(await new AgentModel(serverDB, userId).queryAgents()).not.toContainEqual(
      expect.objectContaining({ id: project.coordinatorAgentId }),
    );
    expect(await model.listAgents(project.id)).toEqual([
      expect.objectContaining({
        agent: expect.objectContaining({ id: project.coordinatorAgentId }),
        binding: expect.objectContaining({ role: 'coordinator' }),
      }),
    ]);
    expect(await model.list()).toEqual([expect.objectContaining({ id: project.id })]);

    const updated = await model.update(project.id, { name: 'Apollo 2' });
    expect(updated?.name).toBe('Apollo 2');
    expect(await model.delete(project.id)).toEqual(expect.objectContaining({ id: project.id }));
    expect(await model.findById(project.id)).toBeNull();
    expect(
      await serverDB.select().from(agents).where(eq(agents.id, project.coordinatorAgentId!)),
    ).toHaveLength(0);
  });

  it('persists project planning fields and rejects leads outside the project scope', async () => {
    const draft = {
      name: 'Launch plan',
      summary: 'A focused launch',
      avatar: '🚀',
      description: 'Release checklist',
      leadUserId: userId,
      startDate: '2026-09-21',
      targetDate: '2026-10-01',
    };
    const project = await createProject(model, draft);
    expect(await model.findById(project.id)).toMatchObject(draft);
    await expect(createProject(model, { ...draft, leadUserId: otherUserId })).rejects.toThrow();
  });

  it('persists project priority, status and date precision', async () => {
    const draft = {
      name: 'Planning precision',
      priority: 2,
      status: 'active',
      startDate: '2026-10-01',
      startDatePrecision: 'quarter',
      targetDate: '2027-06-30',
      targetDatePrecision: 'halfYear',
    } as const;
    const project = await createProject(model, draft);
    expect(await model.findById(project.id)).toMatchObject(draft);
  });

  it('persists independent project milestones and rejects empty milestones atomically', async () => {
    const milestones = [{ name: 'Launch', description: 'Ship the release', date: '2026-12-01' }];
    const project = await createProject(model, { name: 'Milestone project', milestones });
    expect((await model.getPlanning(project.id))?.milestones).toEqual([
      expect.objectContaining(milestones[0]),
    ]);
    await expect(
      createProject(model, { name: 'Invalid milestone', milestones: [{ name: ' ' }] }),
    ).rejects.toThrow();
    expect((await model.list()).map(({ name }) => name)).toEqual(['Milestone project']);
    expect(await otherModel.getPlanning(project.id)).toBeNull();
  });

  it('persists workspace members, project labels and directional dependencies without leaking scope', async () => {
    const workspaceId = 'planning-fields-workspace';
    await serverDB
      .insert(workspaces)
      .values({ id: workspaceId, name: 'Planning', slug: workspaceId, primaryOwnerId: userId });
    await serverDB.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' });
    const scoped = new ProjectModel(serverDB, userId, workspaceId);
    const predecessor = await createProject(scoped, { name: 'Predecessor' });
    const project = await createProject(scoped, {
      name: 'Launch',
      memberIds: [userId],
      newLabelNames: ['Launch'],
      dependencies: [{ projectId: predecessor.id, type: 'blockedBy' }],
    });
    const planning = await scoped.getPlanning(project.id);
    expect(planning?.members).toEqual([expect.objectContaining({ userId })]);
    expect(planning?.labels).toEqual([expect.objectContaining({ name: 'Launch' })]);
    expect(planning?.dependencies).toEqual([
      expect.objectContaining({
        type: 'blockedBy',
        project: expect.objectContaining({ id: predecessor.id }),
      }),
    ]);
    expect((await scoped.getPlanning(predecessor.id))?.dependencies).toEqual([
      expect.objectContaining({
        type: 'blocking',
        project: expect.objectContaining({ id: project.id }),
      }),
    ]);
    await expect(
      createProject(scoped, {
        name: 'Transitive cycle',
        dependencies: [
          { projectId: predecessor.id, type: 'blocking' },
          { projectId: project.id, type: 'blockedBy' },
        ],
      }),
    ).rejects.toThrow('cycle');
    const labels = await scoped.listLabels();
    expect(labels).toHaveLength(1);
    await expect(
      createProject(model, { name: 'Wrong labels', labelIds: [labels[0].id] }),
    ).rejects.toThrow();
    await expect(
      createProject(scoped, { name: 'Wrong member', memberIds: [otherUserId] }),
    ).rejects.toThrow();
    const privateProject = await createProject(otherModel, { name: 'Private' });
    await expect(
      createProject(scoped, {
        name: 'Private dependency',
        dependencies: [{ projectId: privateProject.id, type: 'blockedBy' }],
      }),
    ).rejects.toThrow();
    await expect(
      createProject(scoped, {
        name: 'Cycle',
        dependencies: [
          { projectId: predecessor.id, type: 'blockedBy' },
          { projectId: predecessor.id, type: 'blocking' },
        ],
      }),
    ).rejects.toThrow();
    expect((await scoped.list()).map(({ name }) => name).sort()).toEqual(['Launch', 'Predecessor']);
    expect(await otherModel.getPlanning(project.id)).toBeNull();
  });

  it('links the selected team atomically and rejects a team from another workspace', async () => {
    const workspaceId = 'project-planning-workspace';
    const otherWorkspaceId = 'project-planning-other';
    await serverDB.insert(workspaces).values([
      { id: workspaceId, name: 'Planning', slug: workspaceId, primaryOwnerId: userId },
      { id: otherWorkspaceId, name: 'Other', slug: otherWorkspaceId, primaryOwnerId: otherUserId },
    ]);
    await serverDB.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' });
    await serverDB.insert(teams).values([
      { id: 'planning-team', workspaceId, name: 'Design', key: 'DSN' },
      { id: 'other-planning-team', workspaceId: otherWorkspaceId, name: 'Other', key: 'OTH' },
    ]);
    const scoped = new ProjectModel(serverDB, userId, workspaceId);
    const project = await createProject(scoped, { name: 'Team launch', teamId: 'planning-team' });
    expect(
      await serverDB.select().from(projectTeams).where(eq(projectTeams.projectId, project.id)),
    ).toEqual([expect.objectContaining({ teamId: 'planning-team', workspaceId })]);
    await expect(
      createProject(scoped, { name: 'Invalid team', teamId: 'other-planning-team' }),
    ).rejects.toThrow();
    expect((await scoped.list()).map(({ name }) => name)).toEqual(['Team launch']);
  });

  it('resolves a project by slug without escaping the current scope', async () => {
    const project = await createProject(model, { name: 'Apollo', slug: 'apollo' });
    await createProject(otherModel, { name: 'Other Apollo', slug: 'other-apollo' });

    expect(await model.findByIdOrSlug('apollo')).toEqual(
      expect.objectContaining({ id: project.id }),
    );
    expect(await model.findByIdOrSlug(project.id)).toEqual(
      expect.objectContaining({ slug: 'apollo' }),
    );
    expect(await model.findByIdOrSlug('other-apollo')).toBeNull();
  });

  it('finds a bounded set of readable projects', async () => {
    const first = await createProject(model, { name: 'First' });
    const second = await createProject(model, { name: 'Second' });
    const hidden = await createProject(otherModel, { name: 'Hidden', visibility: 'private' });

    expect(await model.findByIds([])).toEqual([]);
    expect(await model.findByIds([first.id, second.id, hidden.id])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id }),
        expect.objectContaining({ id: second.id }),
      ]),
    );
    expect(await model.findByIds([first.id, second.id, hidden.id])).toHaveLength(2);
  });

  it('normalizes identifiers and enforces uniqueness within their ownership scope', async () => {
    const first = await model.create({ identifier: ' orvilo ', name: 'First' });
    expect(first.identifier).toBe('ORVILO');

    await expect(model.create({ identifier: 'ORVILO', name: 'Duplicate' })).rejects.toThrow();
    await expect(otherModel.create({ identifier: 'ORVILO', name: 'Other user' })).resolves.toEqual(
      expect.objectContaining({ identifier: 'ORVILO' }),
    );

    await serverDB.insert(workspaces).values({
      id: 'identifier-workspace',
      name: 'Identifier Workspace',
      primaryOwnerId: userId,
      slug: 'identifier-workspace',
    });
    const owner = new ProjectModel(serverDB, userId, 'identifier-workspace');
    const member = new ProjectModel(serverDB, otherUserId, 'identifier-workspace');
    await owner.create({ identifier: 'TEAM', name: 'Workspace project' });
    await expect(
      member.create({ identifier: 'TEAM', name: 'Workspace duplicate' }),
    ).rejects.toThrow();
  });

  it('requires identifiers to contain between 3 and 6 characters', async () => {
    await expect(model.create({ identifier: 'AB', name: 'Too short' })).rejects.toThrow(
      'Project identifier must be between 3 and 6 characters',
    );
    await expect(model.create({ identifier: 'ABCDEFG', name: 'Too long' })).rejects.toThrow(
      'Project identifier must be between 3 and 6 characters',
    );
    await expect(model.create({ identifier: 'ABC', name: 'Minimum' })).resolves.toEqual(
      expect.objectContaining({ identifier: 'ABC' }),
    );
    await expect(model.create({ identifier: 'ABCDEF', name: 'Maximum' })).resolves.toEqual(
      expect.objectContaining({ identifier: 'ABCDEF' }),
    );
  });

  it('replaces project labels atomically, preserving taxonomy and workspace isolation', async () => {
    const workspaceId = 'project-label-edit-ws';
    await serverDB
      .insert(workspaces)
      .values({ id: workspaceId, name: 'Labels', slug: workspaceId, primaryOwnerId: userId });
    await serverDB.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' });
    const scoped = new ProjectModel(serverDB, userId, workspaceId);
    const project = await createProject(scoped, {
      name: 'Labels',
      newLabelNames: ['Keep', 'Remove'],
    });
    const labels = await scoped.listLabels();
    const keep = labels.find((label) => label.name === 'Keep')!;
    await scoped.update(project.id, { labelIds: [keep.id, keep.id] });
    expect((await scoped.getPlanning(project.id))?.labels.map((label) => label.id)).toEqual([
      keep.id,
    ]);
    expect(await scoped.listLabels()).toHaveLength(2);
    const foreignWorkspaceId = 'project-label-foreign-ws';
    await serverDB.insert(workspaces).values({
      id: foreignWorkspaceId,
      name: 'Foreign labels',
      slug: foreignWorkspaceId,
      primaryOwnerId: otherUserId,
    });
    await serverDB
      .insert(workspaceMembers)
      .values({ workspaceId: foreignWorkspaceId, userId: otherUserId, role: 'owner' });
    const foreign = new ProjectModel(serverDB, otherUserId, foreignWorkspaceId);
    await createProject(foreign, { name: 'Foreign', newLabelNames: ['Foreign label'] });
    const [foreignLabel] = await foreign.listLabels();
    await expect(scoped.update(project.id, { labelIds: [foreignLabel.id] })).rejects.toThrow(
      'Project label is not available',
    );
    await expect(
      scoped.update(project.id, {
        name: 'Must roll back',
        labelIds: ['00000000-0000-0000-0000-000000000000'],
      }),
    ).rejects.toThrow('Project label is not available');
    expect((await scoped.findById(project.id))?.name).toBe('Labels');
    expect((await scoped.getPlanning(project.id))?.labels.map((label) => label.id)).toEqual([
      keep.id,
    ]);
    expect(await otherModel.update(project.id, { labelIds: [] })).toBeNull();
    await scoped.update(project.id, { labelIds: [] });
    expect((await scoped.getPlanning(project.id))?.labels).toEqual([]);
    expect(await scoped.listLabels()).toHaveLength(2);
  });

  it('only assigns active members of the project workspace as lead', async () => {
    const workspaceId = 'project-lead-edit-ws';
    await serverDB.insert(workspaces).values({
      id: workspaceId,
      name: 'Lead editing',
      primaryOwnerId: userId,
      slug: workspaceId,
    });
    await serverDB.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId });
    const owner = new ProjectModel(serverDB, userId, workspaceId);
    const project = await createProject(owner, { name: 'Lead editing' });
    await expect(owner.update(project.id, { leadUserId: otherUserId })).rejects.toThrow(
      'Project lead must be an active workspace member',
    );
    await serverDB
      .insert(workspaceMembers)
      .values({ role: 'member', userId: otherUserId, workspaceId });
    expect(await owner.update(project.id, { leadUserId: otherUserId })).toMatchObject({
      leadUserId: otherUserId,
    });
    await serverDB
      .update(workspaceMembers)
      .set({ suspendedAt: new Date() })
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, otherUserId),
        ),
      );
    await expect(owner.update(project.id, { leadUserId: otherUserId })).rejects.toThrow(
      'Project lead must be an active workspace member',
    );
    expect(await owner.update(project.id, { leadUserId: null })).toMatchObject({
      leadUserId: null,
    });
    expect(await otherModel.update(project.id, { leadUserId: otherUserId })).toBeNull();
  });

  it('filters and paginates projects', async () => {
    await createProject(model, { name: 'Backlog' });
    const active = await createProject(model, { name: 'Active' });
    await model.updateStatus(active.id, 'active');

    expect(await model.list({ limit: 1, offset: 0, statuses: ['active'] })).toEqual([
      expect.objectContaining({ id: active.id }),
    ]);
    expect(await model.list({ statuses: [] })).toHaveLength(2);
    expect(await model.list({ limit: 1, offset: 1 })).toHaveLength(1);
  });

  it('counts only tasks the caller can actually read', async () => {
    const workspaceId = 'project-task-count-ws';
    await serverDB.insert(workspaces).values({
      id: workspaceId,
      name: 'Task Count Workspace',
      primaryOwnerId: userId,
      slug: workspaceId,
    });
    await serverDB.insert(workspaceMembers).values([
      { role: 'owner', userId, workspaceId },
      { role: 'member', userId: otherUserId, workspaceId },
    ]);
    await serverDB.insert(teams).values({
      createdByUserId: userId,
      id: 'project-count-private-team',
      key: 'CNT',
      name: 'Private Team',
      visibility: 'private',
      workspaceId,
    });
    const owner = new ProjectModel(serverDB, userId, workspaceId);
    const member = new ProjectModel(serverDB, otherUserId, workspaceId);
    const project = await createProject(owner, { name: 'Counted' });
    const ownerTasks = new TaskModel(serverDB, userId, workspaceId);

    const visible = await ownerTasks.create({
      instruction: 'Visible',
      projectId: project.id,
    });
    // A private-team task is invisible to a member who is not on the team.
    await ownerTasks.create({
      instruction: 'Team-scoped',
      projectId: project.id,
      teamId: 'project-count-private-team',
    });
    const deleted = await ownerTasks.create({
      instruction: 'Deleted',
      projectId: project.id,
    });
    await serverDB.update(tasks).set({ isDeleted: true }).where(eq(tasks.id, deleted.id));
    // Another member's private task never surfaces in the count.
    await new TaskModel(serverDB, otherUserId, workspaceId).create({
      instruction: 'Member private',
      projectId: project.id,
      visibility: 'private',
    });

    // member sees the public task and their own private task — not the
    // private-team row, not the soft-deleted row.
    const memberRows = await member.list();
    expect(memberRows).toEqual([expect.objectContaining({ id: project.id, taskCount: 2 })]);
    // The owner (team creator) sees the team task but not the deleted row or
    // the member's private task.
    const ownerRows = await owner.list();
    expect(ownerRows).toEqual([expect.objectContaining({ id: project.id, taskCount: 2 })]);
    // Once the member joins the private team its task becomes readable.
    await serverDB.insert(teamMembers).values({
      role: 'member',
      teamId: 'project-count-private-team',
      userId: otherUserId,
      workspaceId,
    });
    expect(await member.list()).toEqual([
      expect.objectContaining({ id: project.id, taskCount: 3 }),
    ]);
    expect(visible.id).toBeTruthy();
  });

  it('reports project issue progress from readable, non-canceled tasks', async () => {
    const project = await createProject(model, { name: 'Progress' });
    const taskModel = new TaskModel(serverDB, userId);
    const done = await taskModel.create({ instruction: 'Done', projectId: project.id });
    await taskModel.create({ instruction: 'Open', projectId: project.id });
    const canceled = await taskModel.create({ instruction: 'Canceled', projectId: project.id });

    await serverDB.update(tasks).set({ workflowCategory: 'done' }).where(eq(tasks.id, done.id));
    await serverDB
      .update(tasks)
      .set({ workflowCategory: 'canceled' })
      .where(eq(tasks.id, canceled.id));

    expect(await model.list()).toEqual([
      expect.objectContaining({ id: project.id, progressPercent: 50, taskCount: 3 }),
    ]);
  });

  it('does not expose or mutate another user project in personal mode', async () => {
    const project = await createProject(otherModel, { name: 'Private effort' });
    expect(await model.findById(project.id)).toBeNull();
    expect(await model.update(project.id, { name: 'Hacked' })).toBeNull();
    expect(await model.delete(project.id)).toBeNull();
    expect(await model.findManageableById(project.id)).toBeNull();
  });

  it('applies public and private visibility in workspace mode', async () => {
    await serverDB.insert(workspaces).values({
      id: 'project-workspace',
      name: 'Project Workspace',
      primaryOwnerId: userId,
      slug: 'project-workspace',
    });
    const owner = new ProjectModel(serverDB, userId, 'project-workspace');
    const member = new ProjectModel(serverDB, otherUserId, 'project-workspace');
    const publicProject = await createProject(owner, { name: 'Public' });
    const privateProject = await createProject(owner, { name: 'Private', visibility: 'private' });

    expect(await member.findById(publicProject.id)).toEqual(
      expect.objectContaining({ id: publicProject.id }),
    );
    expect(await member.findById(privateProject.id)).toBeNull();
    expect(await member.update(publicProject.id, { name: 'Nope' })).toBeNull();
  });

  it('lets an active project_members grant read a private workspace project', async () => {
    const workspaceId = 'project-grant-read-workspace';
    const granteeId = 'project-model-grantee';
    await serverDB.insert(users).values({ id: granteeId });
    await serverDB.insert(workspaces).values({
      id: workspaceId,
      name: 'Grant Workspace',
      primaryOwnerId: userId,
      slug: workspaceId,
    });
    // project_members carries a composite FK to workspace_members.
    await serverDB.insert(workspaceMembers).values([
      { role: 'owner', userId, workspaceId },
      { role: 'member', userId: otherUserId, workspaceId },
      { role: 'member', userId: granteeId, workspaceId },
    ]);
    const owner = new ProjectModel(serverDB, userId, workspaceId);
    const member = new ProjectModel(serverDB, otherUserId, workspaceId);
    const outsider = new ProjectModel(serverDB, granteeId, workspaceId);
    const privateProject = await createProject(owner, {
      name: 'Private',
      visibility: 'private',
    });

    // No grant → the private project stays invisible.
    expect(await member.findById(privateProject.id)).toBeNull();
    expect(await member.list()).toEqual([]);

    await serverDB.insert(projectMembers).values({
      projectId: privateProject.id,
      role: 'contributor',
      userId: otherUserId,
      workspaceId,
    });

    expect(await member.findById(privateProject.id)).toEqual(
      expect.objectContaining({ id: privateProject.id }),
    );
    expect(await member.findByIds([privateProject.id])).toEqual([
      expect.objectContaining({ id: privateProject.id }),
    ]);
    expect(await member.findByIdOrSlug(privateProject.id)).toEqual(
      expect.objectContaining({ id: privateProject.id }),
    );
    // A workspace member without a grant still cannot read it.
    expect(await outsider.findById(privateProject.id)).toBeNull();

    // A suspended grant no longer reads — only ACTIVE rows confer access.
    await serverDB
      .update(projectMembers)
      .set({ suspendedAt: new Date() })
      .where(
        and(
          eq(projectMembers.projectId, privateProject.id),
          eq(projectMembers.userId, otherUserId),
        ),
      );
    expect(await member.findById(privateProject.id)).toBeNull();
  });

  it('binds only accessible agents and knowledge bases', async () => {
    const project = await createProject(model, { name: 'Bindings' });
    const [agent] = await serverDB
      .insert(agents)
      .values({ title: 'Researcher', userId })
      .returning();
    const [knowledgeBase] = await serverDB
      .insert(knowledgeBases)
      .values({ name: 'Research', userId })
      .returning();
    const [foreignAgent] = await serverDB
      .insert(agents)
      .values({ title: 'Foreign', userId: otherUserId })
      .returning();

    await model.addAgent(project.id, { agentId: agent.id, role: 'lead' });
    await model.addKnowledgeBase(project.id, { knowledgeBaseId: knowledgeBase.id });
    await model.addAgent(project.id, { agentId: agent.id, enabled: false, role: 'reviewer' });
    await model.addKnowledgeBase(project.id, {
      enabled: false,
      knowledgeBaseId: knowledgeBase.id,
      sortOrder: 2,
    });
    const task = await new TaskModel(serverDB, userId).create({
      instruction: 'Use project knowledge',
      projectId: project.id,
    });
    expect(await model.listAgents(project.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ binding: expect.objectContaining({ role: 'coordinator' }) }),
        expect.objectContaining({ binding: expect.objectContaining({ role: 'reviewer' }) }),
      ]),
    );
    await expect(model.removeAgent(project.id, project.coordinatorAgentId!)).rejects.toThrow(
      'The project coordinator cannot be removed',
    );
    expect(await model.listKnowledgeBases(project.id)).toHaveLength(1);
    expect(await model.getEnabledKnowledgeBaseIdsForTask(task.id)).toEqual([]);
    await model.addKnowledgeBase(project.id, { enabled: true, knowledgeBaseId: knowledgeBase.id });
    expect(await model.getEnabledKnowledgeBaseIdsForTask(task.id)).toEqual([knowledgeBase.id]);
    await expect(model.addAgent(project.id, { agentId: foreignAgent.id })).rejects.toThrow(
      'Agent not found',
    );

    expect(await model.removeAgent(project.id, agent.id)).toBe(true);
    expect(await model.removeKnowledgeBase(project.id, knowledgeBase.id)).toBe(true);
    expect(await model.removeAgent(project.id, agent.id)).toBe(false);
    expect(await model.removeKnowledgeBase(project.id, knowledgeBase.id)).toBe(false);
  });

  it('saves a bounded orchestration policy with revision fencing and participant validation', async () => {
    const project = await createProject(model, { name: 'Orchestration' });
    const [agent] = await serverDB
      .insert(agents)
      .values({ title: 'Implementer', userId })
      .returning();
    await model.addAgent(project.id, { agentId: agent.id, role: 'implementer' });

    const initial = await model.getOrchestrationPolicy(project.id);
    expect(initial).toEqual(
      expect.objectContaining({
        coordinatorAgentId: project.coordinatorAgentId!,
        orchestrationPolicy: expect.objectContaining({
          concurrencyLimit: 1,
          executionBudget: { maxCost: 25, maxRuns: 10 },
        }),
        orchestrationPolicyRevision: 1,
      }),
    );

    const updated = await model.updateOrchestrationPolicy(project.id, {
      coordinatorAgentId: agent.id,
      expectedRevision: initial!.orchestrationPolicyRevision,
      orchestrationPolicy: {
        allowedAgentIds: [agent.id],
        allowedRoles: ['implementer'],
        autoDispatch: true,
        concurrencyLimit: 2,
        executionBudget: { maxCost: 25, maxRuns: 10 },
        replanMode: 'suggest',
        requireHumanReview: true,
      },
    });
    expect(updated).toEqual(
      expect.objectContaining({
        coordinatorAgentId: agent.id,
        orchestrationPolicy: expect.objectContaining({ autoDispatch: true }),
        orchestrationPolicyRevision: 2,
      }),
    );

    const stale = await model.updateOrchestrationPolicy(project.id, {
      coordinatorAgentId: project.coordinatorAgentId!,
      expectedRevision: 1,
      orchestrationPolicy: {
        ...updated!.orchestrationPolicy,
        autoDispatch: false,
      },
    });
    expect(stale).toEqual(expect.objectContaining({ stale: true, orchestrationPolicyRevision: 2 }));
    expect((await model.getOrchestrationPolicy(project.id))?.orchestrationPolicy.autoDispatch).toBe(
      true,
    );

    await expect(
      model.updateOrchestrationPolicy(project.id, {
        coordinatorAgentId: agent.id,
        expectedRevision: 2,
        orchestrationPolicy: {
          ...updated!.orchestrationPolicy,
          concurrencyLimit: 101,
        },
      }),
    ).rejects.toThrow('Concurrency limit must be an integer between 1 and 100');
    expect((await model.getOrchestrationPolicy(project.id))?.orchestrationPolicyRevision).toBe(2);

    const [foreignAgent] = await serverDB
      .insert(agents)
      .values({ title: 'Foreign', userId: otherUserId })
      .returning();
    await expect(
      model.updateOrchestrationPolicy(project.id, {
        coordinatorAgentId: foreignAgent.id,
        expectedRevision: 2,
        orchestrationPolicy: updated!.orchestrationPolicy,
      }),
    ).rejects.toThrow('Coordinator agent must be an enabled project participant');
  });

  it('keeps human review enabled while a project is completing', async () => {
    const project = await createProject(model, { name: 'Review gate' });
    await model.updateStatus(project.id, 'active');
    await model.requestCompletion(project.id);

    const policy = await model.getOrchestrationPolicy(project.id);
    expect(policy?.requireHumanReviewRequired).toBe(true);
    await expect(
      model.updateOrchestrationPolicy(project.id, {
        coordinatorAgentId: project.coordinatorAgentId!,
        expectedRevision: policy!.orchestrationPolicyRevision,
        orchestrationPolicy: {
          ...policy!.orchestrationPolicy,
          requireHumanReview: false,
        },
      }),
    ).rejects.toThrow('Human review is required');
  });

  it('lets a workspace admin manage policy without broadening other project writes', async () => {
    const workspaceId = 'project-policy-admin-workspace';
    await serverDB.insert(workspaces).values({
      id: workspaceId,
      name: 'Policy Admin Workspace',
      primaryOwnerId: userId,
      slug: workspaceId,
    });
    const ownerModel = new ProjectModel(serverDB, userId, workspaceId);
    const adminModel = new ProjectModel(serverDB, otherUserId, workspaceId, {
      canManageAll: true,
    });
    const project = await createProject(ownerModel, { name: 'Admin policy' });

    expect(await adminModel.getOrchestrationPolicy(project.id)).toEqual(
      expect.objectContaining({ orchestrationPolicyRevision: 1 }),
    );
    await expect(
      adminModel.updateOrchestrationPolicy(project.id, {
        coordinatorAgentId: project.coordinatorAgentId!,
        expectedRevision: 1,
        orchestrationPolicy: project.orchestrationPolicy,
      }),
    ).resolves.toEqual(expect.objectContaining({ orchestrationPolicyRevision: 2 }));
    expect(await adminModel.update(project.id, { name: 'No broad update' })).toBeNull();
  });

  it('returns null or false for binding operations on inaccessible projects and resources', async () => {
    const foreignProject = await createProject(otherModel, { name: 'Foreign' });
    const [foreignKnowledgeBase] = await serverDB
      .insert(knowledgeBases)
      .values({ name: 'Foreign KB', userId: otherUserId })
      .returning();
    const [foreignWork] = await serverDB
      .insert(works)
      .values({
        resourceId: 'foreign-work',
        resourceType: 'github_issue',
        toolIdentifier: 'github',
        toolName: 'create_issue',
        type: 'external',
        userId: otherUserId,
        visibility: 'private',
      })
      .returning();

    expect(await model.listAgents(foreignProject.id)).toBeNull();
    expect(await model.listKnowledgeBases(foreignProject.id)).toBeNull();
    expect(await model.listWorks(foreignProject.id)).toBeNull();
    expect(await model.listTasks(foreignProject.id)).toBeNull();
    expect(await model.listCompletionReviews(foreignProject.id)).toBeNull();
    expect(await model.addAgent(foreignProject.id, { agentId: 'missing' })).toBeNull();
    expect(
      await model.addKnowledgeBase(foreignProject.id, { knowledgeBaseId: foreignKnowledgeBase.id }),
    ).toBeNull();
    expect(await model.removeAgent(foreignProject.id, 'missing')).toBe(false);
    expect(await model.removeKnowledgeBase(foreignProject.id, foreignKnowledgeBase.id)).toBe(false);
    expect(await model.addWork(foreignProject.id, { workId: 'missing' })).toBeNull();
    expect(await model.removeWork(foreignProject.id, 'missing')).toBe(false);

    const project = await createProject(model, { name: 'Local' });
    await expect(
      model.addKnowledgeBase(project.id, { knowledgeBaseId: foreignKnowledgeBase.id }),
    ).rejects.toThrow('Knowledge base not found');
    await expect(model.addWork(project.id, { workId: foreignWork.id })).rejects.toThrow(
      'Work not found',
    );
  });

  it('associates one durable Work with multiple projects without changing Work ownership', async () => {
    const firstProject = await createProject(model, { name: 'First Work Project' });
    const secondProject = await createProject(model, { name: 'Second Work Project' });
    const [work] = await serverDB
      .insert(works)
      .values({
        resourceId: 'alexj11324/orvilo1#1',
        resourceType: 'github_pull_request',
        toolIdentifier: 'github',
        toolName: 'create_pull_request',
        type: 'external',
        userId,
        visibility: 'private',
      })
      .returning();

    await model.addWork(firstProject.id, { sortOrder: 2, workId: work.id });
    await model.addWork(secondProject.id, { workId: work.id });
    await model.addWork(firstProject.id, { sortOrder: 1, workId: work.id });

    expect(await model.listWorks(firstProject.id)).toEqual([
      expect.objectContaining({
        binding: expect.objectContaining({ sortOrder: 1 }),
        work: expect.objectContaining({ id: work.id }),
      }),
    ]);
    expect(
      await serverDB.select().from(projectWorks).where(eq(projectWorks.workId, work.id)),
    ).toHaveLength(2);

    expect(await model.removeWork(firstProject.id, work.id)).toBe(true);
    expect(await model.removeWork(firstProject.id, work.id)).toBe(false);
    expect(await model.listWorks(secondProject.id)).toHaveLength(1);
    expect(await serverDB.select().from(works).where(eq(works.id, work.id))).toHaveLength(1);
  });

  it('moves a task subtree into a project', async () => {
    const project = await createProject(model, { name: 'Tasks' });
    const taskModel = new TaskModel(serverDB, userId);
    const parent = await taskModel.create({ instruction: 'Parent' });
    const child = await taskModel.create({ instruction: 'Child', parentTaskId: parent.id });

    const moved = await model.moveTaskTree(project.id, parent.id);
    expect(moved?.map(({ id }) => id).sort()).toEqual([child.id, parent.id].sort());
    const projectTasks = await model.listTasks(project.id);
    expect(projectTasks?.map(({ id }) => id).sort()).toEqual([child.id, parent.id].sort());
  });

  it('preserves project tree boundaries when moving tasks', async () => {
    const source = await createProject(model, { name: 'Source' });
    const target = await createProject(model, { name: 'Target' });
    const taskModel = new TaskModel(serverDB, userId);
    const parent = await taskModel.create({ instruction: 'Parent', projectId: source.id });
    const child = await taskModel.create({
      instruction: 'Child',
      parentTaskId: parent.id,
      projectId: source.id,
    });

    await expect(model.moveTaskTree(target.id, child.id)).rejects.toThrow(
      'Cannot move a task away from its parent project',
    );
    await serverDB.update(tasks).set({ projectId: target.id }).where(eq(tasks.id, parent.id));
    expect(await model.moveTaskTree(target.id, child.id)).toEqual([
      expect.objectContaining({ id: child.id }),
    ]);
    await expect(model.moveTaskTree(target.id, 'missing')).rejects.toThrow('Task not found');
    expect(await model.moveTaskTree('missing', child.id)).toBeNull();
  });

  it('rejects moving a workspace task tree with descendants created by another member', async () => {
    await serverDB.insert(workspaces).values({
      id: 'mixed-tree-workspace',
      name: 'Mixed Tree',
      primaryOwnerId: userId,
      slug: 'mixed-tree-workspace',
    });
    const workspaceModel = new ProjectModel(serverDB, userId, 'mixed-tree-workspace');
    const ownerTasks = new TaskModel(serverDB, userId, 'mixed-tree-workspace');
    const memberTasks = new TaskModel(serverDB, otherUserId, 'mixed-tree-workspace');
    const project = await createProject(workspaceModel, { name: 'Target' });
    const parent = await ownerTasks.create({ instruction: 'Parent' });
    await memberTasks.create({
      instruction: 'Member child',
      parentTaskId: parent.id,
      visibility: 'private',
    });

    await expect(workspaceModel.moveTaskTree(project.id, parent.id)).rejects.toThrow(
      'Cannot move a task tree containing tasks created by another user',
    );
  });

  it('enforces project boundaries in the shared dependency model path', async () => {
    const firstProject = await createProject(model, { name: 'First' });
    const secondProject = await createProject(model, { name: 'Second' });
    const taskModel = new TaskModel(serverDB, userId);
    const first = await taskModel.create({ instruction: 'First', projectId: firstProject.id });
    const second = await taskModel.create({ instruction: 'Second', projectId: secondProject.id });

    await expect(taskModel.addDependency(first.id, second.id)).rejects.toThrow(
      'Task dependencies cannot cross project boundaries',
    );
    await expect(taskModel.addDependency(first.id, 'missing')).rejects.toThrow('Task not found');
  });

  it('requires review state and records immutable human completion decisions', async () => {
    const project = await createProject(model, { name: 'Reviewed' });
    await model.updateStatus(project.id, 'active');
    await model.requestCompletion(project.id);

    const rejected = await model.reviewCompletion(project.id, 'rejected', 'Needs evidence');
    expect(rejected?.project.status).toBe('active');
    expect(rejected?.review.round).toBe(1);

    await model.requestCompletion(project.id);
    const accepted = await model.reviewCompletion(project.id, 'accepted', 'Approved');
    expect(accepted?.project.status).toBe('completed');
    expect(accepted?.project.completedReviewId).toBe(accepted?.review.id);
    expect(accepted?.review.round).toBe(2);

    const reviews = await model.listCompletionReviews(project.id);
    expect(reviews?.map(({ decision }) => decision)).toEqual(['accepted', 'rejected']);
    expect(
      await serverDB
        .select()
        .from(projectCompletionReviews)
        .where(
          and(
            eq(projectCompletionReviews.projectId, project.id),
            eq(projectCompletionReviews.reviewerUserId, userId),
          ),
        ),
    ).toHaveLength(2);

    const reopened = await model.reopen(project.id);
    expect(reopened).toEqual(
      expect.objectContaining({ completedAt: null, completedReviewId: null, status: 'active' }),
    );
  });

  it('requires reopen for completed projects even after archival', async () => {
    const project = await createProject(model, { name: 'Archived completion' });
    await model.updateStatus(project.id, 'active');
    await model.requestCompletion(project.id);
    await model.reviewCompletion(project.id, 'accepted');
    await model.updateStatus(project.id, 'archived');

    await expect(model.updateStatus(project.id, 'active')).rejects.toThrow(
      'An archived completed project must be reopened',
    );
    expect(await model.reopen(project.id)).toEqual(
      expect.objectContaining({ completedReviewId: null, status: 'active' }),
    );
  });

  it('covers lifecycle guards and missing review targets', async () => {
    const project = await createProject(model, { name: 'Lifecycle' });
    expect(await model.updateStatus('missing', 'active')).toBeNull();
    await expect(model.updateStatus(project.id, 'completed')).rejects.toThrow(
      'Completion states must be changed through the review workflow',
    );
    await expect(model.updateStatus(project.id, 'reviewing')).rejects.toThrow(
      'Completion states must be changed through the review workflow',
    );
    await model.updateStatus(project.id, 'active');
    const startedAt = (await model.findById(project.id))?.startedAt;
    await model.updateStatus(project.id, 'paused');
    await model.updateStatus(project.id, 'active');
    expect((await model.findById(project.id))?.startedAt).toEqual(startedAt);
    await model.requestCompletion(project.id);
    await expect(model.updateStatus(project.id, 'paused')).rejects.toThrow(
      'A project awaiting review must be accepted or rejected',
    );
    await expect(model.reviewCompletion('missing', 'accepted')).resolves.toBeNull();
    await expect(model.reviewCompletion(project.id, 'rejected')).resolves.toEqual(
      expect.objectContaining({ project: expect.objectContaining({ status: 'active' }) }),
    );
    await expect(model.reviewCompletion(project.id, 'accepted')).rejects.toThrow(
      'Project is not awaiting review',
    );
    expect(await model.reopen(project.id)).toBeNull();
  });

  it('handles completed transitions and a concurrent deletion during status update', async () => {
    const completed = await createProject(model, { name: 'Completed' });
    await model.updateStatus(completed.id, 'active');
    await model.requestCompletion(completed.id);
    await model.reviewCompletion(completed.id, 'accepted');
    await expect(model.updateStatus(completed.id, 'active')).rejects.toThrow(
      'A completed project must be reopened',
    );

    const disappearing = await createProject(model, { name: 'Disappearing' });
    const snapshot = await model.findManageableById(disappearing.id);
    await serverDB.delete(projects).where(eq(projects.id, disappearing.id));
    vi.spyOn(model, 'findManageableById').mockResolvedValueOnce(snapshot);
    expect(await model.updateStatus(disappearing.id, 'active')).toBeNull();
  });

  it('rejects completion requests from invalid states', async () => {
    const project = await createProject(model, { name: 'Backlog' });
    await expect(model.requestCompletion(project.id)).rejects.toThrow(
      'Only active or paused projects can request completion',
    );
    expect(await serverDB.select().from(tasks).where(eq(tasks.projectId, project.id))).toEqual([]);
    expect(await model.requestCompletion('missing')).toBeNull();
    expect(await model.getEnabledKnowledgeBaseIdsForTask('missing')).toEqual([]);
    const standaloneTask = await new TaskModel(serverDB, userId).create({
      instruction: 'Standalone',
    });
    expect(await model.getEnabledKnowledgeBaseIdsForTask(standaloneTask.id)).toEqual([]);
  });
});
