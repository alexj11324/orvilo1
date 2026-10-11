interface AcceptInviteDeps {
  accept: (token: string) => Promise<{ workspaceId: string }>;
  listWorkspaces: () => Promise<{ id: string; slug: string }[]>;
  refreshUserState: () => Promise<void>;
}

/** Where to land for a joined workspace; home when its slug cannot be resolved. */
export const resolveWorkspacePath = async (
  workspaceId: string,
  listWorkspaces: AcceptInviteDeps['listWorkspaces'],
): Promise<string> => {
  try {
    const slug = (await listWorkspaces()).find((m) => m.id === workspaceId)?.slug;
    return slug ? `/${slug}` : '/';
  } catch {
    return '/';
  }
};

/**
 * Accept an invitation and return the path to land on. Accepting also completes
 * onboarding on the server, so the signed-in user's state is reloaded before
 * navigating — otherwise the stale "needs onboarding" state would send the
 * invitee to the setup wizard. A failed reload does not undo the accepted
 * invitation, so it never turns a successful accept into an error.
 */
export const acceptInviteAndResolvePath = async (
  token: string,
  { accept, listWorkspaces, refreshUserState }: AcceptInviteDeps,
): Promise<string> => {
  const { workspaceId } = await accept(token);
  await refreshUserState().catch((error: unknown) => {
    console.error('[invite] failed to refresh user state after accepting:', error);
  });
  return resolveWorkspacePath(workspaceId, listWorkspaces);
};
