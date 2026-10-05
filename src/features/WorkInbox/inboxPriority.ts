/**
 * Per-(user, workspace) scope key for inbox-related local preferences kept in
 * SystemStatus — a choice recorded in one workspace must never leak into
 * another (or across accounts on a shared device). Also used by MyWork for
 * its own per-tab display prefs under the same scoping rule.
 */
export const inboxPriorityScopeKey = (scope: {
  userId?: string;
  workspaceId: string | null;
}): string => `${scope.userId ?? 'anonymous'}:${scope.workspaceId ?? 'personal'}`;
