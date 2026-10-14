import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initialState } from '@/store/file/initialState';
import { useFileStore } from '@/store/file/store';
import type { CreateDocumentParams, ResourceItem } from '@/types/resource';

const { mockCreateResource, mockMoveResource, mockQueryResources } = vi.hoisted(() => ({
  mockCreateResource: vi.fn(),
  mockMoveResource: vi.fn(),
  mockQueryResources: vi.fn(),
}));

vi.mock('@/services/resource', () => ({
  resourceService: {
    createResource: mockCreateResource,
    moveResource: mockMoveResource,
    queryResources: mockQueryResources,
  },
}));

const createResource = (overrides: Partial<ResourceItem> = {}): ResourceItem => ({
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  fileType: 'text/plain',
  id: 'resource-1',
  name: 'Resource 1',
  parentId: null,
  size: 1,
  sourceType: 'file',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  url: 'files/resource-1.txt',
  ...overrides,
});

describe('resource actions', () => {
  const deferredPage = () => {
    let resolve!: (value: { items: ResourceItem[] }) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<{ items: ResourceItem[] }>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, reject, resolve };
  };
  const preparePagination = () => {
    useFileStore.setState({
      hasMore: true,
      isLoadingMore: false,
      offset: 96,
      queryParams: { parentId: null },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResources.mockReset();
    useFileStore.setState(initialState);
  });

  it('starts only one request when load-more is called concurrently at the same offset', async () => {
    preparePagination();
    const page = deferredPage();
    mockQueryResources.mockReturnValue(page.promise);
    const first = useFileStore.getState().loadMoreResources();
    const concurrent = useFileStore.getState().loadMoreResources();
    expect(mockQueryResources).toHaveBeenCalledTimes(1);
    expect(mockQueryResources).toHaveBeenCalledWith({ limit: 50, offset: 96, parentId: null });
    expect(useFileStore.getState().isLoadingMore).toBe(true);
    page.resolve({ items: [] });
    await Promise.all([first, concurrent]);
    expect(useFileStore.getState().isLoadingMore).toBe(false);
  });

  it('releases the loading guard after success so the next page uses the advanced offset', async () => {
    preparePagination();
    const page = deferredPage();
    const nextPage = deferredPage();
    const items = Array.from({ length: 50 }, (_, index) =>
      createResource({ id: `page-96-${index}` }),
    );
    mockQueryResources.mockReturnValueOnce(page.promise).mockReturnValueOnce(nextPage.promise);
    const first = useFileStore.getState().loadMoreResources();
    page.resolve({ items });
    await first;
    expect(useFileStore.getState()).toMatchObject({
      hasMore: true,
      isLoadingMore: false,
      offset: 146,
    });
    expect(useFileStore.getState().resourceList).toEqual(items);
    const next = useFileStore.getState().loadMoreResources();
    expect(mockQueryResources).toHaveBeenNthCalledWith(2, {
      limit: 50,
      offset: 146,
      parentId: null,
    });
    expect(useFileStore.getState().isLoadingMore).toBe(true);
    nextPage.resolve({ items: [] });
    await next;
    expect(useFileStore.getState()).toMatchObject({
      hasMore: false,
      isLoadingMore: false,
      offset: 146,
    });
  });

  it('releases a failed request for retry without advancing the offset or replacing data', async () => {
    preparePagination();
    const existing = createResource({ id: 'existing' });
    useFileStore.setState({
      resourceList: [existing],
      resourceMap: new Map([[existing.id, existing]]),
    });
    const page = deferredPage();
    const retryPage = deferredPage();
    const error = new Error('page request failed');
    mockQueryResources.mockReturnValueOnce(page.promise).mockReturnValueOnce(retryPage.promise);
    const failed = useFileStore.getState().loadMoreResources();
    const rejection = expect(failed).rejects.toBe(error);
    page.reject(error);
    await rejection;
    expect(useFileStore.getState()).toMatchObject({
      hasMore: true,
      isLoadingMore: false,
      offset: 96,
    });
    expect(useFileStore.getState().resourceList).toEqual([existing]);
    expect(useFileStore.getState().resourceMap.get(existing.id)).toBe(existing);
    const retry = useFileStore.getState().loadMoreResources();
    expect(mockQueryResources).toHaveBeenNthCalledWith(2, {
      limit: 50,
      offset: 96,
      parentId: null,
    });
    expect(useFileStore.getState().isLoadingMore).toBe(true);
    retryPage.resolve({ items: [] });
    await retry;
    expect(useFileStore.getState().isLoadingMore).toBe(false);
  });

  it('should keep completed background uploads out of the current resource list when they are off-screen', () => {
    const visibleResource = createResource({
      id: 'visible-1',
      name: 'Visible resource',
      parentId: 'folder-b',
    });
    const optimisticResource = createResource({
      _optimistic: {
        isPending: true,
        retryCount: 0,
      },
      id: 'temp-a',
      name: 'Background upload',
      parentId: 'folder-a',
    });
    const completedResource = createResource({
      id: 'file-a',
      name: 'Background upload',
      parentId: 'folder-a',
    });

    useFileStore.setState({
      queryParams: { parentId: 'folder-b' },
      resourceList: [visibleResource],
      resourceMap: new Map([
        [visibleResource.id, visibleResource],
        [optimisticResource.id, optimisticResource],
      ]),
    });

    useFileStore.getState().replaceLocalResource(optimisticResource.id, completedResource);

    const { resourceList, resourceMap } = useFileStore.getState();

    expect(resourceList).toEqual([visibleResource]);
    expect(resourceMap.has(optimisticResource.id)).toBe(false);
    expect(resourceMap.get(completedResource.id)).toEqual(completedResource);
  });

  it('should remove a root item from the visible list when moving it into a folder', async () => {
    const rootResource = createResource({
      id: 'root-1',
      name: 'Root resource',
      parentId: null,
    });
    const movedResource = createResource({
      id: 'root-1',
      name: 'Root resource',
      parentId: 'folder-a',
    });

    mockMoveResource.mockResolvedValue(movedResource);

    useFileStore.setState({
      queryParams: { parentId: null },
      resourceList: [rootResource],
      resourceMap: new Map([[rootResource.id, rootResource]]),
    });

    await useFileStore.getState().moveResource(rootResource.id, 'folder-a');

    const { resourceList, resourceMap } = useFileStore.getState();

    expect(resourceList).toEqual([]);
    expect(resourceMap.has(rootResource.id)).toBe(false);
  });

  it('should patch a file-backed document resource with statuses returned by file id', () => {
    const resource = createResource({
      chunkCount: null,
      fileId: 'file-1',
      id: 'docs-1',
    });

    useFileStore.setState({
      resourceList: [resource],
      resourceMap: new Map([[resource.id, resource]]),
    });

    useFileStore.getState().patchLocalResourceStatuses([
      {
        chunkCount: 10,
        chunkingError: null,
        chunkingStatus: 'success',
        embeddingError: null,
        embeddingStatus: 'success',
        finishEmbedding: true,
        id: 'file-1',
      },
    ]);

    const { resourceList, resourceMap } = useFileStore.getState();

    expect(resourceList[0]).toMatchObject({
      chunkCount: 10,
      chunkingStatus: 'success',
      embeddingStatus: 'success',
      finishEmbedding: true,
      id: 'docs-1',
    });
    expect(resourceMap.get('docs-1')).toMatchObject({
      chunkCount: 10,
      embeddingStatus: 'success',
    });
  });
});

