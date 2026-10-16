import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as WorkspaceModelModule from '@/database/models/workspace';
import { knowledgeBaseRouter } from '@/server/routers/lambda/knowledgeBase';

const routerMocks = vi.hoisted(() => ({
  assertContentsNotInRestrictedKnowledgeBase: vi.fn(),
  assertKnowledgeBaseBrowsable: vi.fn(),
  assertCanPerformResourceAction: vi.fn(),
  businessFileTransferStorageCheck: vi.fn(),
  hasWorkspaceScopedPermission: vi.fn(),
}));

const mockKnowledgeBaseModelCountFileUsage = vi.fn();
const mockKnowledgeBaseModelAddFiles = vi.fn();
const mockKnowledgeBaseModelCopyToWorkspace = vi.fn();
const mockKnowledgeBaseModelDeleteWithFiles = vi.fn();
const mockKnowledgeBaseModelFindById = vi.fn();
const mockKnowledgeBaseModelQuery = vi.fn();
const mockKnowledgeBaseModelRemoveFiles = vi.fn();
const mockKnowledgeBaseModelTransferTo = vi.fn();
const mockKnowledgeBaseModelHasForeignLinkedRows = vi.fn().mockResolvedValue(false);
const mockKnowledgeBaseModelUpdate = vi.fn();
const mockDocumentModelFindByIds = vi.fn();
const mockFileModelFindByIds = vi.fn();

// Workspace membership is verified for real — callers carrying workspaceId
// resolve through this model seam, so tests stub an active member row.
vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceModelModule>()),
  getActiveWorkspaceMembershipRole: vi.fn().mockResolvedValue('member'),
}));

vi.mock('@/business/server/lambda-routers/file', () => ({
  businessFileTransferStorageCheck: routerMocks.businessFileTransferStorageCheck,
}));

vi.mock('@/server/services/workspacePermission', () => ({
  hasWorkspaceScopedPermission: routerMocks.hasWorkspaceScopedPermission,
}));

vi.mock('@/server/services/resourcePermission', () => ({
  assertCanPerformResourceAction: routerMocks.assertCanPerformResourceAction,
}));

vi.mock('@/server/routers/lambda/_helpers/knowledgeBaseAccess', () => ({
  assertContentsNotInRestrictedKnowledgeBase:
    routerMocks.assertContentsNotInRestrictedKnowledgeBase,
  assertKnowledgeBaseBrowsable: routerMocks.assertKnowledgeBaseBrowsable,
  filterRestrictedKnowledgeBases: vi.fn(async (_ctx, items) => items),
  getUseLevelKnowledgeBaseIds: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/database/models/document', () => ({
  DocumentModel: vi.fn(function () {
    return { findByIds: mockDocumentModelFindByIds };
  }),
}));

vi.mock('@/database/models/file', () => ({
  FileModel: vi.fn(function () {
    return { findByIds: mockFileModelFindByIds };
  }),
}));

vi.mock('@/server/services/file', () => ({
  FileService: vi.fn(function () {
    return { deleteFiles: vi.fn() };
  }),
}));

const mockPermissionRemoveAll = vi.fn();
const mockPermissionSetAccessLevel = vi.fn();
vi.mock('@/database/models/resourcePermission', () => ({
  ResourcePermissionModel: vi.fn(function () {
    return {
      removeAll: mockPermissionRemoveAll,
      setAccessLevel: mockPermissionSetAccessLevel,
    };
  }),
}));

vi.mock('@/database/models/knowledgeBase', () => ({
  KnowledgeBaseModel: vi.fn(function () {
    return {
      addFilesToKnowledgeBase: mockKnowledgeBaseModelAddFiles,
      copyToWorkspace: mockKnowledgeBaseModelCopyToWorkspace,
      countFileUsage: mockKnowledgeBaseModelCountFileUsage,
      deleteWithFiles: mockKnowledgeBaseModelDeleteWithFiles,
      findById: mockKnowledgeBaseModelFindById,
      hasForeignLinkedRows: mockKnowledgeBaseModelHasForeignLinkedRows,
      query: mockKnowledgeBaseModelQuery,
      removeFilesFromKnowledgeBase: mockKnowledgeBaseModelRemoveFiles,
      transferTo: mockKnowledgeBaseModelTransferTo,
      update: mockKnowledgeBaseModelUpdate,
    };
  }),
}));

