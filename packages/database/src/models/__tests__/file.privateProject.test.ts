// @vitest-environment node
import { and, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  chunks,
  documents,
  fileChunks,
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
import { ChunkModel } from '../chunk';
import { DocumentModel } from '../document';
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
    const privateMessageId = 'file-private-message';
    await serverDB.insert(messages).values({
      content: 'private attachment',
      id: privateMessageId,
      role: 'user',
      topicId: 'file-private-topic',
      userId: creator,
      workspaceId,
    });
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
      messageId: privateMessageId,
      userId: creator,
      workspaceId,
    });
    await serverDB.insert(chunks).values([
      {
        id: '11111111-1111-4111-8111-111111111111',
        text: 'secret-private-body',
        userId: creator,
        workspaceId,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        text: 'public-library-body',
        userId: owner,
        workspaceId,
      },
    ]);
    await serverDB.insert(fileChunks).values([
      {
        chunkId: '11111111-1111-4111-8111-111111111111',
        fileId: 'file-private-attachment',
        userId: creator,
        workspaceId,
      },
      {
        chunkId: '22222222-2222-4222-8222-222222222222',
        fileId: 'file-library-public',
        userId: owner,
        workspaceId,
      },
    ]);
    await serverDB.insert(documents).values([
      {
        content: 'secret-private-body',
        fileId: 'file-private-attachment',
        fileType: 'text/plain',
        id: 'doc-private-parse',
        source: 'keys/private-notes',
        sourceType: 'file',
        title: 'Private parse',
        totalCharCount: 20,
        totalLineCount: 1,
        userId: creator,
        visibility: 'public',
        workspaceId,
      },
      {
        content: 'public-library-body',
        fileId: 'file-library-public',
        fileType: 'text/plain',
        id: 'doc-library-parse',
        source: 'keys/library',
        sourceType: 'file',
        title: 'Library parse',
        totalCharCount: 19,
        totalLineCount: 1,
        userId: owner,
        visibility: 'public',
        workspaceId,
      },
      {
        content: 'workspace page',
        fileType: 'custom/document',
        id: 'doc-workspace-page',
        source: 'page',
        sourceType: 'api',
        title: 'Workspace page',
        totalCharCount: 14,
        totalLineCount: 1,
        userId: owner,
        visibility: 'public',
        workspaceId,
      },
    ]);

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

    const ownerChunks = new ChunkModel(serverDB, owner, workspaceId);
    const creatorChunks = new ChunkModel(serverDB, creator, workspaceId);
    const memberChunks = new ChunkModel(serverDB, member, workspaceId);
    const ownerDocs = new DocumentModel(serverDB, owner, workspaceId);
    const creatorDocs = new DocumentModel(serverDB, creator, workspaceId);
    const memberDocs = new DocumentModel(serverDB, member, workspaceId);
    const titles = async (model: DocumentModel) =>
      (await model.query()).items.map((item) => item.title).sort();

    expect((await ownerChunks.findByFileId('file-private-attachment')).map((item) => item.text)).toEqual([
      'secret-private-body',
    ]);
    expect(await ownerChunks.getChunksTextByFileId('file-private-attachment')).toEqual([
      { id: '11111111-1111-4111-8111-111111111111', text: 'secret-private-body' },
    ]);
    expect(await creatorChunks.findByFileId('file-private-attachment')).toEqual([]);
    expect(await creatorChunks.getChunksTextByFileId('file-private-attachment')).toEqual([]);
    expect(await memberChunks.findByFileId('file-private-attachment')).toEqual([]);
    expect((await memberChunks.findByFileId('file-library-public')).map((item) => item.text)).toEqual([
      'public-library-body',
    ]);
    expect(await memberChunks.countByFileId('file-private-attachment')).toBe(0);
    expect(await memberChunks.countByFileId('file-library-public')).toBe(1);

    expect(await ownerDocs.findById('doc-private-parse')).toMatchObject({
      content: 'secret-private-body',
    });
    expect(await creatorDocs.findById('doc-private-parse')).toBeUndefined();
    expect(await creatorDocs.findByFileId('file-private-attachment')).toBeUndefined();
    expect(await memberDocs.findById('doc-private-parse')).toBeUndefined();
    expect(await memberDocs.findByFileId('file-private-attachment')).toBeUndefined();
    expect(await titles(memberDocs)).toEqual(['Library parse', 'Workspace page']);
    expect(await memberDocs.findById('doc-workspace-page')).toMatchObject({ title: 'Workspace page' });

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
    expect((await memberChunks.findByFileId('file-private-attachment')).map((item) => item.text)).toEqual([
      'secret-private-body',
    ]);
    expect(await memberDocs.findById('doc-private-parse')).toMatchObject({
      content: 'secret-private-body',
    });
    expect(await creatorDocs.findById('doc-private-parse')).toBeUndefined();
    expect(await titles(memberDocs)).toEqual(['Library parse', 'Private parse', 'Workspace page']);
    // File Works stay private to their registrant. The Project ceiling does not publish them.
    expect(
      (
        await ownerWorks.listByWorkspace({ includeFileWorks: true, type: 'file' })
      ).items.map((item) => item.title),
    ).toEqual([]);
  });
});
