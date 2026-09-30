import { createWorkspaceLambdaClient } from '@/libs/trpc/client';

// These records belong to the signed-in user, independent of the active workspace.
const lambdaClient = createWorkspaceLambdaClient(null);

export const experienceMemoryService = {
  list: (offset: number) => lambdaClient.experienceMemory.list.query({ offset, limit: 20 }),
  search: (query: string) => lambdaClient.experienceMemory.search.query({ query, limit: 50 }),
  create: (content: string) =>
    lambdaClient.experienceMemory.create.mutate({ kind: 'experience', content }),
  update: (id: string, revision: number, content: string) =>
    lambdaClient.experienceMemory.update.mutate({ id, revision, content }),
  delete: (id: string, revision: number) =>
    lambdaClient.experienceMemory.delete.mutate({ id, revision }),
};
