// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  linearImportJobs,
  linearImportReceipts,
  linearInstallations,
  tasks,
  users,
  workspaces,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { LinearImportModel } from '../linearImport';
import { LinearSyncModel } from '../linearSync';
import { ProjectModel } from '../project';

const db: OrviloDatabase = await getTestDB();
const workspaceId = 'linear-import-test-workspace';
const userId = 'linear-import-test-user';
const installationId = '00000000-0000-4000-8000-000000000099';
const sourceIssue = {
  id: 'linear-import-issue-1',
  identifier: 'IMP-1',
  title: 'Imported task',
  teamId: 'team-1',
  stateId: 'state-1',
  projectId: null,
};
const model = new LinearImportModel(db, workspaceId);

const cleanup = async () => {
  await db.delete(linearImportReceipts).where(eq(linearImportReceipts.workspaceId, workspaceId));
  await db.delete(linearImportJobs).where(eq(linearImportJobs.workspaceId, workspaceId));
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values({ id: userId });
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: 'Import test', slug: workspaceId, primaryOwnerId: userId });
  await db
    .insert(linearInstallations)
    .values({ id: installationId, organizationId: 'org-1', workspaceId });
});
afterEach(cleanup);

const createProject = (identifier: string) =>
  new ProjectModel(db, userId, workspaceId).create({ identifier, name: identifier });
const startAndClaim = async (projectId: string) => {
  const job = await model.start({
    installationId,
    teamId: 'team-1',
    projectId,
    requestedByUserId: userId,
    stateMappings: [{ linearStateId: 'state-1', workflowCategory: 'todo' }],
  });
  const claimed = await model.claim(job.id);
  expect(claimed).not.toBeNull();
  return claimed!;
};

const record = (jobId: string, owner: string, projectId: string) =>
  model.recordIssue({
    jobId,
    owner,
    projectId,
    installationId,
    organizationId: 'org-1',
    organizationName: 'Test org',
    issue: sourceIssue,
    workflowCategory: 'todo',
  });

describe('LinearImportModel', () => {
  it('creates one task and receipt for a projectless source issue, then survives repeated page work', async () => {
    const project = await createProject('IMPA');
    const { job, owner } = await startAndClaim(project.id);
    expect(await record(job.id, owner, project.id)).toBe('imported');
    expect(await record(job.id, owner, project.id)).toBe('already_imported');
    const saved = await model.findJob(job.id);
    expect(saved?.issuesImported).toBe(1);
    const imported = await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId));
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({
      projectId: project.id,
      workflowCategory: 'todo',
      name: 'Imported task',
    });
    const receipts = await db
      .select()
      .from(linearImportReceipts)
      .where(eq(linearImportReceipts.workspaceId, workspaceId));
    expect(receipts).toHaveLength(1);
    expect(receipts[0].taskId).toBe(imported[0].id);
  });

  it('does not copy an issue into a second destination', async () => {
    const first = await createProject('IMPA');
    const second = await createProject('IMPB');
    const a = await startAndClaim(first.id);
    await record(a.job.id, a.owner, first.id);
    const b = await startAndClaim(second.id);
    await expect(record(b.job.id, b.owner, second.id)).rejects.toThrow(
      'already imported into another project',
    );
    expect(await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId))).toHaveLength(1);
  });

  it('skips a source issue already linked through live sync', async () => {
    const project = await createProject('IMPA');
    const [liveTask] = await db
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'IMPA-1',
        seq: 1,
        name: 'Live synced',
        instruction: 'Live synced',
        projectId: project.id,
        workspaceId,
      })
      .returning();
    await new LinearSyncModel(db, workspaceId).createIssueLink({
      installationId,
      linearIdentifier: sourceIssue.identifier,
      linearIssueId: sourceIssue.id,
      organizationId: 'org-1',
      taskId: liveTask.id,
    });
    const { job, owner } = await startAndClaim(project.id);
    expect(await record(job.id, owner, project.id)).toBe('skipped_sync');
    expect(await model.findJob(job.id)).toMatchObject({ issuesImported: 0, issuesSkipped: 1 });
    expect(await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId))).toHaveLength(1);
  });

  it('does not silently replace a job’s frozen state mappings', async () => {
    const project = await createProject('IMPA');
    const { job } = await startAndClaim(project.id);
    await expect(
      model.start({
        installationId,
        teamId: 'team-1',
        projectId: project.id,
        requestedByUserId: userId,
        stateMappings: [{ linearStateId: 'state-1', workflowCategory: 'done' }],
      }),
    ).rejects.toThrow('different state mappings');
    expect((await model.findJob(job.id))?.stateMappings).toEqual([
      { linearStateId: 'state-1', workflowCategory: 'todo' },
    ]);
  });

  it('keeps the cursor on failure and resumes from the same page', async () => {
    const project = await createProject('IMPA');
    const { job, owner } = await startAndClaim(project.id);
    await model.fail(job.id, owner, 'issue conversion failed', true);
    expect(await model.findJob(job.id)).toMatchObject({
      cursor: null,
      status: 'failed',
      issuesFailed: 1,
    });
    await model.queue(job.id);
    const retry = await model.claim(job.id);
    expect(retry?.job.cursor).toBeNull();
    await record(job.id, retry!.owner, project.id);
    await model.completePage({
      id: job.id,
      owner: retry!.owner,
      nextCursor: 'next',
      hasNextPage: true,
    });
    expect(await model.findJob(job.id)).toMatchObject({
      cursor: 'next',
      pagesProcessed: 1,
      status: 'queued',
      issuesImported: 1,
      issuesFailed: 0,
    });
  });

  it('keeps a committed page retryable when continuation dispatch fails', async () => {
    const project = await createProject('IMPA');
    const { job, owner } = await startAndClaim(project.id);
    await record(job.id, owner, project.id);
    await model.completePage({ id: job.id, owner, nextCursor: 'page-2', hasNextPage: true });
    await model.failQueued(job.id, 'Continuation could not be scheduled');
    expect(await model.findJob(job.id)).toMatchObject({
      cursor: 'page-2',
      status: 'failed',
      issuesImported: 1,
      pagesProcessed: 1,
    });
    await model.queue(job.id);
    const retry = await model.claim(job.id);
    expect(retry?.job.cursor).toBe('page-2');
  });
});
