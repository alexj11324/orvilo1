import type { TaskWorkflowCategory, TeamWorkflowStateItem } from '@orvilo/types';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { ProjectModel } from '../models/project';
import { TaskModel } from '../models/task';
import { TeamModel } from '../models/team';
import { WorkspaceModel } from '../models/workspace';
import { projects } from '../schemas/project';
import { tasks } from '../schemas/task';
import { users } from '../schemas/user';
import { workspaceMembers, workspaces } from '../schemas/workspace';
import type { OrviloDatabase } from '../type';

/** The only user that the local CLI seed is allowed to mutate. */
export const LINEAR_PARITY_USER = {
  email: 'agent-testing@orvilo.aspectlylabs.com',
  id: 'user_agent_testing_001',
} as const;

export const LINEAR_PARITY_TEAM = {
  key: 'PARITY',
  name: 'Parity Test Team',
} as const;

export const LINEAR_PARITY_PROJECT = {
  identifier: 'PTP',
  name: 'Parity Test Project',
  slug: 'parity-test-project',
} as const;

const PARITY_TASK_COUNT = 16;
const PARITY_TASK_IDS = Array.from(
  { length: PARITY_TASK_COUNT },
  (_, index) => `taskparity${String(index + 1).padStart(4, '0')}`,
);
const PARITY_TASK_IDENTIFIERS = Array.from(
  { length: PARITY_TASK_COUNT },
  (_, index) => `${LINEAR_PARITY_PROJECT.identifier}-${index + 1}`,
);

export const LINEAR_PARITY_MILESTONES = [
  { date: '2026-10-15', name: 'Gate A — Synthetic Boundary', taskCount: 2 },
  { date: '2026-11-01', name: 'Gate B — Synthetic Retirement', taskCount: 7 },
  { date: '2026-11-20', name: 'Gate C — Synthetic Closure', taskCount: 3 },
  { date: '2026-12-10', name: 'Gate D — Synthetic Disposition', taskCount: 4 },
] as const;

export const LINEAR_PARITY_WORKFLOW_STATES = [
  { category: 'triage', name: 'Triage' },
  { category: 'backlog', name: 'Backlog' },
  { category: 'todo', name: 'Todo' },
  { category: 'in_progress', name: 'In Progress' },
  { category: 'in_review', name: 'In Review' },
  { category: 'done', name: 'Done' },
  { category: 'canceled', name: 'Canceled' },
] as const satisfies ReadonlyArray<{ category: TaskWorkflowCategory; name: string }>;

const PARITY_TARGETS = ['local', 'test'] as const;
export type LinearParitySeedTarget = (typeof PARITY_TARGETS)[number];

export interface LinearParitySeedOptions {
  target: LinearParitySeedTarget;
  userId: string;
  workspaceId?: string;
}

export interface LinearParitySeedResult {
  milestoneIds: string[];
  projectId: string;
  taskIds: string[];
  teamId: string;
  workflowStateIds: string[];
  workspaceId: string;
}

const seedMutation = {
  source: 'system' as const,
  suppressDomainEvent: true,
  suppressLinearOutbox: true,
};

const isFixtureUser = (row: { email: string | null; id: string }, target: LinearParitySeedTarget) =>
  target === 'test' || (row.id === LINEAR_PARITY_USER.id && row.email === LINEAR_PARITY_USER.email);

const taskMilestoneIndex = (taskIndex: number) => {
  let offset = 0;
  for (let milestoneIndex = 0; milestoneIndex < LINEAR_PARITY_MILESTONES.length; milestoneIndex++) {
    offset += LINEAR_PARITY_MILESTONES[milestoneIndex].taskCount;
    if (taskIndex < offset) return milestoneIndex;
  }
  throw new Error(`Parity task index out of range: ${taskIndex}`);
};

