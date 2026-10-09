import type { TaskGroupMeta, TaskRow } from './listViewOptions';

/**
 * One rendered group of the list view: its header meta, the rows it owns and,
 * when a sub-grouping is active, the sub-groups those rows are split into.
 */
export interface TaskListGroupEntry {
  count: number;
  meta: TaskGroupMeta;
  rows: TaskRow[];
  subGroups: Array<{ count: number; meta: TaskGroupMeta; rows: TaskRow[] }>;
}

/**
 * The flat, virtualizable shape of the grouped list. Headers and rows become
 * siblings so a single windowed list can skip whatever is off-screen — the
 * nested Accordion markup rendered every row of every group at once, which is
 * what made a few hundred tasks heavy.
 */
export type TaskListVirtualItem =
  | {
      collapsed: boolean;
      count: number;
      /** First header in the list — the only one without a top gap. */
      first: boolean;
      key: string;
      kind: 'group';
      meta: TaskGroupMeta;
    }
  | {
      collapsed: boolean;
      count: number;
      first: boolean;
      groupKey: string;
      key: string;
      kind: 'subGroup';
      meta: TaskGroupMeta;
    }
  | {
      key: string;
      kind: 'row';
      row: TaskRow;
      /** A rule is drawn under the row only between two top-level tasks. */
      showDivider: boolean;
      sub: boolean;
    };

export const taskGroupCollapseKey = (groupKey: string) => `group:${groupKey}`;

export const taskSubGroupCollapseKey = (groupKey: string, subGroupKey: string) =>
  `sub:${groupKey}:${subGroupKey}`;

const rowItems = (rows: TaskRow[], scope: string, sub: boolean): TaskListVirtualItem[] =>
  rows.map((row, index) => ({
    key: `${scope}:${row.isParentContext ? 'context:' : ''}${row.task.identifier}`,
    kind: 'row',
    row,
    // A nested child belongs to the row above it, so no rule is drawn between
    // them — the divider only separates one top-level task from the next.
    showDivider: !sub && !!rows[index + 1] && rows[index + 1].depth === 0,
    sub,
  }));

/**
 * Flatten grouped entries into virtual items, dropping the rows (and
 * sub-group headers) of every collapsed group. `groupBy: 'none'` callers pass
 * a single entry and get rows only — there is no header to draw for it.
 */
export const flattenTaskListEntries = (
  entries: TaskListGroupEntry[],
  options: { collapsed: ReadonlySet<string>; grouped: boolean },
): TaskListVirtualItem[] => {
  const { collapsed, grouped } = options;

  if (!grouped) return entries.flatMap((entry) => rowItems(entry.rows, entry.meta.key, false));

  const items: TaskListVirtualItem[] = [];

  entries.forEach((entry, groupIndex) => {
    const groupKey = entry.meta.key;
    const groupCollapsed = collapsed.has(taskGroupCollapseKey(groupKey));
    items.push({
      collapsed: groupCollapsed,
      count: entry.count,
      first: groupIndex === 0,
      key: taskGroupCollapseKey(groupKey),
      kind: 'group',
      meta: entry.meta,
    });
    if (groupCollapsed) return;

    if (entry.subGroups.length === 0) {
      items.push(...rowItems(entry.rows, groupKey, false));
      return;
    }

    entry.subGroups.forEach((subGroup, subIndex) => {
      const key = taskSubGroupCollapseKey(groupKey, subGroup.meta.key);
      const subCollapsed = collapsed.has(key);
      items.push({
        collapsed: subCollapsed,
        count: subGroup.count,
        first: subIndex === 0,
        groupKey,
        key,
        kind: 'subGroup',
        meta: subGroup.meta,
      });
      if (!subCollapsed) items.push(...rowItems(subGroup.rows, key, true));
    });
  });

  return items;
};

/**
 * Issue identifiers of the rows the list renders, in order, with each row's
 * index in the virtual window — the walk order for keyboard navigation and the
 * scroll target when the next row is not mounted. Collapsed groups contribute
 * no rows; muted parent-context repeats are skipped.
 */
export const taskListRowIdentifiers = (
  items: readonly TaskListVirtualItem[],
): { ids: string[]; indexOf: Map<string, number> } => {
  const ids: string[] = [];
  const indexOf = new Map<string, number>();
  items.forEach((item, index) => {
    if (item.kind !== 'row' || item.row.isParentContext) return;
    const { identifier } = item.row.task;
    if (indexOf.has(identifier)) return;
    ids.push(identifier);
    indexOf.set(identifier, index);
  });
  return { ids, indexOf };
};
