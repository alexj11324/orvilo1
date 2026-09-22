import type { ProjectOrchestrationPolicy } from '@orvilo/types';
import { useLayoutEffect } from 'react';
import type { SWRResponse } from 'swr';
import { shallow } from 'zustand/shallow';
import { createWithEqualityFn } from 'zustand/traditional';

import { getActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { projectKeys } from '@/libs/swr/keys';
import { getCacheScope, useCacheScope } from '@/libs/swr/useCacheScope';
import { projectService } from '@/services/project';
import { createDevtools } from '@/store/middleware/createDevtools';
import { expose } from '@/store/middleware/expose';

type ProjectListResponse = Awaited<ReturnType<typeof projectService.listAll>>;
type ProjectDetailResponse = Awaited<ReturnType<typeof projectService.detail>>;
type ProjectOrchestrationPolicyResponse = Awaited<
  ReturnType<typeof projectService.getOrchestrationPolicy>
>;
export type ProjectListItem = ProjectListResponse['data'][number];
export type ProjectDetail = ProjectDetailResponse['data'];
export type ProjectOrchestrationPolicyView = ProjectOrchestrationPolicyResponse['data'];

const LIST_KEY = 'project/list';
const listKey = (scope: string) => [LIST_KEY, scope] as const;
const detailKey = (scope: string, id: string) => ['project/detail', scope, id] as const;

interface ProjectStore {
  createProject: (input: Parameters<typeof projectService.create>[0]) => Promise<ProjectListItem>;
  deleteProject: (id: string) => Promise<void>;
  pendingProjectLinkKeys: string[];
  projectDetails: Record<string, Record<string, ProjectDetail>>;
  projectLists: Record<string, ProjectListItem[]>;
  refreshProjectList: () => Promise<void>;
  removeProjectLink: (
    id: string,
    linkId: string,
  ) => Promise<Awaited<ReturnType<typeof projectService.removeLink>> & { refreshError?: unknown }>;
  saveProjectLink: (
    id: string,
    input: Parameters<typeof projectService.saveLink>[1],
  ) => Promise<Awaited<ReturnType<typeof projectService.saveLink>> & { refreshError?: unknown }>;
  updateProject: (
    id: string,
    input: Parameters<typeof projectService.update>[1],
  ) => Promise<ProjectListItem>;
  updateProjectOrchestrationPolicy: (input: {
    coordinatorAgentId: string;
    expectedRevision: number;
    id: string;
    orchestrationPolicy: ProjectOrchestrationPolicy;
  }) => Promise<ProjectOrchestrationPolicyView>;
  useFetchProjectDetail: (id?: string) => SWRResponse<ProjectDetailResponse>;
  useFetchProjectLabels: () => SWRResponse<Awaited<ReturnType<typeof projectService.labels>>>;
  useFetchProjectLinks: (
    id?: string,
  ) => SWRResponse<Awaited<ReturnType<typeof projectService.listLinks>>>;
  useFetchProjectList: (enabled?: boolean) => SWRResponse<ProjectListResponse>;
  useFetchProjectOrchestrationPolicy: (
    id?: string,
    enabled?: boolean,
  ) => SWRResponse<ProjectOrchestrationPolicyResponse>;
  useFetchProjectTeams: () => SWRResponse<Awaited<ReturnType<typeof projectService.teams>>>;
}

const devtools = createDevtools('project');

export const projectLinkPendingKey = (scope: string, id: string, linkId?: string) =>
  JSON.stringify([scope, id, linkId ?? 'create']);

const refreshLinksAfterWrite = async (scope: string, id: string) => {
  // An already-committed write must not be presented as a failed save if only
  // readback failed: retrying creation would produce a duplicate resource.
  if (scope !== getCacheScope()) return {};
  try {
    await mutate(projectKeys.links(scope, id), projectService.listLinks(id), {
      revalidate: false,
      throwOnError: true,
    });
    return {};
  } catch (refreshError) {
    return { refreshError };
  }
};

export const useProjectStore = createWithEqualityFn<ProjectStore>()(
  devtools((set, get) => ({
    pendingProjectLinkKeys: [],
    useFetchProjectLinks: (id) => {
      const scope = useCacheScope();
      return useClientDataSWR(id ? projectKeys.links(scope, id) : null, () =>
        projectService.listLinks(id!),
      );
    },
    saveProjectLink: async (id, input) => {
      const scope = getCacheScope();
      const key = projectLinkPendingKey(scope, id, input.linkId);
      if (get().pendingProjectLinkKeys.includes(key))
        throw new Error('Project link save in progress');
      set({ pendingProjectLinkKeys: [...get().pendingProjectLinkKeys, key] });
      try {
        const response = await projectService.saveLink(id, input);
        // The API client and SWR invalidator use the active workspace. A late
        // response must not revalidate a retained view using another workspace.
        return { ...response, ...(await refreshLinksAfterWrite(scope, id)) };
      } finally {
        set({
          pendingProjectLinkKeys: get().pendingProjectLinkKeys.filter((item) => item !== key),
        });
      }
    },
    removeProjectLink: async (id, linkId) => {
      const scope = getCacheScope();
      const key = projectLinkPendingKey(scope, id, linkId);
      if (get().pendingProjectLinkKeys.includes(key))
        throw new Error('Project link save in progress');
      set({ pendingProjectLinkKeys: [...get().pendingProjectLinkKeys, key] });
      try {
        const response = await projectService.removeLink(id, linkId);
        return { ...response, ...(await refreshLinksAfterWrite(scope, id)) };
      } finally {
        set({
          pendingProjectLinkKeys: get().pendingProjectLinkKeys.filter((item) => item !== key),
        });
      }
    },
    useFetchProjectLabels: () =>
      useClientDataSWR(getActiveWorkspaceId() ? ['project/labels'] : null, () =>
        projectService.labels(),
      ),
    useFetchProjectTeams: () =>
      useClientDataSWR(getActiveWorkspaceId() ? ['project/teams'] : null, () =>
        projectService.teams(),
      ),
    createProject: async (input) => {
      const response = await projectService.create(input, getActiveWorkspaceId());
      await get().refreshProjectList();
      return response.data;
    },
    deleteProject: async (id) => {
      await projectService.delete(id);
      await get().refreshProjectList();
    },
    projectDetails: {},
    projectLists: {},
    refreshProjectList: async () => mutate(listKey(getCacheScope())),
    updateProjectOrchestrationPolicy: async ({ id, ...input }) => {
      const response = await projectService.updateOrchestrationPolicy(id, input);
      const policy = response.data;

      set(
        (state) => ({
          projectDetails: Object.fromEntries(
            Object.entries(state.projectDetails).map(([scope, details]) => [
              scope,
              Object.fromEntries(
                Object.entries(details).map(([reference, detail]) => [
                  reference,
                  detail.project.id === id
                    ? {
                        ...detail,
                        project: {
                          ...detail.project,
                          coordinatorAgentId: policy.coordinatorAgentId,
                          orchestrationPolicy: policy.orchestrationPolicy,
                          orchestrationPolicyRevision: policy.orchestrationPolicyRevision,
                        },
                      }
                    : detail,
                ]),
              ),
            ]),
          ),
          projectLists: Object.fromEntries(
            Object.entries(state.projectLists).map(([scope, projects]) => [
              scope,
              projects.map((project) =>
                project.id === id
                  ? {
                      ...project,
                      coordinatorAgentId: policy.coordinatorAgentId,
                      orchestrationPolicy: policy.orchestrationPolicy,
                      orchestrationPolicyRevision: policy.orchestrationPolicyRevision,
                    }
                  : project,
              ),
            ]),
          ),
        }),
        false,
        'updateProjectOrchestrationPolicy/success',
      );

      return policy;
    },
    updateProject: async (id, input) => {
      const requestScope = getCacheScope();
      const response = await projectService.update(id, input);
      const project = response.data;
      // Bindings are not part of the scalar update response. Read the confirmed
      // detail so retained slug/ID views do not keep the previous label selection.
      const labels =
        input.labelIds !== undefined && requestScope === getCacheScope()
          ? (await projectService.detail(id)).data.labels
          : undefined;

      set(
        (state) => ({
          projectDetails: Object.fromEntries(
            Object.entries(state.projectDetails).map(([scope, details]) => [
              scope,
              Object.fromEntries(
                Object.entries(details).map(([reference, detail]) => [
                  reference,
                  detail.project.id === id
                    ? {
                        ...detail,
                        project,
                        ...(scope === requestScope && labels !== undefined ? { labels } : {}),
                      }
                    : detail,
                ]),
              ),
            ]),
          ),
          projectLists: Object.fromEntries(
            Object.entries(state.projectLists).map(([scope, projects]) => [
              scope,
              projects.map((item) => (item.id === id ? { ...item, ...project } : item)),
            ]),
          ),
        }),
        false,
        'updateProject/success',
      );
      await get().refreshProjectList();
      return project;
    },
    useFetchProjectDetail: (id) => {
      const scope = useCacheScope();

      return useClientDataSWR(id ? detailKey(scope, id) : null, () => projectService.detail(id!), {
        onSuccess: (response: ProjectDetailResponse) => {
          if (scope !== getCacheScope()) return;

          set(
            (state) => ({
              projectDetails: {
                ...state.projectDetails,
                [scope]: { ...state.projectDetails[scope], [id!]: response.data },
              },
            }),
            false,
            'useFetchProjectDetail/success',
          );
        },
      });
    },
    useFetchProjectOrchestrationPolicy: (id, enabled = true) => {
      const scope = useCacheScope();
      return useClientDataSWR(
        enabled && id ? ['project/orchestrationPolicy', scope, id] : null,
        () => projectService.getOrchestrationPolicy(id!),
        {
          onSuccess: (response: ProjectOrchestrationPolicyResponse) => {
            if (scope !== getCacheScope()) return;

            set(
              (state) => ({
                projectDetails: Object.fromEntries(
                  Object.entries(state.projectDetails).map(([detailScope, details]) => [
                    detailScope,
                    Object.fromEntries(
                      Object.entries(details).map(([reference, detail]) => [
                        reference,
                        detail.project.id === id
                          ? {
                              ...detail,
                              project: {
                                ...detail.project,
                                coordinatorAgentId: response.data.coordinatorAgentId,
                                orchestrationPolicy: response.data.orchestrationPolicy,
                                orchestrationPolicyRevision:
                                  response.data.orchestrationPolicyRevision,
                              },
                            }
                          : detail,
                      ]),
                    ),
                  ]),
                ),
              }),
              false,
              'useFetchProjectOrchestrationPolicy/success',
            );
          },
        },
      );
    },
    useFetchProjectList: (enabled = true) => {
      const scope = useCacheScope();
      const response = useClientDataSWR(enabled ? listKey(scope) : null, () =>
        projectService.listAll(),
      );
      const { data } = response;

      useLayoutEffect(() => {
        /**
         * SWR cache hits do not invoke onSuccess. Hydrate Zustand before paint
         * so the sidebar can render the cached list during a cold refresh.
         * Ignore data captured for an obsolete user or workspace scope.
         */
        if (!enabled || !data || scope !== getCacheScope()) return;

        set(
          (state) => ({ projectLists: { ...state.projectLists, [scope]: data.data } }),
          false,
          'useFetchProjectList/hydrate',
        );
      }, [data, enabled, scope]);

      return response;
    },
  })),
  shallow,
);

expose('project', useProjectStore);

export const useCurrentProjectList = () => {
  const scope = useCacheScope();
  return useProjectStore((state) => state.projectLists[scope] ?? []);
};

export const useCurrentProjectDetail = (id?: string) => {
  const scope = useCacheScope();
  return useProjectStore((state) => (id ? state.projectDetails[scope]?.[id] : undefined));
};