const assertTarget = (target: LinearParitySeedTarget) => {
  if (!PARITY_TARGETS.includes(target)) {
    throw new Error('Linear parity seed requires an explicit local or test target');
  }
};

const ensureUser = async (db: OrviloDatabase, options: LinearParitySeedOptions) => {
  const [user] = await db
    .select({ email: users.email, id: users.id })
    .from(users)
    .where(eq(users.id, options.userId))
    .limit(1);

  if (!user || !isFixtureUser(user, options.target)) {
    throw new Error('Linear parity seed only accepts the synthetic fixture user');
  }
  return user;
};

const resolveWorkspace = async (db: OrviloDatabase, options: LinearParitySeedOptions) => {
  if (options.workspaceId) {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, options.workspaceId))
      .limit(1);
    if (!workspace || workspace.primaryOwnerId !== options.userId) {
      throw new Error('Linear parity workspace must be owned by the synthetic fixture user');
    }
    const [membership] = await db
      .select({ deletedAt: workspaceMembers.deletedAt, suspendedAt: workspaceMembers.suspendedAt })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspace.id),
          eq(workspaceMembers.userId, options.userId),
        ),
      )
      .limit(1);
    if (!membership || membership.deletedAt || membership.suspendedAt) {
      throw new Error('Linear parity workspace membership is not active');
    }
    return workspace;
  }

  const owned = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.primaryOwnerId, options.userId))
    .orderBy(asc(workspaces.createdAt));
  if (owned.length === 1) return owned[0];

  const [defaultWorkspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, 'agent-testing'))
    .limit(1);
  if (defaultWorkspace) {
    if (defaultWorkspace.primaryOwnerId !== options.userId) {
      throw new Error('The agent-testing workspace slug belongs to another user');
    }
    return defaultWorkspace;
  }

  if (owned.length > 1) {
    throw new Error(
      'Linear parity seed needs an explicit workspace id when multiple owned workspaces exist',
    );
  }

  return new WorkspaceModel(db, options.userId).create({
    name: 'Agent Testing',
    slug: 'agent-testing',
  });
};

const resolveTeam = async (db: OrviloDatabase, workspaceId: string, userId: string) => {
  const model = new TeamModel(db, userId, workspaceId);
  const existing = await model.findByKey(LINEAR_PARITY_TEAM.key);
  if (existing) {
    if (
      existing.name !== LINEAR_PARITY_TEAM.name ||
      existing.createdByUserId !== userId ||
      existing.status !== 'active' ||
      existing.visibility !== 'public'
    ) {
      throw new Error('A non-fixture team already occupies the parity team key');
    }
    await model.addMember(existing.id, userId, 'lead');
    return { model, team: existing };
  }

  const team = await model.create({
    isDefault: false,
    key: LINEAR_PARITY_TEAM.key,
    name: LINEAR_PARITY_TEAM.name,
    visibility: 'public',
  });
  return { model, team };
};

const assertProjectIdentity = async (db: OrviloDatabase, workspaceId: string, userId: string) => {
  const [slugCollision] = await db
    .select({ identifier: projects.identifier, name: projects.name, userId: projects.userId })
    .from(projects)
    .where(
      and(eq(projects.workspaceId, workspaceId), eq(projects.slug, LINEAR_PARITY_PROJECT.slug)),
    )
    .limit(1);
  if (
    slugCollision &&
    (slugCollision.userId !== userId ||
      slugCollision.identifier !== LINEAR_PARITY_PROJECT.identifier ||
      slugCollision.name !== LINEAR_PARITY_PROJECT.name)
  ) {
    throw new Error('A non-fixture project already occupies the parity project slug');
  }

  const [identifierCollision] = await db
    .select({ id: projects.id, slug: projects.slug, userId: projects.userId })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.identifier, LINEAR_PARITY_PROJECT.identifier),
      ),
    )
    .limit(1);
  if (
    identifierCollision &&
    (identifierCollision.userId !== userId ||
      identifierCollision.slug !== LINEAR_PARITY_PROJECT.slug)
  ) {
    throw new Error('A non-fixture project already occupies the parity project identifier');
  }
};

