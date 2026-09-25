import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mutate } from '@/libs/swr';
import { projectService } from '@/services/project';

import type { ProjectDetail, ProjectListItem } from './store';
import {
  projectLinkPendingKey,
  useCurrentProjectDetail,
  useCurrentProjectList,
  useProjectStore,
} from './store';

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: null as string | null,
  cacheScope: 'user-1:personal',
  currentCacheScope: 'user-1:personal',
  swrData: undefined as unknown,
  swrDataByKey: {} as Record<string, unknown>,
  swrConfigs: [] as Array<{ onSuccess?: (response: unknown) => void }>,
  swrKeys: [] as unknown[],
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  getActiveWorkspaceId: () => mocks.activeWorkspaceId,
  useActiveWorkspaceId: () => mocks.activeWorkspaceId,
}));

vi.mock('@/libs/swr/useCacheScope', () => ({
  getCacheScope: () => mocks.currentCacheScope,
  useCacheScope: () => mocks.cacheScope,
}));

vi.mock('@/libs/swr', () => ({
  mutate: vi.fn(),
  useClientDataSWR: vi.fn(
    (key: unknown, _fetcher: unknown, config: { onSuccess?: (response: unknown) => void } = {}) => {
      mocks.swrConfigs.push(config);
      mocks.swrKeys.push(key);
      const serializedKey = JSON.stringify(key);
      return {
        data:
          serializedKey in mocks.swrDataByKey ? mocks.swrDataByKey[serializedKey] : mocks.swrData,
      };
    },
  ),
}));

