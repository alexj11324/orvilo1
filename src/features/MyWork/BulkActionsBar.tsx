'use client';
import type { TaskWorkflowCategory } from '@orvilo/types';
import { cn } from 'cn';
import { BarChart3Icon, Trash2Icon, UserRoundIcon, XIcon } from 'lucide-react';
import { createElement, memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { STATUS_PROPERTY_ICON, WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { getPriorityIconColor, PRIORITY_LEVELS } from '@/components/PriorityIcon';
import { Button } from '@/components/ui/button';
import {
  COLUMN_I18N_KEYS,
  issueStatusChoices,
} from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import { useAssigneeMenuItems } from '@/features/AgentTasks/features/assigneeMenuItems';
import { PRIORITY_META } from '@/features/AgentTasks/features/TaskPriorityTag';
import DropdownMenu, {
  type SidebarMenuInfo,
  type SidebarMenuItemData,
} from '@/features/NavPanel/components/SidebarDropdownMenu';

interface BulkActionsBarProps {
  /**
   * Assignee every selected task shares — drives the picker's current-mark.
   * A sentinel (e.g. `__bulk_mixed__`) marks a mixed selection so Unassigned
   * stays clickable; `undefined` when the set is uniformly unassigned.
   */
  assigneeCurrentId?: string | null;
  /** Mutations in flight — actions disable until the pass settles. */
  busy?: boolean;
  count: number;
  /** `null` unassigns. */
  onAssignee: (userId: string | null) => void;
  onClear: () => void;
  onDelete: () => void;
  onSetPriority: (priority: number) => void;
  onSetStatus: (category: TaskWorkflowCategory) => void;
}

/**
 * Floating bulk bar for a multi-selected issue list — Linear's compact shape:
 * a count, one "Actions" menu carrying every mutation, and a clear `X`. The
 * menu nests Status / Priority / Assignee as submenus above a danger Delete.
 * Linear's extra "Ask Linear" entry has no Orvilo counterpart and stays out.
 * No labels action: the task model has none.
 */
const BulkActionsBar = memo<BulkActionsBarProps>(
  ({
    assigneeCurrentId,
    busy,
    count,
    onAssignee,
    onClear,
    onDelete,
    onSetPriority,
    onSetStatus,
  }) => {
    const { t } = useTranslation(['common', 'chat']);

    const handleAssigneeSelect = useCallback(
      (userId: string | null) => onAssignee(userId),
      [onAssignee],
    );
    const assigneeItems = useAssigneeMenuItems(assigneeCurrentId, handleAssigneeSelect, {
      disabled: busy,
    });

    // The Issue board's columns — workflow categories only; execution
    // statuses are never a user pick.
    const statusItems = useMemo<SidebarMenuItemData[]>(
      () =>
        issueStatusChoices().map((choice) => {
          const category = choice.workflowCategory ?? 'backlog';
          const visual = WORKFLOW_CATEGORY_VISUALS[category];
          return {
            icon: createElement(visual.icon, { className: 'size-4 shrink-0', color: visual.color }),
            key: category,
            label: t(COLUMN_I18N_KEYS[choice.column.key] as never),
            onClick: ({ domEvent }: SidebarMenuInfo) => {
              domEvent.stopPropagation();
              onSetStatus(category);
            },
          };
        }),
      [onSetStatus, t],
    );

    const priorityItems = useMemo<SidebarMenuItemData[]>(
      () =>
        PRIORITY_LEVELS.map((level) => {
          const meta = PRIORITY_META[level];
          const PriorityIcon = meta.icon;
          return {
            icon: <PriorityIcon color={getPriorityIconColor(level)} size={16} />,
            key: String(level),
            label: t(`chat:taskDetail.${meta.labelKey}` as never, {
              defaultValue: meta.label,
            }),
            onClick: ({ domEvent }: SidebarMenuInfo) => {
              domEvent.stopPropagation();
              onSetPriority(level);
            },
          };
        }),
      [onSetPriority, t],
    );

    const actionItems = useMemo<SidebarMenuItemData[]>(
      () => [
        {
          children: statusItems,
          disabled: busy,
          icon: STATUS_PROPERTY_ICON,
          key: 'status',
          label: t('myWork.bulk.status'),
          type: 'submenu',
        },
        {
          children: priorityItems,
          disabled: busy,
          icon: BarChart3Icon,
          key: 'priority',
          label: t('myWork.bulk.priority'),
          type: 'submenu',
        },
        {
          children: assigneeItems,
          disabled: busy,
          icon: UserRoundIcon,
          key: 'assignee',
          label: t('myWork.bulk.assignee'),
          type: 'submenu',
        },
        { type: 'divider' },
        {
          danger: true,
          disabled: busy,
          icon: Trash2Icon,
          key: 'delete',
          label: t('delete'),
          onClick: ({ domEvent }: SidebarMenuInfo) => {
            domEvent.stopPropagation();
            onDelete();
          },
        },
      ],
      [assigneeItems, busy, onDelete, priorityItems, statusItems, t],
    );

    return (
      // `data-bulk-actions` keeps the click-away handler from clearing the
      // selection when the pointer lands on the bar's own chrome; the
      // `data-row-interactive` marker does the same for row-level guards.
      <div
        data-bulk-actions
        data-row-interactive
        className="sticky z-5 inset-be-4 flex w-fit items-center gap-1.5 mbs-2 mx-auto py-1.5 px-3 border border-solid border-divider rounded-(--radius-overlay) bg-popover shadow-(--shadow-popover)"
      >
        <span className={cn('text-sm font-medium', 'flex-none pe-1 whitespace-nowrap')}>
          {t('myWork.bulk.selected', { count })}
        </span>
        <DropdownMenu items={actionItems} placement={'top'}>
          <Button disabled={busy} variant="outline">
            {t('myWork.bulk.actions')}
          </Button>
        </DropdownMenu>
        <div className="flex flex-col flex-none">
          <Button
            aria-label={t('myWork.bulk.clear')}
            size="icon"
            title={t('myWork.bulk.clear')}
            variant="ghost"
            onClick={onClear}
          >
            {createElement(XIcon, { className: 'size-4 shrink-0' })}
          </Button>
        </div>
      </div>
    );
  },
);

BulkActionsBar.displayName = 'BulkActionsBar';

export default BulkActionsBar;
