// @vitest-environment node
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  devices,
  projectMembers,
  projects,
  projectTeams,
  tasks,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import { ProjectModel } from '../project';
import { TaskModel } from '../task';
import { TeamModel } from '../team';

const db = await getTestDB();
const actors = [
  'collab-owner',
  'collab-member',
  'collab-manager',
  'collab-viewer',
  'collab-inactive',
];
const [owner, member, manager, viewer, inactive] = actors;
const workspaceId = 'collab-ws';
const projectId = 'collab-project';
const cleanup = async () => {
  await db.delete(projects).where(eq(projects.id, 'collab-personal'));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(inArray(users.id, actors));
};
beforeEach(async () => {
  await cleanup();
  await db.insert(users).values(actors.map((id) => ({ id })));
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: 'Collaboration', slug: workspaceId, primaryOwnerId: owner });
  await db.insert(workspaceMembers).values(
    actors.map((userId) => ({
      workspaceId,
      userId,
      role: userId === owner ? 'owner' : userId === viewer ? 'viewer' : 'member',
      suspendedAt: userId === inactive ? new Date() : null,
    })),
  );
  await db.insert(projects).values({
    id: projectId,
    identifier: 'COLLAB',
    name: 'Shared',
    userId: owner,
    workspaceId,
    visibility: 'public',
    leadUserId: member,
    status: 'active',
  });
  await db
    .insert(projectMembers)
    .values({ projectId, workspaceId, userId: manager, role: 'manager' });
});
afterEach(async () => {
  await cleanup();
});
const projectModel = (id: string, scope = workspaceId) => new ProjectModel(db, id, scope);
const taskModel = (id: string, scope = workspaceId) => new TaskModel(db, id, scope);

