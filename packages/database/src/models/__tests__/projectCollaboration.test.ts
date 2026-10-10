// @vitest-environment node
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agentHistoryJobAgents,
  agentHistoryJobs,
  agentOperations,
  agents,
  agentsToSessions,
  chatGroups,
  chatGroupsAgents,
  devices,
  messages,
  projectAgents,
  projectMembers,
  projects,
  projectTeams,
  resourcePermissions,
  sessions,
  tasks,
  teams,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import { AgentModel } from '../agent';
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
  await db.delete(agentHistoryJobs).where(eq(agentHistoryJobs.sourceUserId, member));
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
  const createManagedProject = async (identifier = 'DEL') => {
    await db
      .insert(devices)
      .values({
        deviceId: 'collab-delete-host',
        identitySource: 'fallback',
        userId: member,
        workspaceId,
        visibility: 'public',
      })
      .onConflictDoNothing();
    const project = await projectModel(member).create(
      { identifier, name: 'Owned coordinator' },
      {
        agencyConfig: {
          boundDeviceId: 'collab-delete-host',
          executionTarget: 'device',
          heterogeneousProvider: { type: 'codex' },
        },
        model: null,
        provider: null,
        params: { orchestratorSourceAgentId: 'collab-source' },
      },
    );
    await db
      .insert(projectMembers)
      .values({ projectId: project.id, workspaceId, userId: manager, role: 'manager' });
    return project;
  };

  const addHistory = async (agentId: string) => {
    const [session] = await db
      .insert(sessions)
      .values({ userId: member, workspaceId, type: 'agent' })
      .returning();
    await db
      .insert(agentsToSessions)
      .values({ userId: member, workspaceId, agentId, sessionId: session.id });
    const [topic] = await db
      .insert(topics)
      .values({
        userId: member,
        workspaceId,
        agentId,
        sessionId: session.id,
        title: 'Independent history',
      })
      .returning();
    const messageResult = await db
      .insert(messages)
      .values({
        userId: member,
        workspaceId,
        agentId,
        sessionId: session.id,
        topicId: topic.id,
        role: 'user',
        content: 'Keep original history',
      })
      .returning();
    const [message] = Array.isArray(messageResult) ? messageResult : messageResult.rows;
    return { session, topic, message };
  };
  const replaceCoordinator = async (projectId: string, agentId: string) => {
    await projectModel(member).addAgent(projectId, { agentId, role: 'coordinator' });
    // Seed retained legacy linkage; the orchestration policy API has been retired.
    await db
      .update(projects)
      .set({ coordinatorAgentId: agentId })
      .where(eq(projects.id, projectId));
  };
  it.each(['builtin', 'former Project coordinator'] as const)(
    'retains independent %s Agent, session and history after a distinct manager deletes its new Project',
    async (kind) => {
      const builtin = await new AgentModel(db, member, workspaceId).getBuiltinAgent('inbox');
      let agentId = builtin!.id;
      if (kind === 'former Project coordinator') {
        const old = await createManagedProject('OLD');
        agentId = old.coordinatorAgentId!;
        await replaceCoordinator(old.id, builtin!.id);
        await projectModel(member).delete(old.id);
        expect(await projectModel(member).findById(old.id)).toBeNull();
      }
      const history = await addHistory(agentId);
      const project = await createManagedProject('NEW');
      await replaceCoordinator(project.id, agentId);
      await expect(new AgentModel(db, manager, workspaceId).delete(agentId)).rejects.toThrow(
        'Agent Manage',
      );
      expect(await projectModel(manager).delete(project.id)).toMatchObject({ id: project.id });
      expect(await projectModel(member).findById(project.id)).toBeNull();
      expect(await db.select().from(agents).where(eq(agents.id, agentId))).toHaveLength(1);
      expect(await db.select().from(sessions).where(eq(sessions.id, history.session.id))).toEqual([
        history.session,
      ]);
      expect(await db.select().from(topics).where(eq(topics.id, history.topic.id))).toEqual([
        history.topic,
      ]);
      expect(await db.select().from(messages).where(eq(messages.id, history.message.id))).toEqual([
        history.message,
      ]);
      expect(
        await db.select().from(agentsToSessions).where(eq(agentsToSessions.agentId, agentId)),
      ).toHaveLength(1);
      expect(
        await db.select().from(resourcePermissions).where(eq(resourcePermissions.userId, manager)),
      ).toEqual([]);
    },
  );

  it.each([member, owner])(
    'retains a replacement builtin and its history even when %s has Agent Manage',
    async (actor) => {
      const builtin = await new AgentModel(db, member, workspaceId).getBuiltinAgent('inbox');
      const history = await addHistory(builtin!.id);
      const project = await createManagedProject();
      await replaceCoordinator(project.id, builtin!.id);
      if (actor === owner)
        await db
          .update(workspaceMembers)
          .set({ role: 'admin' })
          .where(eq(workspaceMembers.userId, actor));
      expect(await projectModel(actor).delete(project.id)).toMatchObject({ id: project.id });
      expect(await db.select().from(agents).where(eq(agents.id, builtin!.id))).toHaveLength(1);
      expect(await db.select().from(sessions).where(eq(sessions.id, history.session.id))).toEqual([
        history.session,
      ]);
      expect(await db.select().from(messages).where(eq(messages.id, history.message.id))).toEqual([
        history.message,
      ]);
    },
  );

  it('deletes the Project and retains its coordinator as a distinct manager without Agent Manage or Use', async () => {
    const project = await createManagedProject();
    const agentModel = new AgentModel(db, manager, workspaceId);
    await expect(agentModel.delete(project.coordinatorAgentId!)).rejects.toThrow('Agent Manage');
    expect(
      await db.select().from(resourcePermissions).where(eq(resourcePermissions.userId, manager)),
    ).toEqual([]);
    expect(await projectModel(manager).delete(project.id)).toMatchObject({
      id: project.id,
      coordinatorAgentId: project.coordinatorAgentId,
    });
    expect(
      await db.select().from(agents).where(eq(agents.id, project.coordinatorAgentId!)),
    ).toHaveLength(1);
    expect(await projectModel(member).findById(project.id)).toBeNull();
    expect(
      await db.select().from(resourcePermissions).where(eq(resourcePermissions.userId, manager)),
    ).toEqual([]);
  });

  it.each([member, owner])(
    'uses actual Agent Manage for coordinator/session/history cleanup by %s',
    async (actor) => {
      const project = await createManagedProject();
      const history = await addHistory(project.coordinatorAgentId!);
      if (actor === owner)
        await db
          .update(workspaceMembers)
          .set({ role: 'admin' })
          .where(eq(workspaceMembers.userId, actor));
      expect(await projectModel(actor).delete(project.id)).toMatchObject({ id: project.id });
      expect(
        await db.select().from(agents).where(eq(agents.id, project.coordinatorAgentId!)),
      ).toEqual([]);
      expect(await db.select().from(sessions).where(eq(sessions.id, history.session.id))).toEqual(
        [],
      );
      expect(await db.select().from(topics).where(eq(topics.id, history.topic.id))).toEqual([]);
      expect(await db.select().from(messages).where(eq(messages.id, history.message.id))).toEqual(
        [],
      );
    },
  );

  it('retains a legacy private coordinator when Project management does not give Agent Manage', async () => {
    const project = await createManagedProject();
    await db
      .update(agents)
      .set({ visibility: 'private' })
      .where(eq(agents.id, project.coordinatorAgentId!));
    expect(await projectModel(manager).delete(project.id)).toMatchObject({ id: project.id });
    expect(
      await db.select().from(agents).where(eq(agents.id, project.coordinatorAgentId!)),
    ).toHaveLength(1);
  });

  it('rolls back Project and coordinator deletion while the coordinator has a live operation', async () => {
    const project = await createManagedProject();
    await db.insert(agentOperations).values({
      id: 'collab-live-coordinator',
      agentId: project.coordinatorAgentId,
      userId: member,
      workspaceId,
      status: 'running',
    });
    await expect(projectModel(manager).delete(project.id)).rejects.toThrow(
      'active Agent operations',
    );
    expect(await projectModel(manager).findById(project.id)).toMatchObject({
      coordinatorAgentId: project.coordinatorAgentId,
    });
    expect(
      await db.select().from(agents).where(eq(agents.id, project.coordinatorAgentId!)),
    ).toHaveLength(1);
  });

  it.each([manager, member, owner])(
    'retains another Project binding when %s removes its own Project',
    async (actor) => {
      const project = await createManagedProject();
      await db.insert(projects).values({
        id: 'collab-foreign-owner',
        identifier: 'FOR',
        name: 'Foreign',
        userId: member,
        workspaceId,
        visibility: 'public',
      });
      await db.insert(projectAgents).values({
        projectId: 'collab-foreign-owner',
        agentId: project.coordinatorAgentId!,
        workspaceId,
        role: 'coordinator',
        addedByUserId: member,
      });
      expect(await projectModel(actor).delete(project.id)).toMatchObject({ id: project.id });
      expect(await projectModel(manager).findById(project.id)).toBeNull();
      expect(
        await db.select().from(agents).where(eq(agents.id, project.coordinatorAgentId!)),
      ).toHaveLength(1);
    },
  );

  it('deletes the Project while retaining an enabled independent replacement coordinator', async () => {
    const project = await createManagedProject();
    const [independent] = await db
      .insert(agents)
      .values({ userId: member, workspaceId, visibility: 'public', virtual: false })
      .returning();
    await db.insert(projectAgents).values({
      projectId: project.id,
      agentId: independent.id,
      workspaceId,
      role: 'coordinator',
      addedByUserId: member,
    });
    // Seed retained legacy linkage; deletion still goes through the real governance path.
    await db
      .update(projects)
      .set({ coordinatorAgentId: independent.id })
      .where(eq(projects.id, project.id));
    expect(await projectModel(manager).delete(project.id)).toMatchObject({ id: project.id });
    expect(await projectModel(manager).findById(project.id)).toBeNull();
    expect(await db.select().from(agents).where(eq(agents.id, independent.id))).toHaveLength(1);
  });

  it('revalidates actual Project governance and the exact coordinator on lifecycle cleanup', async () => {
    const project = await createManagedProject();
    const model = new AgentModel(db, manager, workspaceId);
    await expect(
      model.deleteProjectCoordinator(projectId, project.coordinatorAgentId!),
    ).rejects.toThrow('current Project governance');
    for (const actor of [viewer, inactive]) {
      await expect(
        new AgentModel(db, actor, workspaceId).deleteProjectCoordinator(
          project.id,
          project.coordinatorAgentId!,
        ),
      ).rejects.toThrow('current Project governance');
    }
    await db
      .update(projectMembers)
      .set({ suspendedAt: new Date() })
      .where(eq(projectMembers.userId, manager));
    await expect(
      model.deleteProjectCoordinator(project.id, project.coordinatorAgentId!),
    ).rejects.toThrow('current Project governance');
    expect(await projectModel(member).findById(project.id)).not.toBeNull();
    expect(
      await db.select().from(agents).where(eq(agents.id, project.coordinatorAgentId!)),
    ).toHaveLength(1);
  });

  it.each([
    'Issue assignment',
    'pending history job',
    'pending source copy',
    'pending source remap',
  ] as const)('retains the %s guard and atomic Project rollback', async (dependency) => {
    const project = await createManagedProject();
    if (dependency === 'Issue assignment') {
      await db.insert(tasks).values({
        id: 'collab-assigned',
        identifier: 'DEL-1',
        seq: 1,
        name: 'Assigned',
        instruction: 'Keep dependency',
        createdByUserId: member,
        workspaceId,
        projectId: project.id,
        assigneeAgentId: project.coordinatorAgentId,
      });
    } else {
      const [job] = await db
        .insert(agentHistoryJobs)
        .values({
          agentIds: [project.coordinatorAgentId!],
          payload:
            dependency === 'pending source copy'
              ? {
                  agents: [
                    { sourceAgentId: project.coordinatorAgentId!, newAgentId: 'other-target' },
                  ],
                }
              : dependency === 'pending source remap'
                ? {
                    agentIdRemap: [
                      { sourceAgentId: project.coordinatorAgentId!, newAgentId: 'other-target' },
                    ],
                  }
                : {},
          sessionIds: [],
          sourceUserId: member,
          targetUserId: member,
          status: 'pending',
          totalTopics: 1,
          type: dependency === 'pending source remap' ? 'transfer' : 'copy',
        })
        .returning();
      if (dependency === 'pending history job')
        await db
          .insert(agentHistoryJobAgents)
          .values({ agentId: project.coordinatorAgentId!, jobId: job.id });
    }
    await expect(projectModel(member).delete(project.id)).rejects.toThrow(
      dependency === 'Issue assignment'
        ? 'Reassign Issues'
        : dependency === 'pending source copy'
          ? 'AGENT_COPY_IN_PROGRESS'
          : 'AGENT_TRANSFER_IN_PROGRESS',
    );
    expect(await projectModel(member).findById(project.id)).not.toBeNull();
    expect(
      await db.select().from(agents).where(eq(agents.id, project.coordinatorAgentId!)),
    ).toHaveLength(1);
  });

  it.each([manager, member, owner])(
    'retains a reused Group coordinator when %s deletes its Project',
    async (actor) => {
      const project = await createManagedProject();
      const [group] = await db
        .insert(chatGroups)
        .values({ userId: member, workspaceId, visibility: 'public', title: 'Independent Group' })
        .returning();
      await db.insert(chatGroupsAgents).values({
        userId: member,
        workspaceId,
        chatGroupId: group.id,
        agentId: project.coordinatorAgentId!,
        role: 'participant',
      });
      expect(await projectModel(actor).delete(project.id)).toMatchObject({ id: project.id });
      expect(
        await db.select().from(agents).where(eq(agents.id, project.coordinatorAgentId!)),
      ).toHaveLength(1);
    },
  );

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
    await db.update(teams).set({ status: 'archived' }).where(eq(teams.id, 'collab-team'));
    expect(
      await db.select().from(projectTeams).where(eq(projectTeams.projectId, projectId)),
    ).toHaveLength(1);
    await expect(
      new TeamModel(db, viewer, workspaceId).unlinkProject(projectId, 'collab-team'),
    ).rejects.toThrow('Writable workspace');
    await expect(
      new TeamModel(db, member, workspaceId).linkProject(projectId, 'collab-private-team'),
    ).rejects.toThrow('Team not available');
    await expect(
      new TeamModel(db, member, workspaceId).unlinkProject(projectId, 'collab-private-team'),
    ).rejects.toThrow('Team not available');
    await expect(
      new TeamModel(db, member, 'foreign-scope').unlinkProject(projectId, 'collab-team'),
    ).rejects.toThrow('Writable workspace');
    await expect(
      new TeamModel(db, member, workspaceId).linkProject(projectId, 'collab-team'),
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

  it('reads workspace Issues in private Teams for every active role and denies inactive, foreign and personal callers', async () => {
    await db.insert(teams).values({
      id: 'collab-private-team',
      workspaceId,
      key: 'PRI',
      name: 'Private',
      visibility: 'private',
    });
    await db.insert(tasks).values({
      id: 'collab-private-team-task',
      identifier: 'COLLAB-2',
      seq: 2,
      name: 'Workspace Issue',
      instruction: 'Dialogue',
      createdByUserId: owner,
      workspaceId,
      projectId,
      teamId: 'collab-private-team',
      visibility: 'private',
    });
    for (const actor of [owner, member, manager, viewer]) {
      expect(await taskModel(actor).findById('collab-private-team-task')).toMatchObject({
        visibility: 'public',
      });
      expect(await projectModel(actor).listTasks(projectId)).toHaveLength(1);
    }
    expect(await taskModel(inactive).findById('collab-private-team-task')).toBeNull();
    expect(
      await taskModel(member, 'foreign-scope').findById('collab-private-team-task'),
    ).toBeNull();
    expect(await new TaskModel(db, owner).findById('collab-private-team-task')).toBeNull();
    expect(await new TeamModel(db, member, workspaceId).listReadable()).toEqual([]);
  });

  it('allows ordinary Issue comments without Agent Use and keeps edits/deletes author-only', async () => {
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
      authorUserId: member,
    });
    expect((await taskModel(member).getComments('collab-task'))[0].capabilities).toEqual({
      canEdit: true,
      canDelete: true,
    });
    expect((await taskModel(manager).getComments('collab-task'))[0].capabilities).toEqual({
      canEdit: false,
      canDelete: false,
    });
    expect((await taskModel(owner).getComments('collab-task'))[0].capabilities).toEqual({
      canEdit: false,
      canDelete: false,
    });
    expect((await taskModel(viewer).getComments('collab-task'))[0].capabilities).toEqual({
      canEdit: false,
      canDelete: false,
    });
    await expect(
      taskModel(manager).updateComment(comment.id, 'Not my words'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await taskModel(member).updateComment(comment.id, 'My revision')).toMatchObject({
      content: 'My revision',
    });
    for (const actor of [viewer, manager, owner]) {
      await expect(taskModel(actor).deleteComment(comment.id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
    expect(await taskModel(member).findCommentById(comment.id)).toMatchObject({
      content: 'My revision',
    });
    expect(await taskModel(member).deleteComment(comment.id)).toBe(true);
    const authorComment = await taskModel(member).addComment({
      taskId: 'collab-task',
      userId: member,
      content: 'Author removes',
      authorUserId: member,
    });
    expect(await taskModel(member).deleteComment(authorComment.id)).toBe(true);
    await expect(taskModel(member).delete('collab-task')).rejects.toThrow(
      'creator, project manager',
    );
    expect(await taskModel(manager).delete('collab-task')).toBe(true);
  });
});
