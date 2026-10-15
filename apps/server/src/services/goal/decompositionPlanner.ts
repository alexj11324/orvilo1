import { TRACING_SCENARIOS } from '@orvilo/const';
import type { TracingOptions } from '@orvilo/llm-generation-tracing';
import {
  chainGoalDecompose,
  GOAL_DECOMPOSE_JSON_SCHEMA,
  GOAL_DECOMPOSE_PROMPT_VERSION,
} from '@orvilo/prompts';
import debug from 'debug';
import { z } from 'zod';

import type { OrviloDatabase } from '@/database/type';

import { generateGoalObject } from './generation';

const log = debug('orvilo-server:goal-decomposition-planner');
const decompositionSchema = z.object({
  problemStatement: z.string().min(1),
  tasks: z
    .array(
      z.object({
        /** 0-based indices of earlier tasks this one consumes; drives `depends_on` edges. */
        dependsOn: z.array(z.number().int().nonnegative()).optional(),
        /**
         * Present only when the direction is a candidate answer under test; the
         * coordinator then wraps its Task in an experiment container. Ordinary
         * delivery steps carry `null` and attach straight to the problem.
         */
        hypothesis: z.string().max(280).nullable().optional(),
        instruction: z.string().min(1),
        title: z.string().min(1).max(80),
      }),
    )
    .min(1)
    .max(5),
});

export type GoalDecompositionDraft = z.infer<typeof decompositionSchema>;

export class GoalDecompositionPlannerService {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  /**
   * Plan the opening exploration structure for a goal that has no tasks yet:
   * the core question plus 1–5 independent directions. Returns undefined on
   * any model/schema failure so the coordinator can fall back to a single
   * task seeded from the raw requirement instead of stalling the goal.
   */
  async decompose(params: {
    /** The goal's coordinator agent — the authorized ACP judgment binding. */
    agentId?: string | null;
    requirement: string;
  }): Promise<GoalDecompositionDraft | undefined> {
    const raw = await generateGoalObject(
      this.db,
      this.userId,
      this.workspaceId,
      params.agentId,
      {
        ...chainGoalDecompose(params),
        schema: GOAL_DECOMPOSE_JSON_SCHEMA,
        thinking: { type: 'disabled' },
      },
      {
        judgment: {
          binding: { agentId: params.agentId },
          purpose: 'goal.decompose',
        },
        kind: 'judgment',
        metadata: { trigger: 'goal_decompose' },
        tracing: {
          promptVersion: GOAL_DECOMPOSE_PROMPT_VERSION,
          scenario: TRACING_SCENARIOS.GoalDecompose,
          schemaName: GOAL_DECOMPOSE_JSON_SCHEMA.name,
        } satisfies TracingOptions,
      },
    );

    const parsed = decompositionSchema.safeParse(raw);
    if (!parsed.success) {
      log('goal decomposition did not match schema: %O', parsed.error.flatten());
      return undefined;
    }
    return parsed.data;
  }
}
