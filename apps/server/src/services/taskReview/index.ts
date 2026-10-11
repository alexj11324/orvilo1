import { DEFAULT_MINI_SYSTEM_AGENT_ITEM } from '@orvilo/const';
import type { EvaluateResult, RubricResult } from '@orvilo/eval-rubric';
import { evaluate } from '@orvilo/eval-rubric';
import type { GenerateObjectSchema } from '@orvilo/model-runtime';
import type { EvalBenchmarkRubric } from '@orvilo/types';
import debug from 'debug';

import { AgentModel } from '@/database/models/agent';
import type { OrviloDatabase } from '@/database/type';
import { AiGenerationService } from '@/server/services/aiGeneration';

const log = debug('task-review');

export interface ReviewConfig {
  autoRetry: boolean;
  enabled: boolean;
  judge: ReviewJudge;
  maxIterations: number;
  rubrics: EvalBenchmarkRubric[];
}

export interface ReviewJudge {
  model?: string;
  prompt?: string;
  provider?: string;
}

export interface ReviewResult {
  iteration: number;
  overallScore: number;
  passed: boolean;
  rubricResults: RubricResult[];
  suggestions: string[];
}

export class TaskReviewService {
  private db: OrviloDatabase;
  private userId: string;
  private workspaceId?: string;

  constructor(db: OrviloDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  async review(params: {
    content: string;
    iteration?: number;
    judge: ReviewJudge;
    /** The reviewed task's assignee — the authorized ACP judgment binding. */
    judgeAgentId?: string | null;
    rubrics: EvalBenchmarkRubric[];
    taskName: string;
  }): Promise<ReviewResult> {
    const { content, rubrics, judge, taskName, iteration = 1 } = params;

    // The rubric library needs a model hint; execution still uses the bound
    // agent's runtime. Never load the retired global topic-naming preference.
    const agentModel = params.judgeAgentId
      ? await new AgentModel(this.db, this.userId, this.workspaceId).getAgentModelConfig(
          params.judgeAgentId,
        )
      : null;
    const model = judge.model || agentModel?.model || DEFAULT_MINI_SYSTEM_AGENT_ITEM.model;
    const provider =
      judge.provider || agentModel?.provider || DEFAULT_MINI_SYSTEM_AGENT_ITEM.provider;

    log(
      'Starting review for task %s (iteration %d, model=%s, provider=%s, rubrics=%d)',
      taskName,
      iteration,
      model,
      provider,
      rubrics.length,
    );

    // Rubric judgments run as explicitly-authorized ACP operations bound to the
    // task's assignee agent — never on deployment credentials.
    const ai = new AiGenerationService(this.db, this.userId, this.workspaceId);

    // 2. Run evaluate() from @orvilo/eval-rubric
    const result: EvaluateResult = await evaluate(
      {
        actual: content,
        rubrics,
        testCase: { input: taskName },
      },
      {
        matchContext: {
          generateObject: async (payload) => {
            return ai.generateObject(
              {
                messages: payload.messages as any[],
                model: payload.model || model,
                provider,
                schema: {
                  name: 'judge_score',
                  schema: payload.schema as GenerateObjectSchema['schema'],
                },
              },
              {
                judgment: {
                  binding: { agentId: params.judgeAgentId },
                  purpose: 'task.review',
                },
                kind: 'judgment',
                metadata: { trigger: 'task-review' },
              },
            );
          },
          judgeModel: model,
        },
        passThreshold: 0.6,
      },
    );

    log('Review complete: %s (score: %.2f, passed: %s)', taskName, result.score, result.passed);

    return {
      iteration,
      overallScore: Math.round(result.score * 100),
      passed: result.passed,
      rubricResults: result.rubricResults,
      suggestions: [],
    };
  }
}
