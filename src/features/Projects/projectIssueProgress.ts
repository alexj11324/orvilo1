import type { TaskWorkflowCategory } from '@orvilo/types';

interface ProgressIssue {
  workflowCategory: TaskWorkflowCategory;
}

/**
 * Workflow progress is independent of agent execution state and project goals.
 *
 * The milestone readout beside this card on the rail
 * (`ProjectModel.listMilestoneProgress`) classifies the same categories the
 * same way — `done` completes, `canceled` leaves scope, an unrecognised state
 * makes the readout unavailable rather than a number. **That repetition is
 * deliberate, not an oversight**, and it cannot be removed by extracting a
 * shared helper here: `packages/database` may not import from the app, so the
 * only way to share one implementation would be to sink the classifier into a
 * package both can import (`@orvilo/types` hosts pure helpers already). Do
 * that as its own change if the duplication is ever worth it; until then **a
 * new `TaskWorkflowCategory` member has to be classified in both places**, or
 * the two numbers shown side by side will disagree.
 */
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

/**
 * Completion percent for the status icon ring: `completed / scope`, the same
 * fraction `ProjectModel.list` computes server-side as `progressPercent`.
 * Empty scope reads 0; an unclassifiable state reads `null`.
 */
export function projectIssueProgressPercent(
  issues: readonly ProgressIssue[] | null | undefined,
): number | null {
  const progress = projectIssueProgress(issues);
  if (!progress) return null;
  if (progress.scope === 0) return 0;
  return Math.round((progress.completed / progress.scope) * 100);
}
