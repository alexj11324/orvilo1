/** A task can retain its identifier while moving to another workspace. */
export const commentComposerKey = (taskId: string, workspaceId: string | null) =>
  JSON.stringify([workspaceId, taskId]);
