import type { TaskStatus, TaskWorkflowCategory } from '@orvilo/types';

import { STATUS_KANBAN_COLUMNS } from '../AgentTaskList/kanbanBoardModel';

/**
 * The single Status row of the issue rail.
 *
 * A task carries two independent states: the business workflow state (Linear's
 * Status, the board column) and Orvilo's execution lifecycle (queued, running,
 * awaiting review, failed…). Linear has only the first, and showing both drew
 * two "In progress" rows on the same issue. The rail shows the workflow state
 * whenever the task has one; a task outside any workflow has only its
 * execution status, which then is its Status.
 */
export type TaskStatusRow =
  { category: TaskWorkflowCategory; kind: 'workflow' } | { kind: 'execution'; status: TaskStatus };

export const resolveTaskStatusRow = (
  status: TaskStatus | undefined,
  workflowCategory: TaskWorkflowCategory | undefined,
  workflowStateId: string | null | undefined,
): TaskStatusRow =>
  workflowCategory && workflowStateId
    ? { category: workflowCategory, kind: 'workflow' }
    : { kind: 'execution', status: status ?? 'backlog' };

export interface WorkflowStatusChoice {
  /** The workflow category a pick writes — the column's drop target. */
  category: TaskWorkflowCategory;
  /** The board column this choice stands for, the icon and label source. */
  columnKey: string;
}

/**
 * The Status picker's options — the kanban board's own status columns, in
 * column order and led by the triage intake column (Linear: the Status menu
 * is the board). Every column carries `targetWorkflowCategory`; the picker
 * writes exactly what a drop on that column would write.
 */
export const WORKFLOW_STATUS_CHOICES: readonly WorkflowStatusChoice[] =
  STATUS_KANBAN_COLUMNS.flatMap((column) =>
    column.targetWorkflowCategory
      ? [{ category: column.targetWorkflowCategory, columnKey: column.key }]
      : [],
  );
