import type { TaskPlanningProposal } from '@orvilo/types';

import type { TaskPlanningPlanner } from './planning';

const semanticEventTypes = new Set([
  'linear.issue.changed',
  'task.assigned',
  'task.created',
  'task.dependency.changed',
  'task.requirement.changed',
  'task.scope.changed',
  'task.status.changed',
]);

/** Safe review-only fallback when a project coordinator cannot be resolved. */
export const proposeLinearPlanningReview: TaskPlanningPlanner = async (snapshot) => {
  const semanticEvents = snapshot.events.filter((event) => semanticEventTypes.has(event.type));
  const issueIds = Array.from(
    new Set(
      semanticEvents
        .map((event) => (event.payload as Record<string, unknown>).issueId)
        .filter((value): value is string => typeof value === 'string'),
    ),
  );

  if (semanticEvents.length === 0) {
    return {
      actions: [{ action: 'noop', reason: 'No planning-relevant domain changes were found.' }],
      explanation: 'The scope was evaluated and no semantic task change requires replanning.',
      requiresApproval: false,
    } satisfies TaskPlanningProposal;
  }

  return {
    actions: [
      {
        action: 'escalate',
        reason:
          issueIds.length > 0
            ? `Linear issue change requires coordinator review: ${issueIds.join(', ')}`
            : `The planning scope changed in ${semanticEvents.length} event(s).`,
      },
    ],
    explanation:
      'The change was durably captured and the affected task scope was snapshotted. A selected project coordinator must review the bounded scope before task or issue mutations are applied.',
    requiresApproval: true,
  } satisfies TaskPlanningProposal;
};
