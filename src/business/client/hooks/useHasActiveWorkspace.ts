import { useActiveWorkspaceId } from './useActiveWorkspaceId';

/** Whether the caller is currently scoped into a workspace (vs personal mode). */
export const useHasActiveWorkspace = (): boolean => useActiveWorkspaceId() !== null;
