import { TRACING_SCENARIOS } from '@orvilo/const';
import type { OrchestrationWorkflowExploreInput } from '@orvilo/prompts';
import {
  chainOrchestrationWorkflowExplore,
  ORCHESTRATION_WORKFLOW_EXPLORE_JSON_SCHEMA,
  ORCHESTRATION_WORKFLOW_EXPLORE_PROMPT_VERSION,
} from '@orvilo/prompts';
import { z } from 'zod';

import type { OrviloDatabase } from '@/database/type';

import { generateOrchestrationWorkflowObject } from './generation';

const planSchema = z
  .object({
    action: z.enum(['expand', 'revise', 'verify']),
    parentNodeId: z.string(),
    title: z.string().max(80),
    instruction: z.string().max(12000),
    reason: z.string().min(1).max(4000),
  })
  .superRefine((plan, ctx) => {
    if (
      plan.action === 'expand' &&
      (!plan.parentNodeId || !plan.title.trim() || !plan.instruction.trim())
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'An expansion requires a parent, title and instruction',
      });
    }
    // A revision reuses its parent's container and title, so only the corrected
    // protocol and the experiment it corrects are mandatory.
    if (plan.action === 'revise' && (!plan.parentNodeId || !plan.instruction.trim())) {
      ctx.addIssue({
        code: 'custom',
        message: 'A revision requires the experiment it corrects and a corrected instruction',
      });
    }
  });

export type OrchestrationWorkflowExplorationPlan = z.infer<typeof planSchema>;

export class OrchestrationWorkflowExplorationPlanner {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  async plan(
    input: OrchestrationWorkflowExploreInput,
    options?: { agentId?: string | null },
  ): Promise<OrchestrationWorkflowExplorationPlan> {
    const result = await generateOrchestrationWorkflowObject(
      this.db,
      this.userId,
      this.workspaceId,
      options?.agentId,
      {
        ...chainOrchestrationWorkflowExplore(input),
        schema: ORCHESTRATION_WORKFLOW_EXPLORE_JSON_SCHEMA,
        thinking: { type: 'disabled' },
      },
      {
        judgment: {
          // The orchestration workflow's coordinator agent is the authorized binding for this
          // planning judgment; a missing binding blocks explicitly.
          binding: { agentId: options?.agentId },
          purpose: 'orchestrationWorkflow.explore',
        },
        kind: 'judgment',
        tracing: {
          scenario: TRACING_SCENARIOS.OrchestrationWorkflowExplore,
          promptVersion: ORCHESTRATION_WORKFLOW_EXPLORE_PROMPT_VERSION,
          schemaName: ORCHESTRATION_WORKFLOW_EXPLORE_JSON_SCHEMA.name,
        },
      },
    );
    return planSchema.parse(result);
  }
}
