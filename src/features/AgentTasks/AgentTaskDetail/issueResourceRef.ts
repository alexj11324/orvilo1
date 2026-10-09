import type { TaskDetailData } from '@orvilo/types';

/** `TaskModel.resolve` treats only strings with this prefix as database ids. */
const RESOLVABLE_ID_PREFIX = 'task_';

/**
 * The id an Issue's attached links/PRs are read and written under.
 *
 * `taskMenu.links` / `addLink` / `removeLink` go through `TaskModel.resolve`,
 * which treats only `task_`-prefixed strings as database ids and uppercases
 * everything else into an identifier lookup.
 *
 * The database id is the only unambiguous address: identifiers can be shared
 * by a filed and an unfiled row (`findByIdentifier` picks one), so a write
 * addressed by identifier could land on a different Issue than the one on
 * screen. Use the id whenever the server can resolve it. Fall back to the
 * public identifier only for rows whose id has another shape (imported or
 * seeded fixtures such as `taskparitymine0002`), which the server would
 * otherwise answer with "Task not found".
 */
export const issueResourceRef = (
  task?: Pick<TaskDetailData, 'id' | 'identifier'> | null,
): string | undefined => {
  if (task?.id?.startsWith(RESOLVABLE_ID_PREFIX)) return task.id;
  return task?.identifier || task?.id || undefined;
};
