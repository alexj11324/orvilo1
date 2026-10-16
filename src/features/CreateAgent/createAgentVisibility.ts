/**
 * A workspace agent is shared, so creation there is public. Personal space
 * keeps the requested visibility, defaulting to private.
 */
export const resolveCreateAgentVisibility = ({
  lockVisibility = false,
  requested,
  workspaceId,
}: {
  lockVisibility?: boolean;
  requested?: 'private' | 'public';
  workspaceId?: string;
}): 'private' | 'public' => {
  if (lockVisibility) return 'private';
  if (workspaceId) return 'public';
  return requested ?? 'private';
};
