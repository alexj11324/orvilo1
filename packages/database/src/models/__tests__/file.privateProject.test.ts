// @vitest-environment node
import { and, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  files,
  messages,
  messagesFiles,
  projectMembers,
  projects,
  tasks,
  taskTopics,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { FileModel } from '../file';
import { WorkModel } from '../work';

const serverDB: OrviloDatabase = await getTestDB();

const owner = 'file-project-owner';
const creator = 'file-project-creator';
const member = 'file-project-member';
const workspaceId = 'file-project-workspace';
const privateProjectId = 'file-project-private';
const publicProjectId = 'file-project-public';

const names = (rows: Array<{ name: string }>) => rows.map((row) => row.name).sort();

describe('private Project file ceiling', () => {
  afterEach(async () => {
    await serverDB.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await serverDB.delete(users).where(eq(users.id, owner));
    await serverDB.delete(users).where(eq(users.id, creator));
    await serverDB.delete(users).where(eq(users.id, member));
  });

  it('hides private Project files and file works until the caller can read that Project', async () => {
    await serverDB.insert(users).values([{ id: owner }, { id: creator }, { id: member }]);
    await serverDB.insert(workspaces).values({
      id: workspaceId,
      name: 'File ceiling',
      primaryOwnerId: owner,
      slug: workspaceId,
    });
    await serverDB.insert(workspaceMembers).values([
      { role: 'owner', userId: owner, workspaceId },
      { role: 'member', userId: creator, workspaceId },
      { role: 'member', userId: member, workspaceId },
    ]);
    await serverDB.insert(projects).values([
      {
        id: privateProjectId,
        identifier: 'FPRIV',
        name: 'Private files',
        userId: owner,
        visibility: 'private',
        workspaceId,
      },
      {
        id: publicProjectId,
        identifier: 'FPUB',
        name: 'Public files',
        userId: owner,
        visibility: 'public',
        workspaceId,
      },
    ]);

    const [privateTask] = await serverDB
      .insert(tasks)
      .values({
        createdByUserId: owner,
        identifier: 'FPRIV-1',
        instruction: 'Private delivery',
        projectId: privateProjectId,
        seq: 1,
        workspaceId,
      })
      .returning();
    const [publicTask] = await serverDB
      .insert(tasks)
      .values({
        createdByUserId: creator,
        identifier: 'FPUB-1',
        instruction: 'Public delivery',
        projectId: publicProjectId,
        seq: 1,
        workspaceId,
      })
      .returning();
    await serverDB.insert(topics).values([
      {
        id: 'file-private-topic',
        title: 'Private run',
        userId: creator,
        workspaceId,
      },
      {
        id: 'file-public-topic',
        title: 'Public run',
        userId: creator,
        workspaceId,
      },
    ]);
    await serverDB.insert(taskTopics).values([
      {
        seq: 1,
        taskId: privateTask.id,
        topicId: 'file-private-topic',
        userId: creator,
        workspaceId,
      },
      {
        seq: 1,
        taskId: publicTask.id,
        topicId: 'file-public-topic',
        userId: creator,
        workspaceId,
      },
    ]);
    const [privateMessage] = await serverDB
      .insert(messages)
      .values({
        content: 'private attachment',
        role: 'user',
        topicId: 'file-private-topic',
        userId: creator,
        workspaceId,
      })
      .returning();
    await serverDB.insert(files).values([
      {
        fileType: 'text/plain',
        id: 'file-private-attachment',
        name: 'private-notes.txt',
        size: 12,
        url: 'keys/private-notes',
        userId: creator,
        visibility: 'public',
        workspaceId,
      },
      {
        fileType: 'text/plain',
        id: 'file-library-public',
        name: 'library.txt',
        size: 4,
        url: 'keys/library',
        userId: owner,
        visibility: 'public',
        workspaceId,
      },
    ]);
    await serverDB.insert(messagesFiles).values({
      fileId: 'file-private-attachment',
      messageId: privateMessage.id,
      userId: creator,
      workspaceId,
    });

    await serverDB.insert(projectMembers).values({
      projectId: privateProjectId,
      role: 'contributor',
      userId: creator,
      workspaceId,
    });
    const creatorWorks = new WorkModel(serverDB, creator, workspaceId);
    const privateWork = await creatorWorks.registerFile({
      filePath: '/mnt/data/private-notes.txt',
      metadata: {
        fileId: 'file-private-attachment',
        filePath: '/mnt/data/private-notes.txt',
        fileSize: 12,
        fileUrl: '/f/file-private-attachment',
        linesAdded: 1,
        linesDeleted: 0,
        mimeType: 'text/plain',
      },
      rootOperationId: 'op-private-file',
      title: 'private-notes.txt',
      toolCallId: 'op:op-private-file',
      toolIdentifier: 'orvilo-cloud-sandbox',
      toolName: 'writeFile',
      topicId: 'file-private-topic',
      userId: creator,
    });
    await creatorWorks.registerFile({
      filePath: '/mnt/data/public-notes.txt',
      metadata: {
        fileId: 'file-public-work',
        filePath: '/mnt/data/public-notes.txt',
        fileSize: 8,
        fileUrl: '/f/file-public-work',
        linesAdded: 1,
        linesDeleted: 0,
        mimeType: 'text/plain',
      },
      rootOperationId: 'op-public-file',
      title: 'public-notes.txt',
      toolCallId: 'op:op-public-file',
      toolIdentifier: 'orvilo-cloud-sandbox',
      toolName: 'writeFile',
      topicId: 'file-public-topic',
      userId: creator,
    });
    await serverDB
      .delete(projectMembers)
      .where(
        and(eq(projectMembers.projectId, privateProjectId), eq(projectMembers.userId, creator)),
      );

    const ownerFiles = new FileModel(serverDB, owner, workspaceId);
    const creatorFiles = new FileModel(serverDB, creator, workspaceId);
    const memberFiles = new FileModel(serverDB, member, workspaceId);
    const ownerWorks = new WorkModel(serverDB, owner, workspaceId);
    const memberWorks = new WorkModel(serverDB, member, workspaceId);

    expect(names(await ownerFiles.query())).toEqual(['library.txt', 'private-notes.txt']);
    expect(await ownerFiles.findById('file-private-attachment')).toMatchObject({
      name: 'private-notes.txt',
    });
    expect(names(await creatorFiles.query())).toEqual(['library.txt']);
    expect(await creatorFiles.findById('file-private-attachment')).toBeUndefined();
    expect(names(await memberFiles.query())).toEqual(['library.txt']);
    expect(await memberFiles.findById('file-private-attachment')).toBeUndefined();
    // The unauthenticated `/f/:id` proxy stays open. This ceiling is the library read.
    expect(await FileModel.getFileById(serverDB, 'file-private-attachment')).toMatchObject({
      name: 'private-notes.txt',
    });
    expect(await memberFiles.findByIds(['file-private-attachment', 'file-library-public'])).toEqual([
      expect.objectContaining({ id: 'file-library-public' }),
    ]);

    expect(
      await creatorWorks.listByConversation({
        includeFileWorks: true,
        topicId: 'file-private-topic',
      }),
    ).toEqual([]);
    expect(
      (
        await creatorWorks.listByWorkspace({ includeFileWorks: true, type: 'file' })
      ).items.map((item) => item.title),
    ).toEqual(['public-notes.txt']);
    expect(await creatorWorks.listVersions(privateWork.id)).toEqual([]);
    expect(
      await creatorWorks.listByRootOperations({
        includeFileWorks: true,
        rootOperationIds: ['op-private-file'],
      }),
    ).toEqual({ 'op-private-file': [] });
    expect(
      await memberWorks.listByConversation({
        includeFileWorks: true,
        topicId: 'file-private-topic',
      }),
    ).toEqual([]);

    await serverDB.insert(projectMembers).values({
      projectId: privateProjectId,
      role: 'viewer',
      userId: member,
      workspaceId,
    });

    expect(names(await memberFiles.query())).toEqual(['library.txt', 'private-notes.txt']);
    expect(await memberFiles.findById('file-private-attachment')).toMatchObject({
      name: 'private-notes.txt',
    });
    expect(names(await creatorFiles.query())).toEqual(['library.txt']);
    // File Works stay private to their registrant. The Project ceiling does not publish them.
    expect(
      (
        await ownerWorks.listByWorkspace({ includeFileWorks: true, type: 'file' })
      ).items.map((item) => item.title),
    ).toEqual([]);
  });
});
