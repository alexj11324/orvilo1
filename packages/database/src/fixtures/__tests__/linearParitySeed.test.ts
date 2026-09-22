import { and, eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { ProjectModel } from '../../models/project';
import { WorkspaceModel } from '../../models/workspace';
import { projects } from '../../schemas/project';
import { tasks } from '../../schemas/task';
import { projectTeams, teamMembers, teams, teamWorkflowStates } from '../../schemas/team';
import { users } from '../../schemas/user';
import { workspaceMembers } from '../../schemas/workspace';
import type { OrviloDatabase } from '../../type';
import {
  LINEAR_PARITY_MILESTONES,
  LINEAR_PARITY_PROJECT,
  LINEAR_PARITY_TEAM,
  seedLinearParity,
} from '../linearParitySeed';

const db: OrviloDatabase = await getTestDB();
const userId = 'linear-parity-seed-test-user';
const foreignUserId = 'linear-parity-seed-foreign-user';
const userEmail = 'linear-parity-seed-test@example.test';
const foreignEmail = 'linear-parity-seed-foreign@example.test';

const seedUsers = async () => {
  await db.insert(users).values([
    { email: userEmail, emailVerified: true, id: userId },
    { email: foreignEmail, emailVerified: true, id: foreignUserId },
  ]);
};

const seedFixture = () => seedLinearParity(db, { target: 'test', userId });

beforeEach(async () => {
  await seedUsers();
});

afterEach(async () => {
  await db.delete(users).where(inArray(users.id, [userId, foreignUserId]));
});

describe('linear parity seed', () => {
  it('creates the complete synthetic fixture on a fresh dataset', async () => {
    const result = await seedFixture();

    expect(result.taskIds).toHaveLength(16);
    expect(result.milestoneIds).toHaveLength(4);
    expect(result.workflowStateIds).toHaveLength(7);

    const [team] = await db.select().from(teams).where(eq(teams.id, result.teamId));
    expect(team).toMatchObject({
      createdByUserId: userId,
      key: LINEAR_PARITY_TEAM.key,
      name: LINEAR_PARITY_TEAM.name,
      visibility: 'public',
    });

    const members = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, result.teamId), eq(teamMembers.userId, userId)));
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe('lead');

    const states = await db
      .select()
      .from(teamWorkflowStates)
      .where(eq(teamWorkflowStates.teamId, result.teamId));
    expect(states).toHaveLength(7);
    expect(new Set(states.map((state) => state.category))).toEqual(
      new Set(['triage', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']),
    );

    const [project] = await db.select().from(projects).where(eq(projects.id, result.projectId));
    expect(project).toMatchObject({
      identifier: LINEAR_PARITY_PROJECT.identifier,
      name: LINEAR_PARITY_PROJECT.name,
      slug: LINEAR_PARITY_PROJECT.slug,
      userId,
    });

    const links = await db
      .select()
      .from(projectTeams)
      .where(
        and(eq(projectTeams.projectId, result.projectId), eq(projectTeams.teamId, result.teamId)),
      );
    expect(links).toHaveLength(1);

    const fixtureTasks = await db.select().from(tasks).where(eq(tasks.projectId, result.projectId));
    expect(fixtureTasks).toHaveLength(16);
    expect(fixtureTasks.every((task) => task.teamId === result.teamId)).toBe(true);
    expect(fixtureTasks.every((task) => task.status === 'completed')).toBe(true);
    expect(fixtureTasks.every((task) => task.workflowCategory === 'done')).toBe(true);
    expect(fixtureTasks.every((task) => task.workflowStateRefId)).toBe(true);

    const planning = await new ProjectModel(db, userId, result.workspaceId).getPlanning(
      result.projectId,
    );
    expect(planning?.milestones.map(({ name }) => name)).toEqual(
      LINEAR_PARITY_MILESTONES.map(({ name }) => name),
    );
    expect(planning?.milestones.map(({ progress }) => progress?.issues)).toEqual([2, 7, 3, 4]);
    expect(planning?.milestones.map(({ progress }) => progress?.percent)).toEqual([
      100, 100, 100, 100,
    ]);
  });

  it('is idempotent and preserves the fixture identities on a second run', async () => {
    const first = await seedFixture();
    const second = await seedFixture();

    expect(second).toEqual(first);
    await expect(
      db.select().from(teams).where(eq(teams.key, LINEAR_PARITY_TEAM.key)),
    ).resolves.toHaveLength(1);
    await expect(
      db.select().from(projects).where(eq(projects.slug, LINEAR_PARITY_PROJECT.slug)),
    ).resolves.toHaveLength(1);
    await expect(
      db.select().from(tasks).where(eq(tasks.projectId, first.projectId)),
    ).resolves.toHaveLength(16);
  });

  it('repairs a missing team membership and project-team link without duplicating rows', async () => {
    const first = await seedFixture();
    await db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, first.teamId), eq(teamMembers.userId, userId)));
    await db
      .delete(projectTeams)
      .where(
        and(eq(projectTeams.projectId, first.projectId), eq(projectTeams.teamId, first.teamId)),
      );

    const repaired = await seedFixture();
    expect(repaired).toEqual(first);
    await expect(
      db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, first.teamId), eq(teamMembers.userId, userId))),
    ).resolves.toHaveLength(1);
    await expect(
      db
        .select()
        .from(projectTeams)
        .where(
          and(eq(projectTeams.projectId, first.projectId), eq(projectTeams.teamId, first.teamId)),
        ),
    ).resolves.toHaveLength(1);
  });

  it('rejects a foreign project collision before mutating fixture tables', async () => {
    const workspace = await new WorkspaceModel(db, userId).create({
      name: 'Collision Workspace',
      slug: 'linear-parity-collision',
    });
    await db.insert(workspaceMembers).values({
      role: 'member',
      userId: foreignUserId,
      workspaceId: workspace.id,
    });
    await new ProjectModel(db, foreignUserId, workspace.id).create({
      identifier: 'FPR',
      name: LINEAR_PARITY_PROJECT.name,
      slug: LINEAR_PARITY_PROJECT.slug,
      visibility: 'public',
    });

    const countsBefore = {
      projectTeams: (await db.select().from(projectTeams)).length,
      tasks: (await db.select().from(tasks)).length,
      teams: (await db.select().from(teams)).length,
      workflowStates: (await db.select().from(teamWorkflowStates)).length,
    };

    await expect(
      seedLinearParity(db, { target: 'test', userId, workspaceId: workspace.id }),
    ).rejects.toThrow('parity project slug');

    const countsAfter = {
      projectTeams: (await db.select().from(projectTeams)).length,
      tasks: (await db.select().from(tasks)).length,
      teams: (await db.select().from(teams)).length,
      workflowStates: (await db.select().from(teamWorkflowStates)).length,
    };
    expect(countsAfter).toEqual(countsBefore);
  });
});
