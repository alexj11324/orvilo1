// @vitest-environment node
import { randomUUID } from 'node:crypto';

import type { OrviloDatabase } from '@orvilo/database';
import {
  acceptanceComments,
  acceptances,
  projects,
  tasks,
  verifyCheckResults,
  verifyEvidence,
  verifyRuns,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { acceptanceCommentRouter } from '../acceptanceComment';
import { cleanupTestUser, createTestUser } from './integration/setup';

let db: OrviloDatabase;
let owner: string;
let visitor: string;
let acceptanceId: string;
let workspaceId: string | undefined;
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn(() => db) }));

beforeEach(async () => {
  db = await getTestDB();
  owner = await createTestUser(db);
  visitor = await createTestUser(db);
  const [row] = await db
    .insert(acceptances)
    .values({
      subjectId: randomUUID(),
      subjectType: 'standalone',
      userId: owner,
      visibility: 'public',
    })
    .returning();
  acceptanceId = row.id;
  workspaceId = undefined;
});
afterEach(async () => {
  if (workspaceId) await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await cleanupTestUser(db, visitor);
  await cleanupTestUser(db, owner);
  vi.clearAllMocks();
});
const caller = (userId?: string) =>
  acceptanceCommentRouter.createCaller({
    userId,
    jwtPayload: userId ? { userId } : undefined,
  } as never);

it('keeps historical comments, reactions, annotations and resolved flags readable with no write permissions', async () => {
  const [run] = await db
    .insert(verifyRuns)
    .values({ acceptanceId, roundIndex: 1, userId: owner })
    .returning();
  const [result] = await db
    .insert(verifyCheckResults)
    .values({ checkItemId: 'c1', userId: owner, verifierType: 'agent', verifyRunId: run.id })
    .returning();
  const [evidence] = await db
    .insert(verifyEvidence)
    .values({ checkResultId: result.id, type: 'screenshot', userId: owner })
    .returning();
  const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
  const [comment] = await db
    .insert(acceptanceComments)
    .values({
      acceptanceId,
      authorUserId: owner,
      clientId: randomUUID(),
      content: 'Historical annotation',
      contextRunId: run.id,
      anchorType: 'evidence',
      evidenceId: evidence.id,
      checkItemId: 'c1',
      anchorRect: rect,
      resolvedAt: new Date(),
      resolvedByUserId: owner,
    })
    .returning();
  await db.insert(acceptanceComments).values({
    acceptanceId,
    authorUserId: visitor,
    clientId: randomUUID(),
    content: '👍',
    kind: 'reaction',
    parentCommentId: comment.id,
  });
  const listed = await caller(visitor).list({ acceptanceId });
  expect(listed).toMatchObject({
    canComment: false,
    canApprove: false,
    items: [
      {
        id: comment.id,
        content: 'Historical annotation',
        contextRunId: run.id,
        evidenceId: evidence.id,
        canDelete: false,
        reactions: [{ emoji: '👍', count: 1 }],
      },
    ],
  });
  expect(listed.items[0].resolvedAt).toBeTruthy();
  expect(listed.items[0].rect).toEqual(rect);
  await expect(
    caller(visitor).create({ acceptanceId, clientId: randomUUID(), content: 'new comment' }),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  await expect(caller(owner).delete({ id: comment.id })).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
  await expect(
    caller(owner).react({ id: comment.id, emoji: '👍', on: false }),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  await expect(
    caller(owner).setResolved({ id: comment.id, resolved: false }),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  expect((await caller(visitor).list({ acceptanceId })).items).toEqual(listed.items);
});

it('keeps anonymous standalone public history readable and private history hidden', async () => {
  await expect(caller().list({ acceptanceId })).resolves.toMatchObject({
    canComment: false,
    canApprove: false,
  });
  await db
    .update(acceptances)
    .set({ visibility: 'private' })
    .where(eq(acceptances.id, acceptanceId));
  await expect(caller(visitor).list({ acceptanceId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(caller(owner).list({ acceptanceId })).resolves.toMatchObject({
    canComment: false,
    canApprove: false,
  });
});

it('does not widen a private Project through a public Issue acceptance link', async () => {
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'Archive', primaryOwnerId: owner, slug: randomUUID() })
    .returning();
  workspaceId = workspace.id;
  await db.insert(workspaceMembers).values([
    { workspaceId, userId: owner, role: 'owner' },
    { workspaceId, userId: visitor, role: 'member' },
  ]);
  const [project] = await db
    .insert(projects)
    .values({
      name: 'Private history',
      identifier: 'HIST',
      userId: owner,
      workspaceId,
      visibility: 'private',
    })
    .returning();
  const [task] = await db
    .insert(tasks)
    .values({
      name: 'History',
      instruction: 'Read historical proof',
      identifier: 'HIST-1',
      seq: 1,
      createdByUserId: owner,
      workspaceId,
      projectId: project.id,
      visibility: 'public',
    })
    .returning();
  await db
    .update(acceptances)
    .set({ subjectType: 'task', subjectId: task.id, workspaceId })
    .where(eq(acceptances.id, acceptanceId));
  await expect(caller(visitor).list({ acceptanceId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(caller().list({ acceptanceId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(caller(owner).list({ acceptanceId })).resolves.toMatchObject({
    canComment: false,
    canApprove: false,
  });
});