describe('createResourceAndSync list placement', () => {
  const createParams = (parentId: string | null | undefined): CreateDocumentParams => ({
    content: '',
    fileType: 'custom/document',
    knowledgeBaseId: 'kb-1',
    parentId: parentId ?? undefined,
    sourceType: 'document',
    title: 'Untitled',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useFileStore.setState(initialState);
  });

  it('keeps a root-level create out of the list while a folder is open', async () => {
    const folderRow = createResource({ id: 'doc-in-folder', parentId: 'folder-a' });
    useFileStore.setState({
      queryParams: { libraryId: 'kb-1', parentId: 'folder-a-slug' },
      resourceList: [folderRow],
      resourceMap: new Map([[folderRow.id, folderRow]]),
    });
    mockCreateResource.mockResolvedValue(
      createResource({ id: 'doc-root', knowledgeBaseId: 'kb-1', parentId: null }),
    );

    const id = await useFileStore.getState().createResourceAndSync(createParams(null));

    expect(id).toBe('doc-root');
    expect(useFileStore.getState().resourceList.map((item) => item.id)).toEqual(['doc-in-folder']);
    expect(useFileStore.getState().resourceMap.has('doc-root')).toBe(true);
  });

  it('keeps a create inside a folder out of the list while the root is open', async () => {
    const rootRow = createResource({ id: 'doc-root', parentId: null });
    useFileStore.setState({
      queryParams: { libraryId: 'kb-1', parentId: null },
      resourceList: [rootRow],
      resourceMap: new Map([[rootRow.id, rootRow]]),
    });
    mockCreateResource.mockResolvedValue(
      createResource({ id: 'doc-nested', knowledgeBaseId: 'kb-1', parentId: 'folder-a' }),
    );

    await useFileStore.getState().createResourceAndSync(createParams('folder-a'));

    expect(useFileStore.getState().resourceList.map((item) => item.id)).toEqual(['doc-root']);
  });

  it('still lists a create in the open folder when that folder is addressed by slug and not cached', async () => {
    useFileStore.setState({
      queryParams: { libraryId: 'kb-1', parentId: 'folder-a-slug' },
      resourceList: [],
      resourceMap: new Map(),
    });
    mockCreateResource.mockResolvedValue(
      createResource({ id: 'doc-new', knowledgeBaseId: 'kb-1', parentId: 'folder-a' }),
    );

    await useFileStore.getState().createResourceAndSync(createParams('folder-a'));

    expect(useFileStore.getState().resourceList.map((item) => item.id)).toEqual(['doc-new']);
  });
});
