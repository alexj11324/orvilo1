import type { TaskDetailData } from '@orvilo/types';

/**
 * The id an Issue's attached links/PRs are read and written under.
 *
 * `taskMenu.links` / `addLink` / `removeLink` go through `TaskModel.resolve`,
 * which treats only `task_`-prefixed strings as database ids and uppercases
 * everything else into an identifier lookup. A row whose database id has a
 * different shape (imported or seeded fixtures such as `taskparitymine0002`)
 * therefore answers "Task not found" when addressed by `detail.id`, while its
 * public identifier (`PMI-2`) always resolves — it is how the detail itself was
 * fetched. Prefer the identifier and fall back to the database id.
 */
export const issueResourceRef = (
  task?: Pick<TaskDetailData, 'id' | 'identifier'> | null,
): string | undefined => task?.identifier || task?.id || undefined;
