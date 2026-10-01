import { WORK_QUERY_BOARD_KEY_SEP } from '@orvilo/types';

import { workQueryHierarchyRows } from './workQueryHierarchy';
import type { WorkQueryResultTask } from './workQueryPaging';

export interface NestedWorkQueryGroup<T> {
  children: NestedWorkQueryGroup<T>[];
  hasMore: boolean;
  key: string;
  tasks: T[];
  total: number;
}

export interface WorkQueryGroupInput<T> {
  hasMore?: boolean;
  key: string;
  tasks: readonly T[];
  total?: number;
}

/**
 * Split composite `column + separator + lane` keys into a tree. A bare key
 * is a primary group with no children. Parent totals are the sum of the
 * child totals the server already counted.
 */
export const nestWorkQueryListGroups = <T>(
  groups: readonly WorkQueryGroupInput<T>[],
  lane: boolean,
): NestedWorkQueryGroup<T>[] => {
  const visible = groups.filter(
    (group) => (group.total ?? group.tasks.length) > 0 || group.tasks.length > 0,
  );
  if (!lane) {
    return visible.map((group) => ({
      children: [],
      hasMore: Boolean(group.hasMore),
      key: group.key,
      tasks: [...group.tasks],
      total: group.total ?? group.tasks.length,
    }));
  }

  const parents = new Map<string, NestedWorkQueryGroup<T>>();
  const order: string[] = [];
  const ensure = (key: string): NestedWorkQueryGroup<T> => {
    const existing = parents.get(key);
    if (existing) return existing;
    const created: NestedWorkQueryGroup<T> = {
      children: [],
      hasMore: false,
      key,
      tasks: [],
      total: 0,
    };
    parents.set(key, created);
    order.push(key);
    return created;
  };

  for (const group of visible) {
    const separator = group.key.indexOf(WORK_QUERY_BOARD_KEY_SEP);
    if (separator <= 0) {
      const parent = ensure(group.key);
      parent.tasks = [...group.tasks];
      parent.total = group.total ?? group.tasks.length;
      parent.hasMore = Boolean(group.hasMore);
      continue;
    }
    const column = group.key.slice(0, separator);
    const laneKey = group.key.slice(separator + WORK_QUERY_BOARD_KEY_SEP.length);
    const parent = ensure(column);
    const child: NestedWorkQueryGroup<T> = {
      children: [],
      hasMore: Boolean(group.hasMore),
      key: laneKey,
      tasks: [...group.tasks],
      total: group.total ?? group.tasks.length,
    };
    parent.children.push(child);
    parent.tasks = [...parent.tasks, ...child.tasks];
    parent.total += child.total;
  }

  return order
    .map((key) => parents.get(key)!)
    .filter((parent) => parent.total > 0 || parent.tasks.length > 0);
};

export type WorkQueryVirtualKind = 'header' | 'loadMore' | 'row';

export interface WorkQueryVirtualItem {
  axis: string;
  collapsed?: boolean;
  collapseKey: string;
  cursorKey: string;
  depth: 0 | 1;
  key: string;
  kind: WorkQueryVirtualKind;
  labelKey: string;
  parentContext?: boolean;
  rowDepth?: number;
  taskId?: string;
  total?: number;
}

const rowItems = (
  tasks: readonly WorkQueryResultTask[],
  allTasks: readonly WorkQueryResultTask[],
  nest: boolean,
  collapseKey: string,
): WorkQueryVirtualItem[] => {
  const rows = nest
    ? workQueryHierarchyRows([...tasks], [...allTasks])
    : tasks.map((task) => ({ depth: 0, isParentContext: false, task }));
  return rows.map((row) => ({
    axis: '',
    collapseKey,
    cursorKey: collapseKey,
    depth: 0,
    key: `${collapseKey}:${row.isParentContext ? 'context' : 'row'}:${row.task.id}`,
    kind: 'row',
    labelKey: '',
    parentContext: row.isParentContext,
    rowDepth: row.depth,
    taskId: row.task.id,
  }));
};

/**
 * Window items for one list. Collapsed groups drop their rows, children and
 * load-more controls. `orderedIds` is the shift-range order — parent-context
 * rows stay visible but are not range targets.
 */
const compareGroupKeys = (
  left: string,
  right: string,
  rank?: (key: string) => number,
  title?: (key: string) => string,
) => {
  if (left === 'none' && right !== 'none') return 1;
  if (right === 'none' && left !== 'none') return -1;
  const byRank = (rank?.(left) ?? 0) - (rank?.(right) ?? 0);
  if (byRank !== 0) return byRank;
  if (title) return title(left).localeCompare(title(right));
  return 0;
};

const orderedGroups = <T>(
  groups: readonly NestedWorkQueryGroup<T>[],
  rank?: (key: string) => number,
  title?: (key: string) => string,
): readonly NestedWorkQueryGroup<T>[] => {
  if (!rank && !title) return groups;
  return [...groups].sort((left, right) => compareGroupKeys(left.key, right.key, rank, title));
};

