// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { DocumentModel } from '@/database/models/document';
import { TaskModel } from '@/database/models/task';
import { documents, taskDocuments, users } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { assertDocumentsNotPinnedToTasks } from './taskReferences';

/**
 * PGlite rather than a stubbed db: the substance of this guard is the count
 * query against `task_documents` (and the cascade it stands in front of), so a
 * fake result set would assert nothing about the SQL actually running.
 *
 * Rows are created through the models rather than by hand — `documents` and
 * `tasks` each carry several NOT NULL columns, and the production paths are what
 * fill them.
 */
const serverDB: OrviloDatabase = await getTestDB();
const userId = 'doc-ref-user';

const documentId = 'docs_pinned';

const createDocument = (id: string, title: string) =>
  new DocumentModel(serverDB, userId).create({
    fileType: 'markdown',
    id,
    source: 'library',
    sourceType: 'file',
    title,
    totalCharCount: 1,
    totalLineCount: 1,
  });

const createTask = async (ownerId: string) =>
  new TaskModel(serverDB, ownerId).create({ instruction: `Task for ${ownerId}`, name: 'T' });

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values({ id: userId });
  await createDocument(documentId, 'Pinned');
});

afterEach(async () => {
  await serverDB.delete(users);
});

const pin = async (ownerId = userId) => {
  const task = await createTask(ownerId);
  await serverDB.insert(taskDocuments).values({ documentId, taskId: task.id, userId: ownerId });
  return task;
};

describe('assertDocumentsNotPinnedToTasks', () => {
  // The premise the guard exists for, verified rather than assumed: deleting the
  // document row takes the task's artifact reference with it, leaving the task
  // with no artifact and nothing that would have said so.
  it('the cascade the guard stands in front of is real', async () => {
    const task = await pin();
    expect(await serverDB.select().from(taskDocuments)).toHaveLength(1);

    await serverDB.delete(documents).where(eq(documents.id, documentId));

    expect(await serverDB.select().from(taskDocuments)).toHaveLength(0);
    // The task survives; only its artifact reference disappeared.
    expect(await new TaskModel(serverDB, userId).findById(task.id)).toBeTruthy();
  });

  it('allows deleting a document no task lists', async () => {
    await expect(
      assertDocumentsNotPinnedToTasks({ serverDB }, [documentId]),
    ).resolves.toBeUndefined();
  });

  // The gap this closes: `task_documents.documentId` cascades, so without this
  // guard the delete removes the task's artifact reference silently.
  it('refuses a document a task lists, and says which way out', async () => {
    await pin();

    await expect(assertDocumentsNotPinnedToTasks({ serverDB }, [documentId])).rejects.toMatchObject(
      {
        code: 'FORBIDDEN',
        message: expect.stringContaining('attached to a task artifact'),
      },
    );
  });

  it('names the count when several references exist', async () => {
    await pin();
    await pin();

    await expect(assertDocumentsNotPinnedToTasks({ serverDB }, [documentId])).rejects.toMatchObject(
      {
        message: expect.stringContaining('2 task artifacts'),
      },
    );
  });

  it('lets an unpinned document through even while another one is pinned', async () => {
    const freeId = 'docs_free';
    await createDocument(freeId, 'Free');
    await pin();

    await expect(assertDocumentsNotPinnedToTasks({ serverDB }, [freeId])).resolves.toBeUndefined();
  });

  // The helper is called with mixed id lists elsewhere in the router; a file id
  // is not a `documents` row and must not make it query.
  it('ignores ids that cannot be documents', async () => {
    await pin();

    await expect(
      assertDocumentsNotPinnedToTasks({ serverDB }, ['file_1']),
    ).resolves.toBeUndefined();
    await expect(assertDocumentsNotPinnedToTasks({ serverDB }, [])).resolves.toBeUndefined();
  });

  it('counts references the caller does not own', async () => {
    // A reference the caller cannot see would still be destroyed by the cascade,
    // so it must still block the delete.
    const otherUserId = 'doc-ref-other';
    await serverDB.insert(users).values({ id: otherUserId });
    await pin(otherUserId);

    await expect(assertDocumentsNotPinnedToTasks({ serverDB }, [documentId])).rejects.toMatchObject(
      {
        code: 'FORBIDDEN',
      },
    );
    // The document itself still belongs to the original user: this is a
    // reference count, not an ownership check.
    const [row] = await serverDB.select().from(documents).where(eq(documents.id, documentId));
    expect(row.userId).toBe(userId);
  });
});
