// Fixture data boundary only: the rendered feature components remain production imports.
export const useActiveWorkspaceId = () => undefined;
export const useWorkspaceMembersQuery = () => ({ members: [] });
export const useFetchAgentList = () => undefined;
export const useClientDataSWR = () => ({ data: [] });
export const useHomeStore = () => [];
export const useUserStore = () => false;
export const homeAgentListSelectors = { allAgents: () => [] };
export const authSelectors = { isLogin: () => false };
export const userProfileSelectors = { userId: () => undefined };
export const taskLabelKeys = { list: () => 'fixture-labels' };
export const taskLabelService = { getLabels: async () => [] };
export const useAgentDisplayMeta = () => undefined;
export const taskListSelectors = { getDisplayStatus: (status: string) => status };

export const useTaskCopyActions = () => ({
  taskId: 'FIX-42',
  hasBranch: true,
  copyBranch: () => {},
  copyLink: () => {},
  copyId: () => {},
});
export const useToolStore = () => [() => {}, () => {}];