describe('knowledgeBaseRouter', () => {
  const ctx = {
    serverDB: {},
    userId: 'test-user',
    workspaceId: 'workspace-active',
    workspaceRole: 'member',
  };

  const caller = knowledgeBaseRouter.createCaller(ctx as any);

  beforeEach(() => {
    vi.clearAllMocks();
    routerMocks.assertContentsNotInRestrictedKnowledgeBase.mockResolvedValue(undefined);
    routerMocks.assertKnowledgeBaseBrowsable.mockResolvedValue(undefined);
    routerMocks.assertCanPerformResourceAction.mockResolvedValue(undefined);
    routerMocks.businessFileTransferStorageCheck.mockResolvedValue(undefined);
    routerMocks.hasWorkspaceScopedPermission.mockResolvedValue(true);
    mockKnowledgeBaseModelCopyToWorkspace.mockResolvedValue({ id: 'kb-copy' });
    mockKnowledgeBaseModelCountFileUsage.mockResolvedValue(4096);
    mockKnowledgeBaseModelDeleteWithFiles.mockResolvedValue({ deletedFiles: [] });
    mockKnowledgeBaseModelFindById.mockResolvedValue({
      id: 'kb-1',
      userId: 'test-user',
      visibility: 'public',
      workspaceId: 'workspace-active',
    });
    mockKnowledgeBaseModelQuery.mockResolvedValue([]);
    mockKnowledgeBaseModelTransferTo.mockResolvedValue({ id: 'kb-1' });
    mockKnowledgeBaseModelUpdate.mockResolvedValue({ id: 'kb-1' });
  });

  it('retired membership writes reject before touching stored resources', async () => {
    await expect(
      caller.addFilesToKnowledgeBase({ knowledgeBaseId: 'kb-1', ids: ['file-1'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Platform knowledge bases are retired' });
    expect(mockKnowledgeBaseModelAddFiles).not.toHaveBeenCalled();
  });

  it('denies every legacy KB producer without deleting or changing content', async () => {
    const writes = [
      () => caller.createKnowledgeBase({ name: 'New' }),
      () => caller.copyKnowledgeBaseToWorkspace({ id: 'kb-1', targetWorkspaceId: 'ws-2' }),
      () => caller.publishKnowledgeBaseToWorkspace({ id: 'kb-1' }),
      () => caller.setKnowledgeBaseVisibility({ id: 'kb-1', visibility: 'public' }),
      () => caller.transferKnowledgeBase({ id: 'kb-1', targetWorkspaceId: null }),
      () => caller.updateKnowledgeBase({ id: 'kb-1', value: { name: 'Changed' } }),
      () => caller.removeFilesFromKnowledgeBase({ knowledgeBaseId: 'kb-1', ids: ['file-1'] }),
      () => caller.removeKnowledgeBase({ id: 'kb-1' }),
      () => caller.removeAllKnowledgeBases(),
    ];
    for (const write of writes) {
      await expect(write()).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Platform knowledge bases are retired',
      });
    }
    expect(mockKnowledgeBaseModelCopyToWorkspace).not.toHaveBeenCalled();
    expect(mockKnowledgeBaseModelUpdate).not.toHaveBeenCalled();
    expect(mockKnowledgeBaseModelRemoveFiles).not.toHaveBeenCalled();
    expect(mockKnowledgeBaseModelDeleteWithFiles).not.toHaveBeenCalled();
    expect(mockKnowledgeBaseModelTransferTo).not.toHaveBeenCalled();
  });

  it('retains authorized historical detail reads', async () => {
    await expect(caller.getKnowledgeBaseById({ id: 'kb-1' })).resolves.toMatchObject({
      id: 'kb-1',
    });
    expect(routerMocks.assertKnowledgeBaseBrowsable).toHaveBeenCalled();
  });
});
