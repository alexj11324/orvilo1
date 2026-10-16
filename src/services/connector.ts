import { lambdaClient } from '@/libs/trpc/client';

class ConnectorService {
  getRedirectUri = (...args: Parameters<typeof lambdaClient.connector.getRedirectUri.query>) =>
    lambdaClient.connector.getRedirectUri.query(...args);

  githubMcpCapability = (
    ...args: Parameters<typeof lambdaClient.connector.githubMcpCapability.query>
  ) => lambdaClient.connector.githubMcpCapability.query(...args);

  list = (...args: Parameters<typeof lambdaClient.connector.list.query>) =>
    lambdaClient.connector.list.query(...args);

  listAgentBound = (...args: Parameters<typeof lambdaClient.connector.listAgentBound.query>) =>
    lambdaClient.connector.listAgentBound.query(...args);

  listByAgent = (...args: Parameters<typeof lambdaClient.connector.listByAgent.query>) =>
    lambdaClient.connector.listByAgent.query(...args);

  copyToAgent = (...args: Parameters<typeof lambdaClient.connector.copyToAgent.mutate>) =>
    lambdaClient.connector.copyToAgent.mutate(...args);

  mountToAgent = (...args: Parameters<typeof lambdaClient.connector.mountToAgent.mutate>) =>
    lambdaClient.connector.mountToAgent.mutate(...args);

  unmountFromAgent = (...args: Parameters<typeof lambdaClient.connector.unmountFromAgent.mutate>) =>
    lambdaClient.connector.unmountFromAgent.mutate(...args);

  delete = (...args: Parameters<typeof lambdaClient.connector.delete.mutate>) =>
    lambdaClient.connector.delete.mutate(...args);

  getForEdit = (...args: Parameters<typeof lambdaClient.connector.getForEdit.query>) =>
    lambdaClient.connector.getForEdit.query(...args);

  create = (...args: Parameters<typeof lambdaClient.connector.create.mutate>) =>
    lambdaClient.connector.create.mutate(...args);

  startOAuth = (...args: Parameters<typeof lambdaClient.connector.startOAuth.mutate>) =>
    lambdaClient.connector.startOAuth.mutate(...args);

  connectGitHubMcp = (...args: Parameters<typeof lambdaClient.connector.connectGitHubMcp.mutate>) =>
    lambdaClient.connector.connectGitHubMcp.mutate(...args);

  update = (...args: Parameters<typeof lambdaClient.connector.update.mutate>) =>
    lambdaClient.connector.update.mutate(...args);

  syncTools = (...args: Parameters<typeof lambdaClient.connector.syncTools.mutate>) =>
    lambdaClient.connector.syncTools.mutate(...args);

  syncToolsFromClientById = (
    ...args: Parameters<typeof lambdaClient.connector.syncToolsFromClientById.mutate>
  ) => lambdaClient.connector.syncToolsFromClientById.mutate(...args);

  resetPermissions = (...args: Parameters<typeof lambdaClient.connector.resetPermissions.mutate>) =>
    lambdaClient.connector.resetPermissions.mutate(...args);

  syncToolsFromClient = (
    ...args: Parameters<typeof lambdaClient.connector.syncToolsFromClient.mutate>
  ) => lambdaClient.connector.syncToolsFromClient.mutate(...args);

  syncBuiltinTool = (...args: Parameters<typeof lambdaClient.connector.syncBuiltinTool.mutate>) =>
    lambdaClient.connector.syncBuiltinTool.mutate(...args);

  syncPluginTools = (...args: Parameters<typeof lambdaClient.connector.syncPluginTools.mutate>) =>
    lambdaClient.connector.syncPluginTools.mutate(...args);

  updateToolPermission = (
    ...args: Parameters<typeof lambdaClient.connector.updateToolPermission.mutate>
  ) => lambdaClient.connector.updateToolPermission.mutate(...args);
}

export const connectorService = new ConnectorService();
