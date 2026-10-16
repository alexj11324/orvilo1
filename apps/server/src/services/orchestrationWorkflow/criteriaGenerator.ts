import { BUILTIN_AGENT_SLUGS } from '@orvilo/builtin-agents';
import { TRACING_SCENARIOS } from '@orvilo/const';
import { isProgrammaticTestCheck } from '@orvilo/const/verify';
import type { TracingOptions } from '@orvilo/llm-generation-tracing';
import {
  chainOrchestrationWorkflowCriteriaDraft,
  chainOrchestrationWorkflowDecompose,
  ORCHESTRATION_WORKFLOW_CRITERIA_DRAFT_JSON_SCHEMA,
  ORCHESTRATION_WORKFLOW_CRITERIA_DRAFT_PROMPT_VERSION,
  ORCHESTRATION_WORKFLOW_DECOMPOSE_JSON_SCHEMA,
  ORCHESTRATION_WORKFLOW_DECOMPOSE_PROMPT_VERSION,
  VERIFY_EVIDENCE_MODALITIES,
  VERIFY_EVIDENCE_SCOPES,
  VERIFY_EVIDENCE_TYPES,
  VERIFY_ON_FAIL_ACTIONS,
  VERIFY_VERIFIER_TYPES,
} from '@orvilo/prompts';
import type { RequiredEvidenceSpec, VerifyCheckItem } from '@orvilo/types';
import debug from 'debug';
import { z } from 'zod';

import type { OrviloDatabase } from '@/database/type';

import { generateOrchestrationWorkflowObject } from './generation';

const log = debug('orvilo-server:orchestration-workflow-criteria-generator');
const DEFAULT_MAX_CRITERIA = 4;

const generatedCriteriaSchema = z.object({
  criteria: z.array(
    z.object({
      description: z.string().optional(),
      instruction: z.string().optional(),
      onFail: z.enum(VERIFY_ON_FAIL_ACTIONS).optional(),
      requiredEvidence: z
        .array(
          z.object({
            hint: z.string().optional(),
            modality: z.enum(VERIFY_EVIDENCE_MODALITIES).optional(),
            scope: z.enum(VERIFY_EVIDENCE_SCOPES).optional(),
            type: z.enum(VERIFY_EVIDENCE_TYPES),
          }),
        )
        .optional(),
      required: z.boolean().optional(),
      title: z.string(),
      verifierType: z.enum(VERIFY_VERIFIER_TYPES),
    }),
  ),
  instruction: z.string().min(1),
  title: z.string().min(1).max(80),
});

export interface OrchestrationWorkflowCriterionDraft {
  description?: string;
  instruction?: string;
  onFail?: VerifyCheckItem['onFail'];
  required?: boolean;
  requiredEvidence?: RequiredEvidenceSpec[];
  title: string;
  verifierType?: VerifyCheckItem['verifierType'];
}

export interface OrchestrationWorkflowPlanDraft {
  criteria: OrchestrationWorkflowCriterionDraft[];
  instruction: string;
  title: string;
}

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

export type OrchestrationWorkflowDecompositionDraft = z.infer<typeof decompositionSchema>;

export class OrchestrationWorkflowCriteriaGeneratorService {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  async generate(params: {
    /** Orchestration workflow's coordinator agent — the authorized ACP binding, when known. */
    agentId?: string | null;
    context?: string;
    orchestrationWorkflow: string;
    maxCriteria?: number;
  }): Promise<OrchestrationWorkflowCriterionDraft[]> {
    const plan = await this.generatePlan(params);

    return plan?.criteria ?? [];
  }

  async generatePlan(params: {
    /** Orchestration workflow's coordinator agent — the authorized ACP binding, when known. */
    agentId?: string | null;
    context?: string;
    orchestrationWorkflow: string;
    maxCriteria?: number;
  }): Promise<OrchestrationWorkflowPlanDraft | undefined> {
    const maxCriteria = params.maxCriteria ?? DEFAULT_MAX_CRITERIA;
    const raw = await generateOrchestrationWorkflowObject(
      this.db,
      this.userId,
      this.workspaceId,
      params.agentId,
      {
        ...chainOrchestrationWorkflowCriteriaDraft({ ...params, maxCriteria }),
        schema: ORCHESTRATION_WORKFLOW_CRITERIA_DRAFT_JSON_SCHEMA,
        thinking: { type: 'disabled' },
      },
      {
        judgment: {
          binding: {
            agentId: params.agentId,
            // Acceptance criteria are the verify agent's domain; it is the
            // standing builtin binding when the orchestration workflow has no coordinator yet.
            slug: BUILTIN_AGENT_SLUGS.verifyAgent,
          },
          purpose: 'orchestrationWorkflow.criteriaDraft',
        },
        kind: 'judgment',
        metadata: { trigger: 'orchestration_workflow_criteria_draft' },
        tracing: {
          promptVersion: ORCHESTRATION_WORKFLOW_CRITERIA_DRAFT_PROMPT_VERSION,
          scenario: TRACING_SCENARIOS.OrchestrationWorkflowCriteriaGen,
          schemaName: ORCHESTRATION_WORKFLOW_CRITERIA_DRAFT_JSON_SCHEMA.name,
        } satisfies TracingOptions,
      },
    );

    const parsed = generatedCriteriaSchema.safeParse(raw);
    if (!parsed.success) {
      log('orchestration workflow criteria draft did not match schema: %O', parsed.error.flatten());
      return undefined;
    }

    const criteria = parsed.data.criteria
      .slice(0, maxCriteria)
      .filter((criterion) => !isProgrammaticTestCheck(criterion.title, criterion.description));

    return { ...parsed.data, criteria };
  }

  /**
   * Plan the opening exploration structure for a orchestration workflow that has no tasks yet:
   * the core question plus 1–5 independent directions. Returns undefined on
   * any model/schema failure so the coordinator can fall back to a single
   * task seeded from the raw requirement instead of stalling the orchestration workflow.
   */
  async decompose(params: {
    /** The orchestration workflow's coordinator agent — the authorized ACP judgment binding. */
    agentId?: string | null;
    requirement: string;
  }): Promise<OrchestrationWorkflowDecompositionDraft | undefined> {
    const raw = await generateOrchestrationWorkflowObject(
      this.db,
      this.userId,
      this.workspaceId,
      params.agentId,
      {
        ...chainOrchestrationWorkflowDecompose(params),
        schema: ORCHESTRATION_WORKFLOW_DECOMPOSE_JSON_SCHEMA,
        thinking: { type: 'disabled' },
      },
      {
        judgment: {
          binding: { agentId: params.agentId },
          purpose: 'orchestrationWorkflow.decompose',
        },
        kind: 'judgment',
        metadata: { trigger: 'orchestration_workflow_decompose' },
        tracing: {
          promptVersion: ORCHESTRATION_WORKFLOW_DECOMPOSE_PROMPT_VERSION,
          scenario: TRACING_SCENARIOS.OrchestrationWorkflowDecompose,
          schemaName: ORCHESTRATION_WORKFLOW_DECOMPOSE_JSON_SCHEMA.name,
        } satisfies TracingOptions,
      },
    );

    const parsed = decompositionSchema.safeParse(raw);
    if (!parsed.success) {
      log('orchestration workflow decomposition did not match schema: %O', parsed.error.flatten());
      return undefined;
    }
    return parsed.data;
  }
}
