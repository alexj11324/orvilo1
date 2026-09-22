import type { TaskWorkflowCategory } from '@orvilo/types';

interface ProgressIssue {
  workflowCategory: TaskWorkflowCategory;
}

/** Workflow progress is independent of agent execution state and project goals. */
export function projectIssueProgress(issues: readonly ProgressIssue[] | null | undefined) {
  if (!issues) return null;
  const result = { completed: 0, scope: 0, started: 0 };
  for (const issue of issues) {
    switch (issue.workflowCategory) {
      case 'canceled': {
        break;
      }
      case 'done': {
        result.scope++;
        result.completed++;
        break;
      }
      case 'in_progress':
      case 'in_review': {
        result.scope++;
        result.started++;
        break;
      }
      case 'triage':
      case 'backlog':
      case 'todo': {
        result.scope++;
        break;
      }
      default: {
        // An unrecognized server state must not masquerade as complete/zero progress.
        return null;
      }
    }
  }
  return result;
}
