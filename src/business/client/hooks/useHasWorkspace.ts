import { useWorkspaces } from './useWorkspaces';

/** Whether the caller holds any workspace membership at all. */
export const useHasWorkspace = (): boolean => useWorkspaces().length > 0;