describe('project store cache scope', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    mocks.activeWorkspaceId = null;
    mocks.cacheScope = 'user-1:personal';
    mocks.currentCacheScope = 'user-1:personal';
    mocks.swrData = undefined;
    mocks.swrDataByKey = {};
    mocks.swrConfigs = [];
    mocks.swrKeys = [];
    useProjectStore.setState({ pendingProjectLinkKeys: [], projectDetails: {}, projectLists: {} });
    vi.mocked(mutate).mockReset();
    vi.mocked(mutate).mockImplementation(async (_key, data) => data);
    vi.spyOn(projectService, 'listLinks').mockResolvedValue({ data: [], success: true });
  });

  it('isolates link reads by account and project and disables absent project reads', () => {
    const response = {
      data: [{ id: 'link-1', title: 'Spec', url: 'https://example.com' }],
      success: true,
    };
    mocks.swrDataByKey[JSON.stringify(['project:links', 'user-1:personal', 'project-1'])] =
      response;
    const { result, rerender } = renderHook(
      ({ id }) => useProjectStore.getState().useFetchProjectLinks(id),
      {
        initialProps: { id: 'project-1' as string | undefined },
      },
    );
    expect(result.current.data).toBe(response);
    rerender({ id: 'project-2' });
    expect(result.current.data).toBeUndefined();
    mocks.cacheScope = 'user-2:personal';
    rerender({ id: 'project-1' });
    expect(result.current.data).toBeUndefined();
    rerender({ id: undefined });
    expect(mocks.swrKeys.at(-1)).toBeNull();
  });

  it('keeps link saves pending through readback and prevents duplicate submissions', async () => {
    let finishSave!: () => void;
    let finishReadback!: () => void;
    vi.spyOn(projectService, 'saveLink').mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finishSave = resolve;
      });
      return { data: { id: 'link-1' }, success: true } as Awaited<
        ReturnType<typeof projectService.saveLink>
      >;
    });
    vi.mocked(projectService.listLinks).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finishReadback = resolve;
      });
      return { data: [], success: true };
    });
    const input = { title: 'Spec', url: 'https://example.com' };
    const save = useProjectStore.getState().saveProjectLink('project-1', input);
    const key = projectLinkPendingKey('user-1:personal', 'project-1');
    expect(useProjectStore.getState().pendingProjectLinkKeys).toContain(key);
    await expect(useProjectStore.getState().saveProjectLink('project-1', input)).rejects.toThrow(
      'in progress',
    );
    expect(projectService.saveLink).toHaveBeenCalledOnce();
    finishSave();
    await vi.waitFor(() => expect(projectService.listLinks).toHaveBeenCalledWith('project-1'));
    expect(useProjectStore.getState().pendingProjectLinkKeys).toContain(key);
    finishReadback();
    await save;
    expect(useProjectStore.getState().pendingProjectLinkKeys).toEqual([]);
  });

  it('retains links on failed deletion, surfaces the error, and permits retry', async () => {
    const remove = vi
      .spyOn(projectService, 'removeLink')
      .mockRejectedValueOnce(new Error('Forbidden'));
    await expect(
      useProjectStore.getState().removeProjectLink('project-1', 'link-1'),
    ).rejects.toThrow('Forbidden');
    expect(mutate).not.toHaveBeenCalled();
    expect(useProjectStore.getState().pendingProjectLinkKeys).toEqual([]);
    remove.mockResolvedValue({ data: { id: 'link-1' }, success: true } as Awaited<
      ReturnType<typeof projectService.removeLink>
    >);
    await useProjectStore.getState().removeProjectLink('project-1', 'link-1');
    expect(projectService.listLinks).toHaveBeenCalledWith('project-1');
    expect(mutate).toHaveBeenCalledWith(
      ['project:links', 'user-1:personal', 'project-1'],
      expect.any(Promise),
      { revalidate: false, throwOnError: true },
    );
  });

  it('does not revalidate links with a different account after a late save', async () => {
    vi.spyOn(projectService, 'saveLink').mockImplementation(async () => {
      mocks.currentCacheScope = 'user-2:workspace-2';
      return { data: { id: 'link-1' }, success: true } as Awaited<
        ReturnType<typeof projectService.saveLink>
      >;
    });
    await useProjectStore
      .getState()
      .saveProjectLink('project-1', { title: 'Spec', url: 'https://example.com' });
    expect(mutate).not.toHaveBeenCalled();
    expect(useProjectStore.getState().pendingProjectLinkKeys).toEqual([]);
  });

  it('distinguishes a committed save from a failed readback so retry does not create duplicates', async () => {
    vi.spyOn(projectService, 'saveLink').mockResolvedValue({
      data: { id: 'link-1' },
      success: true,
    } as Awaited<ReturnType<typeof projectService.saveLink>>);
    vi.mocked(projectService.listLinks).mockRejectedValueOnce(new Error('Readback unavailable'));
    await expect(
      useProjectStore
        .getState()
        .saveProjectLink('project-1', { title: 'Spec', url: 'https://example.com' }),
    ).resolves.toMatchObject({
      data: { id: 'link-1' },
      success: true,
      refreshError: new Error('Readback unavailable'),
    });
    expect(useProjectStore.getState().pendingProjectLinkKeys).toEqual([]);
  });

  it('restores a persisted project list into the store before the first paint', () => {
    const cachedProject = { id: 'cached-project', name: 'Cached project' } as ProjectListItem;
    mocks.swrData = { data: [cachedProject], message: 'cached', success: true };

    renderHook(() => useProjectStore.getState().useFetchProjectList());

    expect(useProjectStore.getState().projectLists['user-1:personal']).toEqual([cachedProject]);
  });

  it('ignores a project response from a workspace that is no longer active', () => {
    const staleProject = { id: 'stale-project' } as ProjectListItem;
    mocks.swrData = { data: [staleProject], message: 'stale', success: true };
    mocks.cacheScope = 'user-1:personal';
    mocks.currentCacheScope = 'user-1:workspace-1';

    renderHook(() => useProjectStore.getState().useFetchProjectList());

    expect(useProjectStore.getState().projectLists['user-1:personal']).toBeUndefined();
    expect(useProjectStore.getState().projectLists['user-1:workspace-1']).toBeUndefined();
  });

  it('hides the previous account project list while old SWR data is still present', () => {
    const previousProject = { id: 'previous-project', name: 'Previous account' } as ProjectListItem;
    const previousResponse = { data: [previousProject], success: true };
    // Simulate the old shared key remaining populated until Query reloads the new scope.
    mocks.swrDataByKey = {
      [JSON.stringify('project/list')]: previousResponse,
      [JSON.stringify(['project/list', 'user-1:personal'])]: previousResponse,
    };
    const { rerender } = renderHook(() => useProjectStore.getState().useFetchProjectList());

    mocks.cacheScope = 'user-2:personal';
    mocks.currentCacheScope = 'user-2:personal';
    rerender();

    expect(mocks.swrKeys).toEqual([
      ['project/list', 'user-1:personal'],
      ['project/list', 'user-2:personal'],
    ]);
    expect(renderHook(() => useCurrentProjectList()).result.current).toEqual([]);
  });

  it('hides the previous account project detail after switching accounts', () => {
    const previousDetail = {
      project: { id: 'shared-id', name: 'Previous account' },
    } as ProjectDetail;
    const { rerender } = renderHook(() =>
      useProjectStore.getState().useFetchProjectDetail('shared-id'),
    );

    act(() => mocks.swrConfigs.at(-1)?.onSuccess?.({ data: previousDetail, success: true }));
    mocks.cacheScope = 'user-2:personal';
    mocks.currentCacheScope = 'user-2:personal';
    rerender();

    expect(renderHook(() => useCurrentProjectDetail('shared-id')).result.current).toBeUndefined();
  });

  it('keeps project lists isolated between personal and workspace contexts', () => {
    const personalProject = { id: 'personal-project' } as ProjectListItem;
    const workspaceProject = { id: 'workspace-project' } as ProjectListItem;
    mocks.swrData = { data: [personalProject], success: true };
    const { rerender } = renderHook(() => useProjectStore.getState().useFetchProjectList());

    mocks.activeWorkspaceId = 'workspace-1';
    mocks.cacheScope = 'user-1:workspace-1';
    mocks.currentCacheScope = 'user-1:workspace-1';
    mocks.swrData = { data: [workspaceProject], success: true };
    rerender();

    expect(renderHook(() => useCurrentProjectList()).result.current).toEqual([workspaceProject]);

    mocks.activeWorkspaceId = null;
    mocks.cacheScope = 'user-1:personal';
    mocks.currentCacheScope = 'user-1:personal';
    expect(renderHook(() => useCurrentProjectList()).result.current).toEqual([personalProject]);
  });

  it('keeps project details isolated between personal and workspace contexts', () => {
    const personalDetail = { project: { id: 'shared-id', name: 'Personal' } } as ProjectDetail;
    const workspaceDetail = { project: { id: 'shared-id', name: 'Workspace' } } as ProjectDetail;
    const { rerender } = renderHook(() =>
      useProjectStore.getState().useFetchProjectDetail('shared-id'),
    );

    act(() => mocks.swrConfigs.at(-1)?.onSuccess?.({ data: personalDetail, success: true }));
    mocks.activeWorkspaceId = 'workspace-1';
    mocks.cacheScope = 'user-1:workspace-1';
    mocks.currentCacheScope = 'user-1:workspace-1';
    rerender();
    act(() => mocks.swrConfigs.at(-1)?.onSuccess?.({ data: workspaceDetail, success: true }));

    expect(mocks.swrKeys).toEqual([
      ['project/detail', 'user-1:personal', 'shared-id'],
      ['project/detail', 'user-1:workspace-1', 'shared-id'],
    ]);
    expect(renderHook(() => useCurrentProjectDetail('shared-id')).result.current).toBe(
      workspaceDetail,
    );
    mocks.activeWorkspaceId = null;
    mocks.cacheScope = 'user-1:personal';
    mocks.currentCacheScope = 'user-1:personal';
    expect(renderHook(() => useCurrentProjectDetail('shared-id')).result.current).toBe(
      personalDetail,
    );
  });

  it('pins project creation to the active workspace', async () => {
    mocks.activeWorkspaceId = 'workspace-1';
    const project = { id: 'project-1', slug: 'launch' } as ProjectListItem;
    vi.spyOn(projectService, 'create').mockResolvedValue({
      data: project,
      message: 'Project created',
      success: true,
    });

    await expect(
      useProjectStore
        .getState()
        .createProject({ identifier: 'LOB', name: 'Launch', slug: 'launch' }),
    ).resolves.toBe(project);

    expect(projectService.create).toHaveBeenCalledWith(
      { identifier: 'LOB', name: 'Launch', slug: 'launch' },
      'workspace-1',
    );
  });

  it('refreshes the project list after deletion', async () => {
    vi.mocked(mutate).mockClear();
    vi.spyOn(projectService, 'delete').mockResolvedValue({
      data: { id: 'project-1' } as ProjectListItem,
      message: 'Project deleted',
      success: true,
    });

    await useProjectStore.getState().deleteProject('project-1');

    expect(projectService.delete).toHaveBeenCalledWith('project-1');
    expect(mutate).toHaveBeenCalledWith(['project/list', 'user-1:personal']);
  });

  it.each([{ name: 'Renamed' }, { summary: 'Revised summary' }, { summary: '' }])(
    'updates project list and detail caches after editing %j',
    async (input) => {
      const project = { id: 'project-1', name: 'Original', slug: 'launch' } as ProjectListItem;
      const renamed = { ...project, ...input };
      const detail = { project } as unknown as ProjectDetail;
      const refreshProjectList = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(projectService, 'update').mockResolvedValue({
        data: renamed,
        message: 'Project updated',
        success: true,
      });
      useProjectStore.setState({
        projectDetails: { 'user-1:personal': { launch: detail } },
        projectLists: { 'user-1:personal': [project] },
        refreshProjectList,
      });

      await useProjectStore.getState().updateProject('project-1', input);

      expect(useProjectStore.getState().projectLists['user-1:personal'][0]).toMatchObject(input);
      expect(
        useProjectStore.getState().projectDetails['user-1:personal'].launch.project,
      ).toMatchObject(input);
      expect(refreshProjectList).toHaveBeenCalledOnce();
    },
  );

  it('refreshes label bindings in cached slug and ID details after a label update', async () => {
    const project = { id: 'project-labels', name: 'Labels' } as ProjectListItem;
    const stale = { project, labels: [{ id: 'old', name: 'Old' }] } as unknown as ProjectDetail;
    const updated = { ...stale, labels: [] };
    vi.spyOn(projectService, 'update').mockResolvedValue({
      data: project,
      message: '',
      success: true,
    });
    vi.spyOn(projectService, 'detail').mockResolvedValue({ data: updated, success: true });
    useProjectStore.setState({
      projectDetails: { 'user-1:personal': { 'labels': stale, 'project-labels': stale } },
      refreshProjectList: vi.fn().mockResolvedValue(undefined),
    });
    await useProjectStore.getState().updateProject(project.id, { labelIds: [] });
    const details = useProjectStore.getState().projectDetails['user-1:personal'];
    expect(details.labels.labels).toEqual([]);
    expect(details['project-labels'].labels).toEqual([]);
  });

  it('revalidates slug-keyed detail views after a milestone write', async () => {
    const project = { id: 'project-1', slug: 'launch' } as ProjectListItem;
    const detail = { project } as unknown as ProjectDetail;
    vi.spyOn(projectService, 'createMilestone').mockResolvedValue({
      data: { id: 'milestone-1', name: 'M1' },
      success: true,
    } as Awaited<ReturnType<typeof projectService.createMilestone>>);
    useProjectStore.setState({
      projectDetails: { 'user-1:personal': { launch: detail } },
    });

    await useProjectStore.getState().createMilestone('project-1', { name: 'M1' });

    expect(mutate).toHaveBeenCalledWith(['project/detail', 'user-1:personal', 'project-1']);
    expect(mutate).toHaveBeenCalledWith(['project/detail', 'user-1:personal', 'launch']);
  });

  it('updates the cached project after an orchestration policy save', async () => {
    const project = {
      coordinatorAgentId: 'agent-before',
      id: 'project-1',
      name: 'Policy project',
      orchestrationPolicy: {
        autoDispatch: false,
        replanMode: 'disabled',
        requireHumanReview: true,
      },
      orchestrationPolicyRevision: 1,
    } as ProjectListItem;
    const detail = { project } as unknown as ProjectDetail;
    vi.spyOn(projectService, 'updateOrchestrationPolicy').mockResolvedValue({
      data: {
        coordinatorAgentId: 'agent-after',
        orchestrationPolicy: { ...project.orchestrationPolicy, autoDispatch: true },
        orchestrationPolicyRevision: 2,
        requireHumanReviewRequired: false,
      },
      message: 'Project orchestration policy updated',
      success: true,
    });
    useProjectStore.setState({
      projectDetails: { 'user-1:personal': { 'project-1': detail } },
    });

    await useProjectStore.getState().updateProjectOrchestrationPolicy({
      coordinatorAgentId: 'agent-after',
      expectedRevision: 1,
      id: 'project-1',
      orchestrationPolicy: project.orchestrationPolicy,
    });

    expect(
      useProjectStore.getState().projectDetails['user-1:personal']['project-1'].project,
    ).toEqual(
      expect.objectContaining({
        coordinatorAgentId: 'agent-after',
        orchestrationPolicyRevision: 2,
      }),
    );
  });
});
