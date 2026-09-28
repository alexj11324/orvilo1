import type { TaskStatus, TaskWorkflowCategory } from '@orvilo/types';

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

/** The board's workflow columns, in order. Triage is an intake queue, not a Status choice. */
export const WORKFLOW_STATUS_CHOICES: readonly TaskWorkflowCategory[] = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
];
