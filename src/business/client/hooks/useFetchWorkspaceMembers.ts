import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';

export interface FetchWorkspaceMembersOptions {
  includeDeleted?: boolean;
}

/**
 * Member roster of the active workspace with loading state — the query
 * surface behind pickers and settings lists. Empty with `isLoading: false`
 * in personal mode (`useWorkspaceMembersQuery` stays disabled without an
 * active workspace).
 */
export const useFetchWorkspaceMembers = (options: FetchWorkspaceMembersOptions = {}) => {
  const { data, isLoading } = useWorkspaceMembersQuery({
    includeDeleted: options.includeDeleted,
  });
  return { data: data ?? [], isLoading };
};
