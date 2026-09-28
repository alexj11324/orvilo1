import { useHasActiveWorkspace } from './useHasActiveWorkspace';
import { useWorkspaceCapabilities } from './useWorkspaceCapabilities';

/**
 * Whether the caller may act as the owner of the current scope. Inside a
 * workspace this is the membership role (`role === 'owner'`); in personal
 * mode the caller owns everything in scope, so it stays `true`.
 */
export const useIsWorkspaceOwner = (): boolean => {
  const hasWorkspace = useHasActiveWorkspace();
  const { isOwner } = useWorkspaceCapabilities();
  return hasWorkspace ? isOwner : true;
};
