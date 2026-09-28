// @vitest-environment node
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { projectRepositories, teamRepoDefaults, teams, users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { ProjectModel } from '../project';
import { RepositoryModel } from '../repository';
import { TaskModel } from '../task';

/**
 * Regression coverage for the auditable association lifecycle (WM-07):
 * propose → apply → reject/revoke, decision provenance on relation rows, and
 * the deterministic resolver precedence. These paths were hardened in review
 * (provenance tracking, sibling-backed revoke, candidate dedup) and need to
 * fail if the semantics regress.
 */
const db: OrviloDatabase = await getTestDB();

const userId = 'assoc-test-user';
const workspaceId = 'assoc-test-workspace';
const teamId = 'assoc-test-team';

const evidence = [{ detail: 'same remote id', kind: 'stable_id' as const }];

const cleanup = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values({ id: userId });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Association Test Workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
  await db.insert(teams).values({
    createdByUserId: userId,
    id: teamId,
    key: 'ASC',
    name: 'Association Team',
    workspaceId,
  });
});

afterEach(cleanup);

const model = () => new RepositoryModel(db, userId, workspaceId);

const createRepository = async (remoteId: string, name = 'repo') => {
  return model().upsertByRemoteIdentity({
    coordinate: { name, owner: 'acme', url: `https://github.com/acme/${name}` },
    providerHost: 'github.com',
    remoteRepositoryId: remoteId,
  });
};

const createProject = async (identifier: string, name = identifier) => {
  return new ProjectModel(db, userId, workspaceId).create({ identifier, name });
};

const projectLinkRows = async (projectId: string, repositoryId: string) =>
  db
    .select()
    .from(projectRepositories)
    .where(
      and(
        eq(projectRepositories.projectId, projectId),
        eq(projectRepositories.repositoryId, repositoryId),
        eq(projectRepositories.workspaceId, workspaceId),
      ),
    );

