import { useActiveWorkspace } from './useActiveWorkspace';

/**
 * Active identity shown in the user button / panel header. Inside a workspace
 * it is the workspace's avatar + name so the header reflects the current
 * context; in personal mode it is `null` and callers fall back to user data.
 */
export interface ActiveIdentity {
  avatar?: string | null;
  name?: string | null;
}

export const useActiveIdentity = (): ActiveIdentity | null => {
  const workspace = useActiveWorkspace();
  if (!workspace) return null;
  return { avatar: workspace.avatar ?? null, name: workspace.name };
};
