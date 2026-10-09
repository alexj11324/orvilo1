'use client';

import { type TaskWorkflowCategory } from '@orvilo/types';
import { cn } from 'cn';
import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import {
  createElement,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  GroupedVirtuoso,
  type GroupedVirtuosoHandle,
  type GroupProps,
  Virtuoso,
  type VirtuosoHandle,
} from 'react-virtuoso';

import AsyncError from '@/components/AsyncError';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { COLUMN_I18N_KEYS } from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import { COLUMN_STATUS_VISUAL } from '@/features/AgentTasks/AgentTaskList/KanbanColumn';
import { useClosestScrollParent } from '@/features/AgentTasks/AgentTaskList/useClosestScrollParent';
import {
  requestIssueGroupHeaderFocus,
  restoreIssueGroupHeaderFocus,
} from '@/features/WorkSurface/issuePeekKeyContext';
import { useIssuePeekKeyboard } from '@/features/WorkSurface/useIssuePeekKeyboard';

import type { WorkQueryGroupPage, WorkQueryResultTask } from './workQueryPaging';
import {
  flattenWorkQueryFlatItems,
  flattenWorkQueryVirtualItems,
  groupHidesIssue,
  indexWorkQueryVirtualTasks,
  nestWorkQueryListGroups,
  stickyFlatKeys,
  stickyVirtualSections,
  type WorkQueryVirtualItem,
  workQueryVirtualPeekRows,
} from './workQueryVirtualListModel';

const DEFAULT_ROW_HEIGHT = 44;

const noopPeek = () => {};

const StickyGroup = ({ children, style, ...rest }: GroupProps) => (
  <div {...rest} className="z-2 bg-background" style={style}>
    {children}
  </div>
);

export interface WorkQueryPeekKeys {
  /** Full page for an Issue identifier. Absent: Enter keeps the row's own navigation. */
  onOpen?: (identifier: string) => void;
  /** Open / follow (`identifier`) or close (`null`) the peek. */
  onPeek: (identifier: string | null) => void;
  /** Issue shown in the peek pane right now, or `null`. */
  peekId: string | null;
}

export interface WorkQueryVirtualListProps {
  allTasks: readonly WorkQueryResultTask[];
  collapsedGroups?: readonly string[];
  createLabel?: string;
  groupIcon?: (axis: string, key: string) => ReactNode;
  groups?: readonly WorkQueryGroupPage<WorkQueryResultTask>[];
  groupTitle?: (axis: string, key: string) => string | undefined;
  laneAxis?: string;
  laneRankOf?: (key: string) => number;
  listGroupBy: string;
  loadMoreGroupErrors?: Record<string, unknown>;
  loadMoreLabel?: string;
  nestRows: boolean;
  onCollapsedGroupsChange?: (keys: string[]) => void;
  onCreateInGroup?: (groupKey: string) => void;
  onLoadMoreGroup?: (groupKey: string) => void;
  onRetryLoadMoreGroup?: (groupKey: string) => void;
  /**
   * Linear's keyboard peek (Space / J / K / Enter / Esc). Present only when the
   * host has a peek pane; this list owns the visible order and the virtualizer,
   * so it binds the keys.
   */
  peekKeys?: WorkQueryPeekKeys;
  primaryAxis: string;
  rankOf?: (key: string) => number;
  renderRow: (
    task: WorkQueryResultTask,
    item: WorkQueryVirtualItem,
    orderedIds: readonly string[],
  ) => ReactNode;
  tasks: readonly WorkQueryResultTask[];
}

const headerVisual = (axis: string, key: string) => {
  if (axis === 'workflowCategory') {
    return WORKFLOW_CATEGORY_VISUALS[key as TaskWorkflowCategory] ?? COLUMN_STATUS_VISUAL[key];
  }
  if (axis === 'status' || axis === 'attention') {
    return COLUMN_STATUS_VISUAL[`st:${key}`] ?? COLUMN_STATUS_VISUAL[key];
  }
  return undefined;
};

