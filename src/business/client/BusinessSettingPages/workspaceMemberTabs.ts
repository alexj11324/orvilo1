export type WorkspaceMemberTabKey = 'agents' | 'invitations' | 'members';

/**
 * Tab keys for the workspace members page. The invitations tab is withheld
 * rather than rendered-then-failed: mounting it fires the invitations list
 * endpoint, which only owner/admin callers are authorized for — members and
 * viewers must never see the tab (the server enforces the same ceiling).
 */
export const workspaceMemberTabKeys = (canInvite: boolean): WorkspaceMemberTabKey[] =>
  canInvite ? ['members', 'invitations', 'agents'] : ['members', 'agents'];
