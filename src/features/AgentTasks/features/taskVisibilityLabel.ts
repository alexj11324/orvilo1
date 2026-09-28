import type { LucideIcon } from 'lucide-react';
import { Globe, LockIcon, UsersIcon } from 'lucide-react';

export type TaskVisibility = 'private' | 'public';

/**
 * The list filter speaks a slightly wider vocabulary than the task field:
 * `workspace` names the same shared scope `public` does, and `all` means
 * "any visibility". One map keeps both spellings on the same glyphs —
 * private locks, shared scopes carry the members mark — so the picker, the
 * chip and the private-row badge can never disagree.
 */
export type TaskVisibilityKey = TaskVisibility | 'all' | 'workspace';

export const TASK_VISIBILITY_ICONS: Record<TaskVisibilityKey, LucideIcon> = {
  all: Globe,
  private: LockIcon,
  public: UsersIcon,
  workspace: UsersIcon,
};

export const getTaskVisibilityDefaultLabel = (visibility: TaskVisibility) =>
  visibility === 'private' ? 'Private' : 'Workspace';

export const getTaskVisibilityLabelKey = (visibility: TaskVisibility) =>
  visibility === 'private' ? 'createTask.visibility.private' : 'createTask.visibility.workspace';