const WorkQueryVirtualList = ({
  allTasks,
  collapsedGroups,
  createLabel,
  groupIcon,
  groupTitle,
  groups,
  laneAxis,
  laneRankOf,
  listGroupBy,
  loadMoreGroupErrors,
  loadMoreLabel,
  nestRows,
  onCollapsedGroupsChange,
  onCreateInGroup,
  onLoadMoreGroup,
  onRetryLoadMoreGroup,
  peekKeys,
  primaryAxis,
  rankOf,
  renderRow,
  tasks,
}: WorkQueryVirtualListProps) => {
  const { t } = useTranslation(['common', 'chat']);
  const { node: anchorNode, ref: anchorRef, scrollParent, unresolved } = useClosestScrollParent();
  const [sessionCollapsed, setSessionCollapsed] = useState<readonly string[]>([]);
  const collapsedKeys = collapsedGroups ?? sessionCollapsed;
  const collapsed = useMemo(() => new Set(collapsedKeys), [collapsedKeys]);
  const taskById = useMemo(
    () =>
      indexWorkQueryVirtualTasks([allTasks, tasks, ...(groups ?? []).map((group) => group.tasks)]),
    [allTasks, groups, tasks],
  );

  const { items, orderedIds } = useMemo(() => {
    if (listGroupBy === 'none') return flattenWorkQueryFlatItems(tasks, nestRows);
    const nested = nestWorkQueryListGroups(groups ?? [], Boolean(laneAxis));
    const nameTitle = (axis: string) =>
      axis === 'agent' || axis === 'assignee' || axis === 'milestone' || axis === 'project'
        ? (key: string) => groupTitle?.(axis, key) ?? key
        : undefined;
    return flattenWorkQueryVirtualItems({
      allTasks,
      collapsed,
      groups: nested,
      laneAxis,
      laneRankOf,
      laneTitleOf: laneAxis ? nameTitle(laneAxis) : undefined,
      nestRows,
      primaryAxis,
      rankOf,
      titleOf: nameTitle(primaryAxis),
    });
  }, [
    allTasks,
    collapsed,
    groupTitle,
    groups,
    laneAxis,
    laneRankOf,
    listGroupBy,
    nestRows,
    primaryAxis,
    rankOf,
    tasks,
  ]);
  const sections = useMemo(
    () => (listGroupBy === 'none' ? undefined : stickyVirtualSections(items)),
    [items, listGroupBy],
  );

  const windowItems = sections ? sections.items : items;
  const flatKeys = useMemo(() => (sections ? stickyFlatKeys(sections) : []), [sections]);

  const toggleCollapsed = (key: string) => {
    const collapsing = !collapsed.has(key);
    const next = collapsing
      ? [...collapsedKeys, key]
      : collapsedKeys.filter((item) => item !== key);
    // The peek must never stay open on a row this collapse just hid.
    if (collapsing && peekKeys && groupHidesIssue(windowItems, taskById, key, peekKeys.peekId)) {
      const owner = anchorNode?.closest<HTMLElement>('[data-work-surface]');
      if (owner) requestIssueGroupHeaderFocus(owner, key);
      peekKeys.onPeek(null);
    }
    if (onCollapsedGroupsChange) onCollapsedGroupsChange([...next]);
    else setSessionCollapsed(next);
  };

  // Runs after every render: the header only exists once the (re-mounted)
  // virtualizer has laid out, which can be a render or two after the toggle.
  useEffect(() => {
    if (!anchorNode) return;
    const restore = () => restoreIssueGroupHeaderFocus(anchorNode);
    restore();
    // Virtualizer children can mount the header without re-rendering this list.
    const observer = new MutationObserver(restore);
    observer.observe(anchorNode, { childList: true, subtree: true });
    return () => observer.disconnect();
  });

  const virtuosoRef = useRef<GroupedVirtuosoHandle | VirtuosoHandle>(null);
  const peekRows = useMemo(
    () => workQueryVirtualPeekRows(windowItems, taskById),
    [windowItems, taskById],
  );
  const revealRow = useCallback(
    (rowKey: string) => {
      const index = peekRows.indexOf.get(rowKey);
      if (index !== undefined) virtuosoRef.current?.scrollToIndex({ align: 'center', index });
    },
    [peekRows],
  );
  useIssuePeekKeyboard({
    scopeRoot: anchorNode?.closest<HTMLElement>('[data-work-surface]') ?? null,
    enabled: Boolean(peekKeys),
    idOf: (rowKey) => peekRows.idOf.get(rowKey) ?? rowKey,
    ids: peekRows.ids,
    onOpenPage: peekKeys?.onOpen,
    onPeek: peekKeys?.onPeek ?? noopPeek,
    peekId: peekKeys?.peekId ?? null,
    reveal: revealRow,
  });

  const labelFor = (item: WorkQueryVirtualItem) => {
    const titled = groupTitle?.(item.axis, item.labelKey);
    if (titled) return titled;
    if (item.axis === 'priority' || item.axis === 'assignee') {
      return t(`savedViews.values.${item.axis}.${item.labelKey}` as never, {
        defaultValue: item.labelKey,
      });
    }
    const labelKey =
      item.axis === 'workflowCategory'
        ? COLUMN_I18N_KEYS[item.labelKey]
        : (COLUMN_I18N_KEYS[`st:${item.labelKey}`] ?? COLUMN_I18N_KEYS[item.labelKey]);
    return labelKey ? t(`chat:${labelKey}` as never) : item.labelKey;
  };

  const renderHeader = (item: WorkQueryVirtualItem) => {
    const icon = groupIcon?.(item.axis, item.labelKey);
    const visual = icon ? undefined : headerVisual(item.axis, item.labelKey);
    const attention =
      item.axis === 'priority' ||
      item.axis === 'assignee' ||
      item.axis === 'project' ||
      item.axis === 'cycle' ||
      item.axis === 'activityDate' ||
      (item.axis === 'attention' && (item.labelKey === 'urgent' || item.labelKey === 'blocking'));
    return (
      <div
        key={item.key}
        className={cn(
          'group/work-group flex items-center gap-1 bg-background pe-1',
          item.depth === 1 && 'ps-4',
        )}
      >
        <Button
          aria-expanded={!item.collapsed}
          className="min-w-0 flex-1 justify-start"
          data-work-group-header={item.collapseKey}
          variant="ghost"
          onClick={() => toggleCollapsed(item.collapseKey)}
        >
          <ChevronDownIcon
            className={cn(
              'shrink-0 text-muted-foreground transition-transform',
              item.collapsed && '-rotate-90',
            )}
          />
          {visual && !attention && !icon
            ? createElement(visual.icon, { className: 'size-4 shrink-0', color: visual.color })
            : null}
          {icon}
          <span className="truncate">{labelFor(item)}</span>
          <span className="text-muted-foreground">{item.total ?? 0}</span>
        </Button>
        {item.depth === 0 && onCreateInGroup ? (
          <span className="work-query-group-actions shrink-0 opacity-0 transition-opacity group-hover/work-group:opacity-100 group-focus-within/work-group:opacity-100 [@media(hover:none)]:opacity-100">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={createLabel ?? t('chat:taskList.kanban.addTask')}
                    size="icon"
                    variant="ghost"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCreateInGroup(item.labelKey);
                    }}
                  />
                }
              >
                <PlusIcon />
              </TooltipTrigger>
              <TooltipContent>{createLabel ?? t('chat:taskList.kanban.addTask')}</TooltipContent>
            </Tooltip>
          </span>
        ) : null}
      </div>
    );
  };

  const renderItem = (item: WorkQueryVirtualItem) => {
    if (item.kind === 'header') return renderHeader(item);
    if (item.kind === 'loadMore') {
      const error = loadMoreGroupErrors?.[item.cursorKey];
      if (error) {
        return (
          <AsyncError
            error={error}
            variant={'inline'}
            onRetry={onRetryLoadMoreGroup ? () => onRetryLoadMoreGroup(item.cursorKey) : undefined}
          />
        );
      }
      if (!onLoadMoreGroup || !loadMoreLabel) return null;
      return (
        <div className="flex justify-center py-1">
          <Button variant="outline" onClick={() => onLoadMoreGroup(item.cursorKey)}>
            {loadMoreLabel}
          </Button>
        </div>
      );
    }
    const task = item.taskId ? taskById.get(item.taskId) : undefined;
    if (!task) return null;
    return <>{renderRow(task, item, orderedIds)}</>;
  };

  return (
    <div ref={anchorRef}>
      {scrollParent && sections ? (
        // No `data` prop: see `stickyFlatKeys`. Rows come from `sections.items`
        // by item index, keys by flat slot index.
        <GroupedVirtuoso
          components={{ Group: StickyGroup }}
          computeItemKey={(index) => flatKeys[index] ?? index}
          customScrollParent={scrollParent}
          defaultItemHeight={DEFAULT_ROW_HEIGHT}
          groupContent={(index) => sections.headers[index]?.map((header) => renderHeader(header))}
          groupCounts={sections.groupCounts}
          increaseViewportBy={{ bottom: 600, top: 600 }}
          ref={virtuosoRef as Ref<GroupedVirtuosoHandle>}
          itemContent={(index) => {
            const item = sections.items[index];
            return item ? renderItem(item) : null;
          }}
        />
      ) : scrollParent ? (
        <Virtuoso
          computeItemKey={(_index, item) => item.key}
          customScrollParent={scrollParent}
          data={items}
          defaultItemHeight={DEFAULT_ROW_HEIGHT}
          increaseViewportBy={{ bottom: 600, top: 600 }}
          itemContent={(_index, item) => renderItem(item)}
          ref={virtuosoRef as Ref<VirtuosoHandle>}
        />
      ) : unresolved ? null : (
        <div className="flex flex-col">
          {items.map((item) => (
            <div key={item.key}>{renderItem(item)}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkQueryVirtualList;
