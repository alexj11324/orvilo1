'use client';

import { type TaskWorkflowCategory } from '@orvilo/types';
import { cn } from 'cn';
import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import { createElement, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GroupedVirtuoso, type GroupProps, Virtuoso } from 'react-virtuoso';

import AsyncError from '@/components/AsyncError';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { COLUMN_I18N_KEYS } from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import { COLUMN_STATUS_VISUAL } from '@/features/AgentTasks/AgentTaskList/KanbanColumn';
import { useClosestScrollParent } from '@/features/AgentTasks/AgentTaskList/useClosestScrollParent';

import type { WorkQueryGroupPage, WorkQueryResultTask } from './workQueryPaging';
import {
  flattenWorkQueryFlatItems,
  flattenWorkQueryVirtualItems,
  nestWorkQueryListGroups,
  stickyVirtualSections,
  type WorkQueryVirtualItem,
} from './workQueryVirtualListModel';

const DEFAULT_ROW_HEIGHT = 44;

const StickyGroup = ({ children, style, ...rest }: GroupProps) => (
  <div {...rest} className="z-2 bg-background" style={style}>
    {children}
  </div>
);

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
  primaryAxis,
  rankOf,
  renderRow,
  tasks,
}: WorkQueryVirtualListProps) => {
  const { t } = useTranslation(['common', 'chat']);
  const { ref: anchorRef, scrollParent, unresolved } = useClosestScrollParent();
  const [sessionCollapsed, setSessionCollapsed] = useState<readonly string[]>([]);
  const collapsedKeys = collapsedGroups ?? sessionCollapsed;
  const collapsed = useMemo(() => new Set(collapsedKeys), [collapsedKeys]);
  const taskById = useMemo(() => {
    const map = new Map<string, WorkQueryResultTask>();
    for (const task of allTasks) map.set(task.id, task);
    for (const task of tasks) map.set(task.id, task);
    return map;
  }, [allTasks, tasks]);

  const toggleCollapsed = (key: string) => {
    const next = collapsed.has(key)
      ? collapsedKeys.filter((item) => item !== key)
      : [...collapsedKeys, key];
    if (onCollapsedGroupsChange) onCollapsedGroupsChange([...next]);
    else setSessionCollapsed(next);
  };

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
        <GroupedVirtuoso
          components={{ Group: StickyGroup }}
          computeItemKey={(_index, item) => item.key}
          customScrollParent={scrollParent}
          data={sections.items}
          defaultItemHeight={DEFAULT_ROW_HEIGHT}
          groupContent={(index) => sections.headers[index]?.map((header) => renderHeader(header))}
          groupCounts={sections.groupCounts}
          increaseViewportBy={{ bottom: 600, top: 600 }}
          itemContent={(_index, _groupIndex, item) => renderItem(item)}
        />
      ) : scrollParent ? (
        <Virtuoso
          computeItemKey={(_index, item) => item.key}
          customScrollParent={scrollParent}
          data={items}
          defaultItemHeight={DEFAULT_ROW_HEIGHT}
          increaseViewportBy={{ bottom: 600, top: 600 }}
          itemContent={(_index, item) => renderItem(item)}
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
