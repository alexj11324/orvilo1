import { CUSTOM_FOLDER_FILE_TYPE } from '@orvilo/const';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: null as string | null,
  confirmModal: vi.fn(),
  deleteResource: vi.fn<() => Promise<void>>(async () => {}),
  dropTreeNodes: vi.fn(async () => undefined),
  refreshFileList: vi.fn(async () => undefined),
  revalidateTree: vi.fn(async () => undefined),
}));

vi.mock('@lobehub/ui/base-ui', () => ({
  confirmModal: mocks.confirmModal,
  toast: {
    error: vi.fn(),
    loading: vi.fn(() => ({ close: vi.fn() })),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/hooks/useAppOrigin', () => ({ useAppOrigin: () => 'https://app.example.com' }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: true }) }));
vi.mock('@/features/ResourceManager/components/KnowledgeBaseListProvider', () => ({
  useKnowledgeBaseListContext: () => [],
}));
vi.mock('@/store/user', () => ({ useUserStore: () => 'user-1' }));
vi.mock('@/store/user/selectors', () => ({ userProfileSelectors: { userId: vi.fn() } }));
vi.mock('@/store/file', () => ({
  useFileStore: Object.assign(
    () => ({
      deleteResource: mocks.deleteResource,
      moveResource: vi.fn(),
      publishFileToWorkspace: vi.fn(),
      refreshFileList: mocks.refreshFileList,
      setFileVisibility: vi.fn(),
    }),
    { getState: () => ({ queryParams: { parentId: 'parent-id' } }) },
  ),
}));
vi.mock('@/store/library', () => ({ useKnowledgeBaseStore: () => [vi.fn(), vi.fn()] }));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => mocks.activeWorkspaceId,
}));

vi.mock('@/store/tree', () => ({
  useTreeStore: Object.assign(() => vi.fn(), {
    getState: () => ({ dropNodes: mocks.dropTreeNodes, revalidate: mocks.revalidateTree }),
  }),
}));

const { useFileItemDropdown } = await import('./useFileItemDropdown');

const baseParams = {
  fileType: 'markdown',
  filename: 'notes.md',
  id: 'resource-id',
  size: 10,
  url: 'https://storage.example.com/notes.md',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.activeWorkspaceId = null;
});

describe('useFileItemDropdown — visibility toggles', () => {
  const ownFile = (visibility: 'private' | 'public') =>
    renderHook(() => useFileItemDropdown({ ...baseParams, userId: 'user-1', visibility } as any));
  const keys = (result: { current: { menuItems: () => any[] } }) =>
    result.current.menuItems().map((item) => item?.key);

  it('hides "Make private" and "Publish to workspace" in personal mode', () => {
    // Regression: `files.visibility` defaults to 'public' even when
    // `workspace_id IS NULL`, so every personal file offered "Make private".
    expect(keys(ownFile('public').result)).not.toContain('makePrivate');
    expect(keys(ownFile('private').result)).not.toContain('publishToWorkspace');
  });

  it('offers the matching toggle for the creator inside a workspace', () => {
    mocks.activeWorkspaceId = 'ws-1';
    expect(keys(ownFile('public').result)).toContain('makePrivate');
    expect(keys(ownFile('private').result)).toContain('publishToWorkspace');
  });

  it("never offers the toggles on another member's workspace file", () => {
    mocks.activeWorkspaceId = 'ws-1';
    const { result } = renderHook(() =>
      useFileItemDropdown({ ...baseParams, userId: 'another-member', visibility: 'public' } as any),
    );
    expect(keys(result)).not.toContain('makePrivate');
  });
});

describe('useFileItemDropdown — workspace resource permissions', () => {
  it("lets an editor rename and delete another member's folder", () => {
    const { result } = renderHook(() =>
      useFileItemDropdown({
        ...baseParams,
        fileType: CUSTOM_FOLDER_FILE_TYPE,
        userId: 'another-member',
      } as any),
    );

    const items = result.current.menuItems();
    const renameItem = items.find((item) => item?.key === 'rename');
    const deleteItem = items.find((item) => item?.key === 'delete');

    expect(renameItem).toBeTruthy();
    expect(renameItem && 'disabled' in renameItem ? renameItem.disabled : undefined).not.toBe(true);
    expect(deleteItem).toBeTruthy();
    expect(deleteItem && 'disabled' in deleteItem ? deleteItem.disabled : undefined).not.toBe(true);
  });

  it('closes the confirmation without waiting for the delete request', async () => {
    let resolveDelete!: () => void;
    const pendingDelete = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    mocks.deleteResource.mockReturnValueOnce(pendingDelete);

    const { result } = renderHook(() => useFileItemDropdown(baseParams as any));
    const deleteItem = result.current.menuItems().find((item) => item?.key === 'delete') as any;
    await deleteItem.onClick({ domEvent: { stopPropagation: vi.fn() } });

    const modalOptions = mocks.confirmModal.mock.calls.at(-1)![0];
    expect(modalOptions.onOk()).toBeUndefined();
    expect(mocks.deleteResource).toHaveBeenCalledWith('resource-id');

    resolveDelete();
    await pendingDelete;
    await waitFor(() => expect(mocks.refreshFileList).toHaveBeenCalled());
  });

  it("refreshes the row's own folder, not the folder the explorer is listing", async () => {
    // Regression: the sidebar navigates into a folder on click, so
    // deleting it from its own context menu refreshed the deleted folder while
    // the parent list the sidebar renders kept the row until a page reload.
    const { result } = renderHook(() =>
      useFileItemDropdown({
        ...baseParams,
        fileType: CUSTOM_FOLDER_FILE_TYPE,
        parentId: 'tree-parent-id',
      } as any),
    );
    const deleteItem = result.current.menuItems().find((item) => item?.key === 'delete') as any;
    await deleteItem.onClick({ domEvent: { stopPropagation: vi.fn() } });

    mocks.confirmModal.mock.calls.at(-1)![0].onOk();

    await waitFor(() =>
      expect(mocks.dropTreeNodes).toHaveBeenCalledWith(['resource-id'], 'tree-parent-id'),
    );
  });

  it("falls back to the explorer's folder for a row the tree does not own", async () => {
    const { result } = renderHook(() => useFileItemDropdown(baseParams as any));
    const deleteItem = result.current.menuItems().find((item) => item?.key === 'delete') as any;
    await deleteItem.onClick({ domEvent: { stopPropagation: vi.fn() } });

    mocks.confirmModal.mock.calls.at(-1)![0].onOk();

    await waitFor(() =>
      expect(mocks.dropTreeNodes).toHaveBeenCalledWith(['resource-id'], 'parent-id'),
    );
  });
});
