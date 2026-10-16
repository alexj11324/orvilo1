import type { AssistantContentBlock } from '@orvilo/types';
import { safeParseJSON } from '@orvilo/utils';

export interface OperationGoal {
  criteriaCount: number;
  name: string;
  /** The `goals` row the tool created — the card's pointer and its link target. */
  orchestrationWorkflowId: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

/**
 * Derive Goal artifacts from the completed createGoal calls in one assistant
 * group. Like the edited-files aggregate, this is display-only: no Work row is
 * created and nothing enters Work Gallery/history.
 */
export const deriveOperationGoals = (blocks: AssistantContentBlock[] = []): OperationGoal[] => {
  const goals = blocks.flatMap((block) =>
    (block.tools ?? []).flatMap((tool) => {
      if (
        !['orvilo-orchestration-workflow', 'orvilo-task'].includes(tool.identifier) ||
        tool.apiName !== 'startOrchestrationWorkflow'
      )
        return [];
      if (tool.result?.error || !isRecord(tool.result?.state) || tool.result.state.success !== true)
        return [];

      const orchestrationWorkflowId = nonEmptyString(tool.result.state.orchestrationWorkflowId);
      if (!orchestrationWorkflowId) return [];

      const parsedArgs = safeParseJSON(tool.arguments);
      const args = isRecord(parsedArgs) ? parsedArgs : undefined;
      const name =
        nonEmptyString(tool.result.state.name) ??
        nonEmptyString(args?.name) ??
        orchestrationWorkflowId;
      const criteriaCount = Array.isArray(args?.criteria) ? args.criteria.length : 0;

      return [{ criteriaCount, orchestrationWorkflowId, name }];
    }),
  );

  return [
    ...new Map(
      goals.map((orchestrationWorkflow) => [
        orchestrationWorkflow.orchestrationWorkflowId,
        orchestrationWorkflow,
      ]),
    ).values(),
  ];
};