export const flattenWorkQueryVirtualItems = (input: {
  allTasks: readonly WorkQueryResultTask[];
  collapsed: ReadonlySet<string>;
  groups: readonly NestedWorkQueryGroup<WorkQueryResultTask>[];
  laneAxis?: string;
  laneRankOf?: (key: string) => number;
  laneTitleOf?: (key: string) => string;
  nestRows: boolean;
  primaryAxis: string;
  rankOf?: (key: string) => number;
  titleOf?: (key: string) => string;
}): { items: WorkQueryVirtualItem[]; orderedIds: string[] } => {
  const groups = orderedGroups(input.groups, input.rankOf, input.titleOf);
  const items: WorkQueryVirtualItem[] = [];
  const orderedIds: string[] = [];
  const pushRows = (tasks: readonly WorkQueryResultTask[], collapseKey: string, nest: boolean) => {
    for (const item of rowItems(tasks, input.allTasks, nest, collapseKey)) {
      items.push(item);
      if (item.taskId && !item.parentContext) orderedIds.push(item.taskId);
    }
  };

  for (const group of groups) {
    const collapsed = input.collapsed.has(group.key);
    items.push({
      axis: input.primaryAxis,
      collapseKey: group.key,
      collapsed,
      cursorKey: group.key,
      depth: 0,
      key: `header:${group.key}`,
      kind: 'header',
      labelKey: group.key,
      total: group.total,
    });
    if (collapsed) continue;
    if (group.children.length > 0) {
      const children = orderedGroups(group.children, input.laneRankOf, input.laneTitleOf);
      for (const child of children) {
        const collapseKey = `${group.key}${WORK_QUERY_BOARD_KEY_SEP}${child.key}`;
        const childCollapsed = input.collapsed.has(collapseKey);
        items.push({
          axis: input.laneAxis ?? input.primaryAxis,
          collapseKey,
          collapsed: childCollapsed,
          cursorKey: collapseKey,
          depth: 1,
          key: `header:${collapseKey}`,
          kind: 'header',
          labelKey: child.key,
          total: child.total,
        });
        if (childCollapsed) continue;
        pushRows(child.tasks, collapseKey, input.nestRows);
        if (child.hasMore) {
          items.push({
            axis: input.laneAxis ?? input.primaryAxis,
            collapseKey,
            cursorKey: collapseKey,
            depth: 1,
            key: `more:${collapseKey}`,
            kind: 'loadMore',
            labelKey: child.key,
          });
        }
      }
      continue;
    }
    pushRows(group.tasks, group.key, input.nestRows);
    if (group.hasMore) {
      items.push({
        axis: input.primaryAxis,
        collapseKey: group.key,
        cursorKey: group.key,
        depth: 0,
        key: `more:${group.key}`,
        kind: 'loadMore',
        labelKey: group.key,
      });
    }
  }

  return { items, orderedIds };
};

export interface WorkQueryStickySections {
  groupCounts: number[];
  /** Header stack for each sticky group. A lane includes its parent header. */
  headers: WorkQueryVirtualItem[][];
  items: WorkQueryVirtualItem[];
}

/**
 * Split a flat window into virtuoso groups so each header sticks. A primary
 * header that is immediately followed by lane headers is not its own group —
 * it stays in the lane's sticky stack.
 */
export const stickyVirtualSections = (
  items: readonly WorkQueryVirtualItem[],
): WorkQueryStickySections | undefined => {
  if (!items.some((item) => item.kind === 'header')) return undefined;
  const groupCounts: number[] = [];
  const headers: WorkQueryVirtualItem[][] = [];
  const body: WorkQueryVirtualItem[] = [];
  let parent: WorkQueryVirtualItem | undefined;
  let open = false;
  let count = 0;

  const close = () => {
    if (!open) return;
    groupCounts.push(count);
    open = false;
    count = 0;
  };
  const openGroup = (stack: WorkQueryVirtualItem[]) => {
    close();
    headers.push(stack);
    open = true;
  };

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.kind === 'header' && item.depth === 0) {
      parent = item;
      const next = items[index + 1];
      if (!(next?.kind === 'header' && next.depth === 1)) openGroup([item]);
      continue;
    }
    if (item.kind === 'header' && item.depth === 1) {
      openGroup(parent ? [parent, item] : [item]);
      continue;
    }
    if (!open) openGroup(parent ? [parent] : []);
    body.push(item);
    count += 1;
  }
  close();
  return { groupCounts, headers, items: body };
};

/** Flat `none` lists: rows only, no group headers. */
export const flattenWorkQueryFlatItems = (
  tasks: readonly WorkQueryResultTask[],
  nest: boolean,
): { items: WorkQueryVirtualItem[]; orderedIds: string[] } => {
  const items = rowItems(tasks, tasks, nest, 'flat');
  return {
    items,
    orderedIds: items.flatMap((item) => (item.taskId && !item.parentContext ? [item.taskId] : [])),
  };
};
