import type { TaskStatus, TaskWorkflowCategory } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { Loader2Icon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { StatusVisual } from '@/components/ExecutionStatus';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermission } from '@/hooks/usePermission';

import {
  COLUMN_I18N_KEYS,
  issueWorkflowStateChoices,
  taskStatusBoardColumnKey,
  type TaskStatusChoice,
  taskStatusChoiceIsCurrent,
  taskStatusChoices,
} from '../AgentTaskList/kanbanBoardModel';
import { renderMenuExtra } from './menuExtra';
import { SimpleTooltip } from './SimpleTooltip';
import { STATUS_META } from './taskStatusMeta';
import { useIssueStatusMove } from './useIssueStatusMove';
import { useMenuDigitShortcuts } from './useMenuDigitShortcuts';
import { useTaskStatusChange } from './useTaskStatusChange';
import { useTeamWorkflowStates } from './useTeamWorkflowStates';

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
  /** Owning team — enables the precise-state menu when the task is linked. */
  teamId?: string | null;
  /** Workflow category — buckets a workflow-linked task's current column. */
  workflowCategory?: TaskWorkflowCategory | null;
  /** Linked workflow state — every board column becomes pickable when set. */
  workflowStateId?: string | null;
  /** Internal `team_workflow_states` row — resolves the current precise state. */
  workflowStateRefId?: string | null;
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
    teamId,
    workflowCategory,
    workflowStateId,
    workflowStateRefId,
  }) => {
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const { t } = useTranslation('chat');
    const { allowed: canEditTask, reason } = usePermission('create_content');
    const changeTaskStatus = useTaskStatusChange();
    const moveWorkflow = useIssueStatusMove();
    // The Issue status menu: the team's own workflow states once the task is
    // linked, so two custom states in one category stay individually
    // pickable. Until the catalog lands (or for unlinked tasks) the board's
    // category columns carry the same write command.
    const teamStates = useTeamWorkflowStates(workflowStateId != null ? teamId : null);

    const displayStatus = status ?? 'backlog';
    const meta = STATUS_META[displayStatus];
    // The Kanban board is the status source of truth: its columns are the
    // menu's options, order and glyphs, triage included. A column the board
    // could not take this task (an unlinked task can't reach the
    // workflow-only columns) renders disabled — the same reachability rule
    // `canDropTaskIntoKanbanColumn` enforces on drops.
    const choices = useMemo(
      () =>
        teamStates != null && teamStates.length > 0
          ? issueWorkflowStateChoices(teamStates)
          : taskStatusChoices({ workflowStateId }),
      [teamStates, workflowStateId],
    );
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
      (choice: TaskStatusChoice): string =>
        choice.state?.name ?? t(COLUMN_I18N_KEYS[choice.column.key] as never),
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
        if (
          taskStatusChoiceIsCurrent(
            { workflowStateId, workflowStateRefId },
            choice,
            currentColumnKey,
          )
        )
          return;
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
          if (choice.state != null || choice.workflowCategory != null) {
            // Shared Issue status command — the same CAS move the boards
            // drop on, precise ref when the row names one, the category
            // picker path otherwise.
            await moveWorkflow({
              taskIdentifier,
              target: {
                category: choice.state?.category ?? choice.workflowCategory!,
                workflowStateRefId: choice.state?.id,
              },
            });
          } else if (choice.status != null) {
            await changeTaskStatus(taskIdentifier, choice.status!);
          }
        } finally {
          setLoading(false);
        }
      },
      [
        canEditTask,
        changeTaskStatus,
        currentColumnKey,
        moveWorkflow,
        onChange,
        taskIdentifier,
        workflowStateId,
        workflowStateRefId,
      ],
    );

    useMenuDigitShortcuts({
      items: pickableChoices,
      open,
      onPick: (choice) => {
        void handlePick(choice);
        setOpen(false);
      },
    });

    const TriggerIcon = (glyph ?? meta).icon;
    const triggerNode =
      children ||
      (loading ? (
        <span className={styles.trigger}>
          <Loader2Icon
            className="animate-spin"
            size={size}
            style={{ color: cssVar.colorTextDescription }}
          />
        </span>
      ) : (
        <span className={styles.trigger}>
          <SimpleTooltip
            title={glyph?.label ?? t(`taskDetail.${meta.labelKey}`, { defaultValue: meta.label })}
          >
            <TriggerIcon color={(glyph ?? meta).color} size={size} />
          </SimpleTooltip>
        </span>
      ));

    if (disableDropdown) return <>{triggerNode}</>;

    if (!canEditTask)
      return (
        <SimpleTooltip title={reason}>
          <span className={styles.triggerDisabled} onClick={(e) => e.stopPropagation()}>
            {triggerNode}
          </span>
        </SimpleTooltip>
      );

    let pickIndex = 0;
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger render={triggerNode as ReactElement} />
        <DropdownMenuContent className="min-w-52">
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
            onKeyDown={(event) => event.stopPropagation()}
          />
          {!!query.trim() && (
            <div className={styles.showingCaption}>
              {t('taskDetail.showingItems', {
                count: filteredChoices.length,
                defaultValue: 'Showing {{count}} items',
              })}
            </div>
          )}
          {filteredChoices.map((choice) => {
            const pickable = Boolean(choice.status || choice.workflowCategory);
            const isCurrent = taskStatusChoiceIsCurrent(
              { workflowStateId, workflowStateRefId },
              choice,
              currentColumnKey,
            );
            const visual =
              WORKFLOW_CATEGORY_VISUALS[choice.column.targetWorkflowCategory ?? 'backlog'];
            const VisualIcon = visual.icon;
            if (pickable) pickIndex += 1;
            const label = choiceLabel(choice);
            return (
              <DropdownMenuItem
                disabled={!pickable}
                key={choice.state ? `ws:${choice.state.id}` : choice.column.key}
                onClick={(event) => {
                  event.stopPropagation();
                  void handlePick(choice);
                }}
              >
                <VisualIcon color={visual.color} size={16} />
                <span className="flex-1">{label}</span>
                {pickable ? renderMenuExtra(String(pickIndex), isCurrent) : undefined}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

export default TaskStatusTag;