describe('Project and Issue collaboration boundaries', () => {
  it('creates public workspace Projects and initializes the active creator as manager', async () => {
    await db.insert(devices).values({
      deviceId: 'collab-host',
      identitySource: 'fallback',
      userId: member,
      workspaceId,
      visibility: 'public',
    });
    const project = await projectModel(member).create(
      { identifier: 'NEW', name: 'New', memberIds: [member] },
      {
        agencyConfig: {
          boundDeviceId: 'collab-host',
          executionTarget: 'device',
          heterogeneousProvider: { type: 'codex' },
        },
        model: null,
        provider: null,
        params: { orchestratorSourceAgentId: 'collab-source' },
      },
    );
    expect(project.visibility).toBe('public');
    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, project.id));
    expect(membership).toMatchObject({ userId: member, role: 'manager' });
    expect(await projectModel(member).getCapabilities(project.id)).toEqual({
      canEdit: true,
      canComment: true,
      canManage: true,
    });
  });

  it('rejects explicit private workspace creation before inserting any Project, Agent or member', async () => {
    await db.insert(devices).values({
      deviceId: 'collab-private-request-host',
      identitySource: 'fallback',
      userId: member,
      workspaceId,
      visibility: 'public',
    });
    const runtime = {
      agencyConfig: {
        boundDeviceId: 'collab-private-request-host',
        executionTarget: 'device' as const,
        heterogeneousProvider: { type: 'codex' as const },
      },
      model: null,
      provider: null,
      params: { orchestratorSourceAgentId: 'collab-source' },
    };
    const before = [
      await db.select().from(projects),
      await db.select().from(agents),
      await db.select().from(projectMembers),
    ];
    await expect(
      projectModel(member).create(
        { identifier: 'PRIV', name: 'Explicit private', visibility: 'private' },
        runtime,
      ),
    ).rejects.toThrow('New workspace Projects must be public');
    expect([
      await db.select().from(projects),
      await db.select().from(agents),
      await db.select().from(projectMembers),
    ]).toEqual(before);

    await db.insert(devices).values({
      deviceId: 'collab-personal-host',
      identitySource: 'fallback',
      userId: member,
      visibility: 'private',
    });
    const personal = await new ProjectModel(db, member).create(
      { identifier: 'PERS', name: 'Personal private', visibility: 'private' },
      {
        ...runtime,
        agencyConfig: { ...runtime.agencyConfig, boundDeviceId: 'collab-personal-host' },
      },
    );
    expect(personal).toMatchObject({ workspaceId: null, visibility: 'private' });
    await db.delete(projects).where(eq(projects.id, personal.id));
  });

  it('lets a nonparticipant Member edit properties and milestones but denies Lead governance', async () => {
    const model = projectModel(member);
    expect(await model.getCapabilities(projectId)).toEqual({
      canEdit: true,
      canComment: true,
      canManage: false,
    });
    expect(await model.update(projectId, { name: 'Edited' })).toMatchObject({ name: 'Edited' });
    expect(await model.createMilestone(projectId, { name: 'Shared milestone' })).toMatchObject({
      name: 'Shared milestone',
    });
    expect(await model.reviewCompletion(projectId, 'accepted')).toBeNull();
    expect(await model.delete(projectId)).toBeNull();
    await expect(model.updateStatus(projectId, 'completed')).rejects.toThrow('review workflow');
  });

  it('grants manager governance while Viewer, inactive and cross-scope callers cannot write', async () => {
    expect(await projectModel(manager).getCapabilities(projectId)).toEqual({
      canEdit: true,
      canComment: true,
      canManage: true,
    });
    for (const actor of [viewer, inactive]) {
      expect(await projectModel(actor).getCapabilities(projectId)).toEqual({
        canEdit: false,
        canComment: false,
        canManage: false,
      });
      expect(await projectModel(actor).update(projectId, { name: 'Denied' })).toBeNull();
    }
    expect(await projectModel(member, 'other-scope').findById(projectId)).toBeNull();
    expect(await projectModel(manager).requestCompletion(projectId)).toMatchObject({
      status: 'reviewing',
    });
    expect(await projectModel(manager).reviewCompletion(projectId, 'accepted')).toMatchObject({
      project: { status: 'completed' },
    });
  });

  it('keeps historical private projects private and personal records owner-scoped', async () => {
    await db.update(projects).set({ visibility: 'private' }).where(eq(projects.id, projectId));
    expect(await projectModel(member).findById(projectId)).toBeNull();
    await expect(projectModel(owner).update(projectId, { visibility: 'public' })).rejects.toThrow(
      'approved publication',
    );
    await db
      .insert(projects)
      .values({ id: 'collab-personal', identifier: 'PERS', name: 'Personal', userId: owner });
    expect(await new ProjectModel(db, owner).findById('collab-personal')).not.toBeNull();
    expect(await new ProjectModel(db, member).findById('collab-personal')).toBeNull();
  });

  it.each(['viewer', 'commenter'] as const)(
    'keeps pending private %s grants read/comment-only before approved conversion',
    async (role) => {
      await db.update(projects).set({ visibility: 'private' }).where(eq(projects.id, projectId));
      await db.insert(projectMembers).values({ projectId, workspaceId, userId: member, role });
      const model = projectModel(member);
      expect(await model.findById(projectId)).not.toBeNull();
      expect(await model.update(projectId, { name: 'Unapproved title' })).toBeNull();
      expect(
        await model.update(projectId, { description: 'Unapproved body', startDate: '2026-10-10' }),
      ).toBeNull();
      expect(await model.createMilestone(projectId, { name: 'Unapproved milestone' })).toBeNull();
      expect(await model.getCapabilities(projectId)).toMatchObject({
        canEdit: false,
        canManage: false,
        canComment: true,
      });
      const comment = await model.createUpdate(projectId, {
        kind: 'comment',
        body: 'Existing comment authority',
      });
      expect(comment).not.toBeNull();
      expect(
        await model.updateUpdate(projectId, comment!.id, { body: 'Author revision' }),
      ).toMatchObject({ body: 'Author revision' });
      expect(await model.deleteUpdate(projectId, comment!.id)).toMatchObject({ id: comment!.id });
      expect(await projectModel(owner).findById(projectId)).toMatchObject({
        visibility: 'private',
        name: 'Shared',
        description: null,
        startDate: null,
      });
      const [grant] = await db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.userId, member));
      expect(grant.role).toBe(role);

      // An explicitly published scope adopts ordinary workspace collaboration without rewriting the legacy role row.
      await db.update(projects).set({ visibility: 'public' }).where(eq(projects.id, projectId));
      expect(await model.update(projectId, { name: 'Published collaboration' })).toMatchObject({
        name: 'Published collaboration',
      });
      expect(await model.getCapabilities(projectId)).toMatchObject({
        canEdit: true,
        canComment: true,
      });
    },
  );

  it('keeps target contributor/manager roles editable within their private scoped Project', async () => {
    await db.update(projects).set({ visibility: 'private' }).where(eq(projects.id, projectId));
    await db
      .insert(projectMembers)
      .values({ projectId, workspaceId, userId: member, role: 'contributor' });
    expect(
      await projectModel(member).update(projectId, { name: 'Participant edit' }),
    ).toMatchObject({ name: 'Participant edit' });
    expect(await projectModel(manager).update(projectId, { name: 'Manager edit' })).toMatchObject({
      name: 'Manager edit',
    });
  });

  it('lets ordinary collaborators associate readable Teams and denies Viewer/private-Team access', async () => {
    await db.insert(teams).values([
      { id: 'collab-team', workspaceId, key: 'PUB', name: 'Public', visibility: 'public' },
      {
        id: 'collab-private-team',
        workspaceId,
        key: 'PRI',
        name: 'Private',
        visibility: 'private',
      },
    ]);
    await new TeamModel(db, member, workspaceId).linkProject(projectId, 'collab-team');
    expect(
      await db.select().from(projectTeams).where(eq(projectTeams.projectId, projectId)),
    ).toHaveLength(1);
    await expect(
      new TeamModel(db, viewer, workspaceId).unlinkProject(projectId, 'collab-team'),
    ).rejects.toThrow('Writable workspace');
    await expect(
      new TeamModel(db, member, workspaceId).linkProject(projectId, 'collab-private-team'),
    ).rejects.toThrow('Team not available');
    await new TeamModel(db, member, workspaceId).unlinkProject(projectId, 'collab-team');
    expect(
      await db.select().from(projectTeams).where(eq(projectTeams.projectId, projectId)),
    ).toHaveLength(0);
  });

  it('keeps Project comment edits author-only and deletion under manager/admin governance', async () => {
    const comment = await projectModel(member).createUpdate(projectId, {
      body: 'Member note',
      kind: 'comment',
    });
    expect(comment).not.toBeNull();
    expect(
      await projectModel(manager).updateUpdate(projectId, comment!.id, { body: 'Other words' }),
    ).toBeNull();
    expect(
      await projectModel(owner).updateUpdate(projectId, comment!.id, { body: 'Admin words' }),
    ).toBeNull();
    expect(
      await projectModel(member).updateUpdate(projectId, comment!.id, { body: 'My words' }),
    ).toMatchObject({ body: 'My words' });
    const ownerComment = await projectModel(owner).createUpdate(projectId, {
      body: 'Owner note',
      kind: 'comment',
    });
    expect(await projectModel(member).deleteUpdate(projectId, ownerComment!.id)).toBeNull();
    expect(await projectModel(manager).deleteUpdate(projectId, ownerComment!.id)).toMatchObject({
      id: ownerComment!.id,
    });
    expect(await projectModel(member).deleteUpdate(projectId, comment!.id)).toMatchObject({
      id: comment!.id,
    });
  });

  it('allows ordinary Issue comments without Agent Use, author-only edits and governance deletes', async () => {
    await db.insert(tasks).values({
      id: 'collab-task',
      identifier: 'COLLAB-1',
      seq: 1,
      name: 'Issue',
      instruction: 'Discuss collaboration',
      createdByUserId: owner,
      workspaceId,
      projectId,
      status: 'pending',
    });
    const comment = await taskModel(member).addComment({
      taskId: 'collab-task',
      userId: member,
      content: 'Ordinary comment',
    });
    expect((await taskModel(member).getComments('collab-task'))[0].capabilities).toEqual({
      canEdit: true,
      canDelete: true,
    });
    expect((await taskModel(manager).getComments('collab-task'))[0].capabilities).toEqual({
      canEdit: false,
      canDelete: true,
    });
    expect((await taskModel(owner).getComments('collab-task'))[0].capabilities).toEqual({
      canEdit: false,
      canDelete: true,
    });
    expect((await taskModel(viewer).getComments('collab-task'))[0].capabilities).toEqual({
      canEdit: false,
      canDelete: false,
    });
    expect(await taskModel(manager).updateComment(comment.id, 'Not my words')).toBeUndefined();
    expect(await taskModel(member).updateComment(comment.id, 'My revision')).toMatchObject({
      content: 'My revision',
    });
    expect(await taskModel(viewer).deleteComment(comment.id)).toBe(false);
    expect(await taskModel(manager).deleteComment(comment.id)).toBe(true);
    const authorComment = await taskModel(member).addComment({
      taskId: 'collab-task',
      userId: member,
      content: 'Author removes',
    });
    expect(await taskModel(member).deleteComment(authorComment.id)).toBe(true);
    await expect(taskModel(member).delete('collab-task')).rejects.toThrow(
      'creator, project manager',
    );
    expect(await taskModel(manager).delete('collab-task')).toBe(true);
  });
});