describe('association decisions', () => {
  it('dedupes proposals on the workspace-scoped idempotency key', async () => {
    const repo = await createRepository('remote-dedup');
    const project = await createProject('DEDUP');

    const params = {
      evidence,
      idempotencyKey: 'dedup-key-1',
      relation: 'project_repository' as const,
      source: 'deterministic' as const,
      sourceId: project.id,
      sourceKind: 'project' as const,
      targetRepositoryId: repo.id,
    };
    const first = await model().proposeAssociation(params);
    const second = await model().proposeAssociation(params);

    expect(second?.id).toBe(first?.id);
    expect(second?.status).toBe('proposed');

    const decisions = await model().listDecisions({ sourceId: project.id });
    expect(decisions).toHaveLength(1);
  });

  it('apply writes the project link carrying the decision provenance', async () => {
    const repo = await createRepository('remote-apply');
    const project = await createProject('APPLY');
    const decision = await model().proposeAssociation({
      evidence,
      idempotencyKey: 'apply-key-1',
      relation: 'project_repository',
      source: 'manual',
      sourceId: project.id,
      sourceKind: 'project',
      targetRepositoryId: repo.id,
    });

    const applied = await model().applyAssociation(decision!.id);

    expect(applied?.status).toBe('applied');
    expect(applied?.decidedByUserId).toBe(userId);
    expect(applied?.decidedAt).toBeTruthy();
    expect(applied?.decisionRevision).toBe((decision!.decisionRevision ?? 1) + 1);

    const rows = await projectLinkRows(project.id, repo.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].associationDecisionId).toBe(decision!.id);
  });

  it('apply is idempotent on an applied decision and refuses a rejected one', async () => {
    const repo = await createRepository('remote-fence');
    const project = await createProject('FENCE');
    const decision = await model().proposeAssociation({
      evidence,
      idempotencyKey: 'fence-key-1',
      relation: 'project_repository',
      source: 'deterministic',
      sourceId: project.id,
      sourceKind: 'project',
      targetRepositoryId: repo.id,
    });

    const applied = await model().applyAssociation(decision!.id);
    const again = await model().applyAssociation(decision!.id);
    expect(again?.id).toBe(applied?.id);
    expect(again?.decisionRevision).toBe(applied?.decisionRevision);
    expect(await projectLinkRows(project.id, repo.id)).toHaveLength(1);

    const other = await model().proposeAssociation({
      evidence,
      idempotencyKey: 'fence-key-2',
      relation: 'project_repository',
      source: 'deterministic',
      sourceId: project.id,
      sourceKind: 'project',
      targetRepositoryId: repo.id,
    });
    await model().rejectAssociation(other!.id, 'duplicate');
    expect(await model().applyAssociation(other!.id)).toBeNull();
  });

  it('apply writes a team repository default with provenance', async () => {
    const repo = await createRepository('remote-team-default');
    const decision = await model().proposeAssociation({
      evidence,
      idempotencyKey: 'team-default-key',
      relation: 'team_repository_default',
      source: 'deterministic',
      sourceId: teamId,
      sourceKind: 'team',
      targetRepositoryId: repo.id,
    });

    const applied = await model().applyAssociation(decision!.id);
    expect(applied?.status).toBe('applied');

    const rows = await db
      .select()
      .from(teamRepoDefaults)
      .where(and(eq(teamRepoDefaults.teamId, teamId), eq(teamRepoDefaults.repositoryId, repo.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0].associationDecisionId).toBe(decision!.id);
  });

  it('reject records the resolution note and bumps the decision revision', async () => {
    const repo = await createRepository('remote-reject');
    const project = await createProject('REJCT');
    const decision = await model().proposeAssociation({
      confidence: 0.4,
      evidence,
      idempotencyKey: 'reject-key',
      relation: 'project_repository',
      source: 'ai',
      sourceId: project.id,
      sourceKind: 'project',
      targetRepositoryId: repo.id,
    });

    const rejected = await model().rejectAssociation(decision!.id, 'name similarity only');

    expect(rejected?.status).toBe('rejected');
    expect(rejected?.resolutionNote).toBe('name similarity only');
    expect(rejected?.decisionRevision).toBe(decision!.decisionRevision + 1);
    expect(await projectLinkRows(project.id, repo.id)).toHaveLength(0);
  });

  it('revoke removes the relation row the decision wrote', async () => {
    const repo = await createRepository('remote-revoke');
    const project = await createProject('REVK1');
    const decision = await model().proposeAssociation({
      evidence,
      idempotencyKey: 'revoke-key-1',
      relation: 'project_repository',
      source: 'manual',
      sourceId: project.id,
      sourceKind: 'project',
      targetRepositoryId: repo.id,
    });
    await model().applyAssociation(decision!.id);

    const revoked = await model().revokeAssociation(decision!.id, 'wrong link');

    expect(revoked?.status).toBe('revoked');
    expect(revoked?.revokedAt).toBeTruthy();
    expect(await projectLinkRows(project.id, repo.id)).toHaveLength(0);
  });

  it('keeps the relation while a sibling applied decision backs it, then removes it with the last one', async () => {
    const repo = await createRepository('remote-sibling');
    const project = await createProject('SIBLG');

    const first = await model().proposeAssociation({
      evidence,
      idempotencyKey: 'sibling-key-1',
      relation: 'project_repository',
      source: 'deterministic',
      sourceId: project.id,
      sourceKind: 'project',
      targetRepositoryId: repo.id,
    });
    const second = await model().proposeAssociation({
      evidence,
      idempotencyKey: 'sibling-key-2',
      relation: 'project_repository',
      source: 'ai',
      sourceId: project.id,
      sourceKind: 'project',
      targetRepositoryId: repo.id,
    });
    await model().applyAssociation(first!.id);
    await model().applyAssociation(second!.id);
    expect(await projectLinkRows(project.id, repo.id)).toHaveLength(1);

    // Revoking the writer first: the sibling still backs the relation.
    await model().revokeAssociation(first!.id);
    expect(await projectLinkRows(project.id, repo.id)).toHaveLength(1);

    // Revoking the last backing decision must remove the row even though its
    // provenance still points at the already-revoked writer.
    await model().revokeAssociation(second!.id);
    expect(await projectLinkRows(project.id, repo.id)).toHaveLength(0);
  });

  it('revoke never removes a relation written by a manual link', async () => {
    const repo = await createRepository('remote-manual');
    const project = await createProject('MANUL');
    await model().linkProject(project.id, repo.id);

    const decision = await model().proposeAssociation({
      evidence,
      idempotencyKey: 'manual-key-1',
      relation: 'project_repository',
      source: 'deterministic',
      sourceId: project.id,
      sourceKind: 'project',
      targetRepositoryId: repo.id,
    });
    await model().applyAssociation(decision!.id);
    await model().revokeAssociation(decision!.id);

    const rows = await projectLinkRows(project.id, repo.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].associationDecisionId).toBeNull();
  });
});

