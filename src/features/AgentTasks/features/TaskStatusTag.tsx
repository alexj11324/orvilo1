import { type DropdownItem, DropdownMenu, Icon, type MenuInfo, Tooltip } from '@lobehub/ui';
import type { TaskStatus, TaskWorkflowCategory } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { Loader2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { StatusVisual } from '@/components/ExecutionStatus';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';

import {
  COLUMN_I18N_KEYS,
  taskStatusBoardColumnKey,
  type TaskStatusChoice,
  taskStatusChoices,
} from '../AgentTaskList/kanbanBoardModel';
import { renderMenuExtra } from './menuExtra';
import { STATUS_META } from './taskStatusMeta';
import { useTaskStatusChange } from './useTaskStatusChange';

export { STATUS_META, USER_SELECTABLE_STATUSES } from './taskStatusMeta';

const styles = createStaticStyles(({ css, cssVar }) => ({
  searchInput: css`
    width: 100%;
    padding-block: 4px;
    padding-inline: 10px;
    border: none;

    font-family: inherit;
    font-size: 13px;
    color: ${cssVar.colorText};

    background: transparent;
    outline: none;

    &::placeholder {
      color: ${cssVar.colorTextPlaceholder};
    }
  `,
  showingCaption: css`
    padding-block: 2px;
    padding-inline: 10px;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  trigger: css`
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    transition: filter ${cssVar.motionDurationMid};

    &:hover {
      filter: brightness(0.85);
    }
  `,
  triggerDisabled: css`
    cursor: not-allowed;
    display: inline-flex;
    opacity: 0.5;

    &:hover {
      filter: none;
    }
  `,
}));

interface TaskStatusTagProps {
  children?: ReactNode;
  disableDropdown?: boolean;
  /**
   * The mark the trigger draws in place of the execution-status glyph — a
   * task with a workflow state shows that state, Linear-style.
   */
  glyph?: StatusVisual & { label: ReactNode };
  /**
   * Picked a board column — receives the column plus the write a status-board
   * drop would commit. Callers on board surfaces route it through the board
   * move path; without it the tag applies the write itself.
   */
  onChange?: (choice: TaskStatusChoice) => void | Promise<void>;
  size?: number;
  status?: TaskStatus;
  taskIdentifier?: string;
  /** Workflow category — buckets a workflow-linked task's current column. */
  workflowCategory?: TaskWorkflowCategory | null;
  /** Linked workflow state — every board column becomes pickable when set. */
  workflowStateId?: string | null;
}

const TaskStatusTag = memo<TaskStatusTagProps>(
  ({
    children,
    disableDropdown,
    glyph,
    onChange,
    size = 16,
    status,
    taskIdentifier,
    workflowCategory,
    workflowStateId,
  }) => {
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const { t } = useTranslation('chat');
    const { allowed: canEditTask, reason } = usePermission('create_content');
    const changeTaskStatus = useTaskStatusChange();
    const updateTask = useTaskStore((s) => s.updateTask);

    const displayStatus = status ?? 'backlog';
    const meta = STATUS_META[displayStatus];
    // The Kanban board is the status source of truth: its columns are the
    // menu's options, order and glyphs, triage included. A column the board
    // could not take this task (an unlinked task can't reach the
    // workflow-only columns) renders disabled — the same reachability rule
    // `canDropTaskIntoKanbanColumn` enforces on drops.
    const choices = useMemo(() => taskStatusChoices({ workflowStateId }), [workflowStateId]);
    const currentColumnKey = useMemo(
      () =>
        taskStatusBoardColumnKey({
          status: displayStatus,
          workflowCategory,
          workflowStateId,
        }),
      [displayStatus, workflowCategory, workflowStateId],
    );

    // Linear's status menu carries a search field on top; letters filter the
    // list while digits keep working as accelerators (the document handler
    // captures them before they reach the input). Digits number the pickable
    // rows only — disabled entries have no accelerator.
    const choiceLabel = useCallback(
      (choice: TaskStatusChoice): string => t(COLUMN_I18N_KEYS[choice.column.key] as never),
      [t],
    );
    const filteredChoices = useMemo(() => {
      const needle = query.trim().toLowerCase();
      if (!needle) return choices;
      return choices.filter((choice) => choiceLabel(choice).toLowerCase().includes(needle));
    }, [choices, choiceLabel, query]);
    const pickableChoices = useMemo(
      () => filteredChoices.filter((choice) => choice.status || choice.workflowCategory),
      [filteredChoices],
    );

    useEffect(() => {
      if (!open) setQuery('');
    }, [open]);

    const handlePick = useCallback(
      async (choice: TaskStatusChoice) => {
        if (!canEditTask) return;
        if (!choice.status && !choice.workflowCategory) return;
        if (choice.column.key === currentColumnKey) return;
        if (onChange) {
          setLoading(true);
          try {
            await onChange(choice);
          } finally {
            setLoading(false);
          }
          return;
        }
        if (!taskIdentifier) return;
        setLoading(true);

        try {
          if (choice.workflowCategory) {
            await updateTask(taskIdentifier, { workflowCategory: choice.workflowCategory });
          } else if (choice.status) {
            await changeTaskStatus(taskIdentifier, choice.status);
          }
        } finally {
          setLoading(false);
        }
      },
      [canEditTask, changeTaskStatus, currentColumnKey, onChange, taskIdentifier, updateTask],
    );

    const handlePickRef = useRef(handlePick);
    handlePickRef.current = handlePick;
    const pickableChoicesRef = useRef(pickableChoices);
    pickableChoicesRef.current = pickableChoices;

    useEffect(() => {
      if (!open) return;
      const onKeyDown = (event: KeyboardEvent) => {
        const num = Number.parseInt(event.key, 10);
        if (Number.isNaN(num)) return;
        const pickable = pickableChoicesRef.current;
        const idx = num - 1;
        if (idx < 0 || idx >= pickable.length) return;
        event.preventDefault();
        event.stopPropagation();
        void handlePickRef.current(pickable[idx]);
        setOpen(false);
      };
      document.addEventListener('keydown', onKeyDown, true);
      return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [open]);

    const menuItems = useMemo<DropdownItem[]>(() => {
      let pickIndex = 0;
      return filteredChoices.map((choice) => {
        const pickable = Boolean(choice.status || choice.workflowCategory);
        const isCurrent = choice.column.key === currentColumnKey;
        const visual = WORKFLOW_CATEGORY_VISUALS[choice.column.targetWorkflowCategory ?? 'backlog'];
        if (pickable) pickIndex += 1;
        return {
          disabled: !pickable,
          extra: pickable ? renderMenuExtra(String(pickIndex), isCurrent) : undefined,
          icon: <Icon color={visual.color} icon={visual.icon} size={16} />,
          key: choice.column.key,
          label: choiceLabel(choice),
          onClick: ({ domEvent }: MenuInfo) => {
            domEvent.stopPropagation();
            void handlePick(choice);
          },
        };
      });
    }, [choiceLabel, currentColumnKey, filteredChoices, handlePick]);

    const triggerNode =
      children ||
      (loading ? (
        <Icon spin color={cssVar.colorTextDescription} icon={Loader2Icon} size={size} />
      ) : (
        <Tooltip
          title={glyph?.label ?? t(`taskDetail.${meta.labelKey}`, { defaultValue: meta.label })}
        >
          <span className={styles.trigger} onClick={(e) => e.stopPropagation()}>
            <Icon color={(glyph ?? meta).color} icon={(glyph ?? meta).icon} size={size} />
          </span>
        </Tooltip>
      ));

    if (disableDropdown) return <>{triggerNode}</>;

    if (!canEditTask)
      return (
        <Tooltip title={reason}>
          <span className={styles.triggerDisabled} onClick={(e) => e.stopPropagation()}>
            {triggerNode}
          </span>
        </Tooltip>
      );

    return (
      <DropdownMenu
        items={menuItems}
        open={open}
        header={
          <>
            <input
              autoFocus
              className={styles.searchInput}
              value={query}
              aria-label={t('taskDetail.changeStatusPlaceholder', {
                defaultValue: 'Change status…',
              })}
              placeholder={t('taskDetail.changeStatusPlaceholder', {
                defaultValue: 'Change status…',
              })}
              onChange={(event) => setQuery(event.target.value)}
              onClick={(event) => event.stopPropagation()}
            />
            <div className={styles.showingCaption}>
              {query.trim()
                ? t('taskDetail.showingItems', {
                    count: filteredChoices.length,
                    defaultValue: 'Showing {{count}} items',
                  })
                : t('taskDetail.showingAllItems', { defaultValue: 'Showing all items' })}
            </div>
          </>
        }
        onOpenChange={setOpen}
      >
        {triggerNode}
      </DropdownMenu>
    );
  },
);

export default TaskStatusTag;
