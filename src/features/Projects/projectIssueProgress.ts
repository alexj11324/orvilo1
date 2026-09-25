import { type TaskWorkflowCategory, workflowBucket } from '@orvilo/types';

interface ProgressIssue {
  workflowCategory: TaskWorkflowCategory;
}

/**
 * Workflow progress is independent of agent execution state and project goals.
 * The classifier is the shared {@link workflowBucket}: `done` completes,
 * `canceled` leaves scope, an unrecognised state makes the readout
 * unavailable rather than a number — the same read `ProjectModel`'s milestone
 * progress applies through the same helper.
 */
export function projectIssueProgress(issues: readonly ProgressIssue[] | null | undefined) {
  if (!issues) return null;
  const result = { completed: 0, scope: 0, started: 0 };
  for (const issue of issues) {
    const bucket = workflowBucket(issue.workflowCategory);
    if (bucket === null) return null;
    if (bucket === 'excluded') continue;
    result.scope++;
    if (bucket === 'completed') result.completed++;
    if (bucket === 'started') result.started++;
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