describe('deterministic resolution precedence', () => {
  it('prefers the confirmed project link over the team default', async () => {
    const projectRepo = await createRepository('remote-proj', 'proj-repo');
    const teamRepo = await createRepository('remote-team', 'team-repo');
    const project = await createProject('PREC1');
    await model().linkProject(project.id, projectRepo.id);
    await model().setTeamDefault(teamId, teamRepo.id, true);

    const resolution = await model().resolveForScope({ projectId: project.id, teamId });
    expect(resolution).toEqual({
      ok: true,
      repositoryId: projectRepo.id,
      source: 'project',
    });
  });

  it('falls back to the primary team default without a project link', async () => {
    const teamRepo = await createRepository('remote-team-only', 'team-repo');
    await model().setTeamDefault(teamId, teamRepo.id, true);

    const resolution = await model().resolveForScope({ teamId });
    expect(resolution).toEqual({ ok: true, repositoryId: teamRepo.id, source: 'team' });
  });

  it('resolves a single applied candidate and blocks on ambiguity', async () => {
    const project = await createProject('CAND1');
    const repoA = await createRepository('remote-cand-a', 'cand-a');
    const repoB = await createRepository('remote-cand-b', 'cand-b');

    const decision = await model().proposeAssociation({
      evidence,
      idempotencyKey: 'cand-key-a',
      relation: 'project_repository',
      source: 'ai',
      sourceId: project.id,
      sourceKind: 'project',
      targetRepositoryId: repoA.id,
    });
    await model().applyAssociation(decision!.id);
    // An applied candidate is still surfaced through the project link it
    // wrote, so the single-repository case resolves via `project`.
    expect(await model().resolveForScope({ projectId: project.id })).toEqual({
      ok: true,
      repositoryId: repoA.id,
      source: 'project',
    });

    const second = await model().proposeAssociation({
      evidence,
      idempotencyKey: 'cand-key-b',
      relation: 'project_repository',
      source: 'ai',
      sourceId: project.id,
      sourceKind: 'project',
      targetRepositoryId: repoB.id,
    });
    await model().applyAssociation(second!.id);

    const resolution = await model().resolveForScope({ projectId: project.id });
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.reason).toBe('ambiguous');
      expect(resolution.candidates.sort()).toEqual([repoA.id, repoB.id].sort());
    }
  });

  it('honors an applied task-level decision ahead of the project link', async () => {
    const projectRepo = await createRepository('remote-task-proj', 'task-proj');
    const taskRepo = await createRepository('remote-task-explicit', 'task-explicit');
    const project = await createProject('TASKP');
    await model().linkProject(project.id, projectRepo.id);
    const task = await new TaskModel(db, userId, workspaceId).create({
      instruction: 'resolve me',
      projectId: project.id,
    });

    const decision = await model().proposeAssociation({
      evidence,
      idempotencyKey: 'task-key-1',
      relation: 'task_repository',
      source: 'manual',
      sourceId: task.id,
      sourceKind: 'task',
      targetRepositoryId: taskRepo.id,
    });
    await model().applyAssociation(decision!.id);

    const resolution = await model().resolveForTask(task.id);
    expect(resolution).toEqual({ ok: true, repositoryId: taskRepo.id, source: 'task' });
  });

  it('reports unresolved when nothing is associated', async () => {
    const project = await createProject('EMPTY');
    const resolution = await model().resolveForScope({ projectId: project.id, teamId });
    expect(resolution).toEqual({ candidates: [], ok: false, reason: 'unresolved' });
  });
});
