import { lambdaClient, toolsClient } from '@/libs/trpc/client';

class ComposioService {
  getConnection = (...args: Parameters<typeof lambdaClient.composio.getConnection.query>) =>
    lambdaClient.composio.getConnection.query(...args);

  listActions = (...args: Parameters<typeof toolsClient.composio.listActions.query>) =>
    toolsClient.composio.listActions.query(...args);

  updateComposioPlugin = (
    ...args: Parameters<typeof lambdaClient.composio.updateComposioPlugin.mutate>
  ) => lambdaClient.composio.updateComposioPlugin.mutate(...args);

  createConnection = (...args: Parameters<typeof lambdaClient.composio.createConnection.mutate>) =>
    lambdaClient.composio.createConnection.mutate(...args);

  executeAction = (...args: Parameters<typeof toolsClient.composio.executeAction.mutate>) =>
    toolsClient.composio.executeAction.mutate(...args);

  deleteConnection = (...args: Parameters<typeof lambdaClient.composio.deleteConnection.mutate>) =>
    lambdaClient.composio.deleteConnection.mutate(...args);

  getActions = (...args: Parameters<typeof toolsClient.composio.getActions.query>) =>
    toolsClient.composio.getActions.query(...args);

  getComposioPlugins = (
    ...args: Parameters<typeof lambdaClient.composio.getComposioPlugins.query>
  ) => lambdaClient.composio.getComposioPlugins.query(...args);
}

export const composioService = new ComposioService();
