// @vitest-environment node
import { type OrviloDatabase } from '@orvilo/database';
import { getTestDB } from '@orvilo/database/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';

import { taskDraftRouter } from '../../taskDraft';
import { cleanupTestUser, createTestContext, createTestUser } from './setup';

let testDB: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(() => testDB),
}));

describe('Task Draft Router', () => {
  let userId: string;

  beforeEach(async () => {
    testDB = await getTestDB();
    userId = await createTestUser(testDB);
  });

  afterEach(async () => {
    await cleanupTestUser(testDB, userId);
  });

  it('saves and reads an attachment-only draft with empty markdown', async () => {
    const task = await new TaskModel(testDB, userId).create({
      instruction: 'Attach a file',
      name: 'Attachment draft',
    });
    const caller = taskDraftRouter.createCaller(createTestContext(userId));
    const editorData = {
      root: { children: [{ type: 'attachment', fileId: 'file-example' }] },
    };

    const saved = await caller.upsert({ content: '', editorData, taskId: task.id });

    expect(saved.data).toMatchObject({ content: '', editorData, taskId: task.id });
    expect((await caller.get({ taskId: task.id })).data).toMatchObject({
      content: '',
      editorData,
    });
    expect((await caller.list()).data).toMatchObject([{ content: '', editorData }]);
  });

  it('accepts a public identifier or database ID for draft operations', async () => {
    const task = await new TaskModel(testDB, userId).create({
      instruction: 'Draft on task',
      name: 'Draft task',
    });
    const caller = taskDraftRouter.createCaller(createTestContext(userId));

    expect((await caller.upsert({ content: 'one', taskId: task.identifier })).data).toMatchObject({
      taskId: task.id,
      taskIdentifier: task.identifier,
    });
    expect((await caller.get({ taskId: task.id })).data).toMatchObject({ content: 'one' });
    expect((await caller.delete({ taskId: task.identifier })).data).toBe(true);
    expect((await caller.upsert({ content: 'two', taskId: task.id })).data).toMatchObject({
      taskId: task.id,
    });
    expect((await caller.get({ taskId: task.identifier })).data).toMatchObject({ content: 'two' });
    expect((await caller.delete({ taskId: task.id })).data).toBe(true);
  });
});
