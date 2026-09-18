// DEV-ONLY acceptance shim — pins the active workspace id onto every lambda
// request. NOT FOR COMMIT: the cloud build supplies the real implementation.
export const getBusinessTrpcHeaders = async (): Promise<Record<string, string>> => {
  const workspaceId =
    typeof localStorage === 'undefined' ? null : localStorage.getItem('__acc_ws_id');
  return workspaceId ? { 'X-Workspace-Id': workspaceId } : {};
};
