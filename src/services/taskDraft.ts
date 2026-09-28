import { createWorkspaceLambdaClient } from '@/libs/trpc/client';

type DraftWorkspaceId = string | null;

export const taskDraftService = {
  count: (workspaceId: DraftWorkspaceId) =>
    createWorkspaceLambdaClient(workspaceId).taskDraft.count.query(),
  delete: (taskId: string, workspaceId: DraftWorkspaceId) =>
    createWorkspaceLambdaClient(workspaceId).taskDraft.delete.mutate({ taskId }),
  deleteAll: (workspaceId: DraftWorkspaceId) =>
    createWorkspaceLambdaClient(workspaceId).taskDraft.deleteAll.mutate(),
  get: (taskId: string, workspaceId: DraftWorkspaceId) =>
    createWorkspaceLambdaClient(workspaceId).taskDraft.get.query({ taskId }),
  list: (workspaceId: DraftWorkspaceId) =>
    createWorkspaceLambdaClient(workspaceId).taskDraft.list.query(),
  upsert: (
    input: { content: string; editorData?: unknown; taskId: string },
    workspaceId: DraftWorkspaceId,
  ) => createWorkspaceLambdaClient(workspaceId).taskDraft.upsert.mutate(input),
};

export const taskDraftKeys = {
  count: (workspaceId?: string | null) => ['taskDraft', workspaceId, 'count'] as const,
  list: (workspaceId?: string | null) => ['taskDraft', workspaceId, 'list'] as const,
};
