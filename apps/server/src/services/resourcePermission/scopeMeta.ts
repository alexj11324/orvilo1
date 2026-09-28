/**
 * Workspace-scope admission for one row — mirrors `buildWorkspaceWhere`'s
 * union semantics in the database layer: the caller's own unfiled rows
 * (`workspace_id IS NULL`) follow them into workspace scope, so activating a
 * workspace never locks the owner out of their pre-provisioning data. A
 * teammate's unfiled rows and any foreign-workspace row still fail.
 *
 * Lives in a leaf module on purpose: tests routinely `vi.mock` the parent
 * `./index` service with a partial factory, and a predicate imported from
 * there would resolve to `undefined` inside the guards that depend on it.
 */
export const isWorkspaceScopedMeta = (
  meta: { userId: string; workspaceId: string | null },
  workspaceId: string,
  userId: string,
): boolean =>
  meta.workspaceId === workspaceId || (meta.workspaceId === null && meta.userId === userId);
