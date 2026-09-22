import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';

/** Task detail routes resolve the visible identifier, not the database UUID. */
export const draftEditPath = (draft: { taskIdentifier: string; taskName: string | null }) =>
  `${taskDetailPath(draft.taskIdentifier, undefined, draft.taskName)}?draft=1`;