const ensureWorkflowStates = async (model: TeamModel, teamId: string) => {
  const states = [] as TeamWorkflowStateItem[];
  for (const [position, state] of LINEAR_PARITY_WORKFLOW_STATES.entries()) {
    states.push(
      await model.upsertWorkflowStateByRemoteId({
        category: state.category,
        color: null,
        name: state.name,
        position,
        remoteStateId: `parity-workflow-${state.category}`,
        teamId,
      }),
    );
  }
  return states;
};

const resolveProject = async (
  db: OrviloDatabase,
  workspaceId: string,
  userId: string,
  teamId: string,
) => {
  const model = new ProjectModel(db, userId, workspaceId);
  const [existingRow] = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.workspaceId, workspaceId), eq(projects.slug, LINEAR_PARITY_PROJECT.slug)),
    )
    .limit(1);

  if (existingRow) {
    if (
      existingRow.userId !== userId ||
      existingRow.identifier !== LINEAR_PARITY_PROJECT.identifier ||
      existingRow.name !== LINEAR_PARITY_PROJECT.name
    ) {
      throw new Error('A non-fixture project already occupies the parity project slug');
    }
    const existing = await model.findById(existingRow.id);
    if (!existing) throw new Error('Parity project is not readable by its fixture owner');
    return { model, project: existing };
  }

  const [identifierCollision] = await db
    .select({ id: projects.id, slug: projects.slug, userId: projects.userId })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.identifier, LINEAR_PARITY_PROJECT.identifier),
      ),
    )
    .limit(1);
  if (identifierCollision) {
    throw new Error('A non-fixture project already occupies the parity project identifier');
  }

  const project = await model.create({
    description: 'Synthetic local fixture for Linear parity verification.',
    identifier: LINEAR_PARITY_PROJECT.identifier,
    milestones: LINEAR_PARITY_MILESTONES.map(({ date, name }) => ({ date, name })),
    name: LINEAR_PARITY_PROJECT.name,
    priority: 2,
    slug: LINEAR_PARITY_PROJECT.slug,
    startDate: '2026-09-01',
    status: 'active',
    summary: 'Synthetic project data for local parity verification.',
    targetDate: '2026-12-31',
    teamId,
    visibility: 'public',
  });
  return { model, project };
};

const ensureMilestones = async (model: ProjectModel, projectId: string) => {
  const planning = await model.getPlanning(projectId);
  if (!planning || planning.milestones.length !== LINEAR_PARITY_MILESTONES.length) {
    throw new Error('Parity project must contain exactly four synthetic milestones');
  }
  const milestones = LINEAR_PARITY_MILESTONES.map((expected, index) => {
    const actual = planning.milestones[index];
    if (actual.name !== expected.name || actual.date !== expected.date) {
      throw new Error('Parity project contains non-canonical milestone content');
    }
    return actual;
  });
  return milestones;
};

