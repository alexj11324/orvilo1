import { lambdaClient } from '@/libs/trpc/client';

class WorkspaceService {
  list = (...args: Parameters<typeof lambdaClient.workspace.list.query>) =>
    lambdaClient.workspace.list.query(...args);

  create = (...args: Parameters<typeof lambdaClient.workspace.create.mutate>) =>
    lambdaClient.workspace.create.mutate(...args);

  ensureDefault = (...args: Parameters<typeof lambdaClient.workspace.ensureDefault.mutate>) =>
    lambdaClient.workspace.ensureDefault.mutate(...args);
}

export const workspaceService = new WorkspaceService();
