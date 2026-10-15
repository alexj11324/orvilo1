/** Compatibility entrypoint; resource authorization is owned by the service layer. */
export {
  assertCanUseWorkspaceAgent,
  getWorkspaceAgentParentGroupIds,
  getWorkspaceGroupVirtualAgentIds,
} from '@/server/services/resourcePermission/workspaceAgentGuard';