const ensureTasks = async (
  db: OrviloDatabase,
  projectId: string,
  workspaceId: string,
  userId: string,
  doneState: TeamWorkflowStateItem,
) => {
  const existing = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.workspaceId, workspaceId)))
    .orderBy(asc(tasks.seq));

  if (existing.length > 0) {
    const identifiers = new Set(existing.map((task) => task.identifier));
    const canonicalIdentifiers = new Set(PARITY_TASK_IDENTIFIERS);
    if (
      existing.length !== PARITY_TASK_COUNT ||
      identifiers.size !== PARITY_TASK_COUNT ||
      [...canonicalIdentifiers].some((identifier) => !identifiers.has(identifier)) ||
      existing.some((task) => task.isDeleted === true)
    ) {
      throw new Error('Parity project contains non-fixture tasks; refusing to mutate them');
    }
    return existing;
  }

  const [idCollision] = await db
    .select({ id: tasks.id, projectId: tasks.projectId, workspaceId: tasks.workspaceId })
    .from(tasks)
    .where(inArray(tasks.id, PARITY_TASK_IDS))
    .limit(1);
  if (idCollision) throw new Error('A parity task id already belongs to another project');

  const [identifierCollision] = await db
    .select({ id: tasks.id, projectId: tasks.projectId })
    .from(tasks)
    .where(
      and(eq(tasks.workspaceId, workspaceId), inArray(tasks.identifier, PARITY_TASK_IDENTIFIERS)),
    )
    .limit(1);
  if (identifierCollision)
    throw new Error('A parity task identifier already belongs to another project');

  return db
    .insert(tasks)
    .values(
      PARITY_TASK_IDENTIFIERS.map((identifier, index) => ({
        createdBySnapshot: { displayName: 'Agent Testing User', kind: 'user' as const },
        createdBySubjectId: userId,
        createdBySubjectKind: 'user' as const,
        createdByUserId: userId,
        id: PARITY_TASK_IDS[index],
        identifier,
        instruction: `Complete synthetic parity task ${identifier}.`,
        name: identifier,
        projectId,
        seq: index + 1,
        status: 'completed',
        triageStatus: 'accepted' as const,
        visibility: 'public' as const,
        workflowCategory: 'done' as const,
        workflowStateId: doneState.remoteStateId,
        workflowStateRefId: doneState.id,
        workspaceId,
      })),
    )
    .returning();
};

export const seedLinearParity = async (
  db: OrviloDatabase,
  options: LinearParitySeedOptions,
): Promise<LinearParitySeedResult> => {
  assertTarget(options.target);
  await ensureUser(db, options);
  const workspace = await resolveWorkspace(db, options);
  await assertProjectIdentity(db, workspace.id, options.userId);
  const { model: teamModel, team } = await resolveTeam(db, workspace.id, options.userId);
  const workflowStates = await ensureWorkflowStates(teamModel, team.id);
  const doneState = workflowStates.find((state) => state.category === 'done');
  if (!doneState) throw new Error('Parity workflow states did not produce a done state');

  const { model: projectModel, project } = await resolveProject(
    db,
    workspace.id,
    options.userId,
    team.id,
  );
  await teamModel.linkProject(project.id, team.id);
  const milestones = await ensureMilestones(projectModel, project.id);
  const fixtureTasks = await ensureTasks(db, project.id, workspace.id, options.userId, doneState);
  if (fixtureTasks.length !== PARITY_TASK_COUNT) {
    throw new Error('Parity project must contain exactly sixteen synthetic tasks');
  }

  const taskModel = new TaskModel(db, options.userId, workspace.id);
  for (const task of fixtureTasks) {
    const taskIndex = PARITY_TASK_IDENTIFIERS.indexOf(task.identifier);
    if (taskIndex < 0) throw new Error(`Unexpected parity task identifier: ${task.identifier}`);
    await taskModel.update(
      task.id,
      {
        status: 'completed',
        teamId: team.id,
        triageStatus: 'accepted',
        visibility: 'public',
        workflowCategory: 'done',
        workflowStateId: doneState.remoteStateId,
        workflowStateRefId: doneState.id,
      },
      seedMutation,
    );
    const linked = await projectModel.setTaskMilestone({
      milestoneId: milestones[taskMilestoneIndex(taskIndex)].id,
      projectId: project.id,
      taskId: task.id,
    });
    if (!linked) throw new Error(`Could not link parity task to milestone: ${task.identifier}`);
  }

  return {
    milestoneIds: milestones.map(({ id }) => id),
    projectId: project.id,
    taskIds: fixtureTasks.map(({ id }) => id),
    teamId: team.id,
    workflowStateIds: workflowStates.map(({ id }) => id),
    workspaceId: workspace.id,
  };
};
