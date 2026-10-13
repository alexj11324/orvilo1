import { orchestrationWorkflowStatuses } from '@orvilo/const/orchestrationWorkflow';
import {
  MAX_ORCHESTRATION_WORKFLOW_METRIC_CRITERIA,
  summarizeOrchestrationWorkflowSupervision,
} from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { OrchestrationWorkflowModel } from '@/database/models/orchestrationWorkflow';
import { heteroAuthedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import {
  HeteroOperationPrincipalError,
  resolveActiveHeteroOperationPrincipal,
} from '@/server/services/heterogeneousAgent/operationPrincipal';
import { OrchestrationWorkflowService } from '@/server/services/orchestrationWorkflow';
import { advanceOrchestrationWorkflow } from '@/server/services/orchestrationWorkflow/advanceOrchestrationWorkflow';
import { OrchestrationWorkflowConversationService } from '@/server/services/orchestrationWorkflow/conversationState';
import {
  OrchestrationWorkflowManagerService,
  orchestrationWorkflowPlanSchema,
} from '@/server/services/orchestrationWorkflow/manager';
import { submitPlanningResult } from '@/server/services/orchestrationWorkflow/planningSubmission';
import { scheduleOrchestrationWorkflowAdvance } from '@/server/services/orchestrationWorkflow/scheduler';

import { assertWorkspaceRowManageable } from './_helpers/assertWorkspaceRowManageable';

const orchestrationWorkflowProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) =>
  opts.next({
    ctx: {
      orchestrationWorkflowModel: new OrchestrationWorkflowModel(
        opts.ctx.serverDB,
        opts.ctx.userId,
        opts.ctx.workspaceId ?? undefined,
      ),
      orchestrationWorkflowService: new OrchestrationWorkflowService(
        opts.ctx.serverDB,
        opts.ctx.userId,
        opts.ctx.workspaceId ?? undefined,
      ),
    },
  }),
);
const orchestrationWorkflowWriteProcedure = orchestrationWorkflowProcedure.use(
  withScopedPermission('agent:update'),
);
const idInput = z.object({ id: z.string() });

function mapOrchestrationWorkflowError(error: unknown, operation: string): never {
  if (error instanceof TRPCError) throw error;
  console.error(`[orchestration workflow:${operation}]`, error);
  throw new TRPCError({
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to ${operation} orchestration workflow`,
  });
}

const planningResultInput = z.object({
  operationId: z.string().min(1),
  token: z.string().min(1),
  result: z.unknown(),
});

export const orchestrationWorkflowRouter = router({
  getStatus: orchestrationWorkflowProcedure
    .input(idInput)
    .query(({ ctx, input }) =>
      new OrchestrationWorkflowConversationService(
        ctx.serverDB,
        ctx.userId,
        ctx.workspaceId ?? undefined,
      ).getStatus(input.id),
    ),
  listDecisions: orchestrationWorkflowProcedure
    .input(idInput)
    .query(({ ctx, input }) =>
      new OrchestrationWorkflowConversationService(
        ctx.serverDB,
        ctx.userId,
        ctx.workspaceId ?? undefined,
      ).listDecisions(input.id),
    ),
  listIssues: orchestrationWorkflowProcedure
    .input(idInput)
    .query(({ ctx, input }) =>
      new OrchestrationWorkflowConversationService(
        ctx.serverDB,
        ctx.userId,
        ctx.workspaceId ?? undefined,
      ).listIssues(input.id),
    ),
  submitOperationDraft: heteroAuthedProcedure
    .use(serverDatabase)
    .input(planningResultInput)
    .mutation(async ({ ctx, input }) => {
      if (ctx.heteroAuthKind !== 'operation' || !ctx.heteroOperation) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'An operation-bound token is required',
        });
      }
      let principal;
      try {
        principal = await resolveActiveHeteroOperationPrincipal({
          capability: 'hetero:ingest',
          claims: ctx.heteroOperation,
          db: ctx.serverDB,
          operationId: input.operationId,
        });
      } catch (error) {
        if (!(error instanceof HeteroOperationPrincipalError)) throw error;
        throw new TRPCError({
          cause: error,
          code:
            error.status === 401 ? 'UNAUTHORIZED' : error.status === 409 ? 'CONFLICT' : 'FORBIDDEN',
          message: error.message,
        });
      }
      return submitPlanningResult(ctx.serverDB, principal.userId, principal.workspaceId, input);
    }),
  submitDraft: orchestrationWorkflowWriteProcedure
    .input(planningResultInput)
    .mutation(({ ctx, input }) =>
      submitPlanningResult(ctx.serverDB, ctx.userId, ctx.workspaceId ?? undefined, input),
    ),
  // A plan is an operation result; the turn token further restricts ingestion to its OrchestrationWorkflow.
  submitOperationPlan: heteroAuthedProcedure
    .use(serverDatabase)
    .input(
      idInput.extend({
        token: z.string().min(1),
        operationId: z.string().min(1),
        plan: orchestrationWorkflowPlanSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.heteroAuthKind !== 'operation' || !ctx.heteroOperation) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'An operation-bound token is required',
        });
      }
      let principal;
      try {
        principal = await resolveActiveHeteroOperationPrincipal({
          capability: 'hetero:ingest',
          claims: ctx.heteroOperation,
          db: ctx.serverDB,
          operationId: input.operationId,
        });
      } catch (error) {
        if (!(error instanceof HeteroOperationPrincipalError)) throw error;
        throw new TRPCError({
          cause: error,
          code:
            error.status === 401 ? 'UNAUTHORIZED' : error.status === 409 ? 'CONFLICT' : 'FORBIDDEN',
          message: error.message,
        });
      }
      const data = await new OrchestrationWorkflowManagerService(
        ctx.serverDB,
        principal.userId,
        principal.workspaceId,
      ).submit(input.id, input.token, input.operationId, input.plan);
      await scheduleOrchestrationWorkflowAdvance({
        orchestrationWorkflowId: input.id,
        userId: principal.userId,
        workspaceId: principal.workspaceId,
      });
      return { data, success: true };
    }),
  submitPlan: orchestrationWorkflowWriteProcedure
    .input(
      idInput.extend({
        token: z.string().min(1),
        operationId: z.string().min(1),
        plan: orchestrationWorkflowPlanSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const data = await new OrchestrationWorkflowManagerService(
        ctx.serverDB,
        ctx.userId,
        ctx.workspaceId ?? undefined,
      ).submit(input.id, input.token, input.operationId, input.plan);
      await scheduleOrchestrationWorkflowAdvance({
        orchestrationWorkflowId: input.id,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId ?? undefined,
      });
      return { data, success: true };
    }),
  addEdge: orchestrationWorkflowWriteProcedure
    .input(
      idInput.extend({
        kind: z.enum([
          'contains',
          'answers',
          'decomposes',
          'depends_on',
          'derived_from',
          'investigates',
          'produces',
          'supports',
          'contradicts',
          'leads_to',
        ]),
        sourceNodeId: z.string().uuid(),
        targetNodeId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      try {
        return {
          data: await ctx.orchestrationWorkflowService.addEdge(
            id,
            input.sourceNodeId,
            input.targetNodeId,
            input.kind,
          ),
          success: true,
        };
      } catch (error) {
        mapOrchestrationWorkflowError(error, 'addEdge');
      }
    }),

  addNode: orchestrationWorkflowWriteProcedure
    .input(
      idInput.extend({
        description: z.string().optional(),
        kind: z.enum(['problem', 'experiment', 'task', 'finding', 'decision']),
        scopeId: z.string().uuid().optional(),
        questionId: z.string().uuid().optional(),
        priority: z.number().int().optional(),
        status: z
          .enum(['proposed', 'active', 'waiting', 'resolved', 'rejected', 'retired'])
          .optional(),
        title: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      try {
        return { data: await ctx.orchestrationWorkflowService.addNode(id, input), success: true };
      } catch (error) {
        mapOrchestrationWorkflowError(error, 'addNode');
      }
    }),

  create: orchestrationWorkflowWriteProcedure
    .input(
      z.object({
        agentId: z.string().optional(),
        /** Set by the `startOrchestrationWorkflow` tool so the seeded graph is authored by the agent. */
        createdByAgentId: z.string().optional(),
        config: z
          .object({
            acceptance: z
              .object({
                /** Numeric clauses gating acceptance; keyed by a series on this orchestration workflow. */
                metrics: z
                  .array(
                    z.object({
                      key: z.string().min(1).max(255),
                      op: z.enum(['gte', 'lte', 'gt', 'lt', 'eq']).optional(),
                      target: z.number(),
                      title: z.string().max(255).optional(),
                    }),
                  )
                  .max(MAX_ORCHESTRATION_WORKFLOW_METRIC_CRITERIA)
                  .optional(),
              })
              .optional(),
            // Bounds mirror `resolveMaxConcurrentTasks`, so a rejected value and
            // a clamped one cannot disagree about what the cap may be.
            exploration: z
              .object({
                instruction: z.string().min(1).max(8000),
                maxExperiments: z.number().int().min(1).max(200),
              })
              .optional(),
            manager: z
              .object({
                instruction: z.string().max(8000).optional(),
                maxTurns: z.number().int().min(1).max(100).optional(),
              })
              .optional(),
            maxConcurrentTasks: z.number().int().min(1).max(10).nullable().optional(),
            supervision: z
              .object({
                enabled: z.boolean(),
                maxIncidents: z.number().int().min(1).max(100).optional(),
              })
              .optional(),
            recovery: z
              .object({
                maxAttemptsPerTask: z.number().int().positive().optional(),
                maxStepsPerRun: z.number().int().positive().nullable().optional(),
                operationLeaseTimeoutMs: z.number().int().min(60_000).optional(),
              })
              .optional(),
            schedule: z
              .object({
                /** ISO-8601 instant; past it the coordinator stops dispatching. */
                deadline: z.string().datetime().nullable().optional(),
              })
              .optional(),
          })
          .optional(),
        maxRounds: z.number().int().positive().optional(),
        maxTotalCost: z.number().positive().optional(),
        /** Structured acceptance criteria — persisted rows that gate the terminal acceptance. */
        criteria: z
          .array(
            z.object({
              description: z.string().optional(),
              instruction: z.string().optional(),
              title: z.string().min(1),
            }),
          )
          .optional(),
        problemDescription: z.string().optional(),
        projectId: z.string().optional(),
        requirement: z.string().optional(),
        title: z.string().min(1),
        /** Seed task nodes, in dependency-free order. */
        tasks: z
          .array(
            z.union([
              z.string().min(1),
              z.object({ description: z.string().optional(), title: z.string().min(1) }),
            ]),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await ctx.orchestrationWorkflowService.create(input);
        // A orchestration workflow is not a document — creating one means starting it. The
        // coordinator takes it from here without a client holding a loop open.
        await scheduleOrchestrationWorkflowAdvance({
          orchestrationWorkflowId: data.orchestrationWorkflow.id,
          trigger: 'create',
          userId: ctx.userId,
          workspaceId: ctx.workspaceId ?? undefined,
        });
        return { data, message: 'Orchestration workflow created', success: true };
      } catch (error) {
        mapOrchestrationWorkflowError(error, 'create');
      }
    }),

  decide: orchestrationWorkflowWriteProcedure
    .input(
      idInput.extend({
        decisionId: z.string().uuid(),
        optionId: z.string(),
        resolution: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await ctx.orchestrationWorkflowService.decide(
          input.id,
          input.decisionId,
          input.optionId,
          input.resolution,
        );
        // Answering the gate is what unblocks the Task; carry on from here.
        await scheduleOrchestrationWorkflowAdvance({
          orchestrationWorkflowId: input.id,
          trigger: 'decide',
          userId: ctx.userId,
          workspaceId: ctx.workspaceId ?? undefined,
        });
        return { data, message: 'Decision resolved', success: true };
      } catch (error) {
        mapOrchestrationWorkflowError(error, 'decide');
      }
    }),

  /** Declare or clear the numeric clauses gating this orchestration workflow's acceptance. */
  setMetricCriteria: orchestrationWorkflowWriteProcedure
    .input(
      idInput.extend({
        metrics: z
          .array(
            z.object({
              key: z.string().min(1).max(255),
              op: z.enum(['gte', 'lte', 'gt', 'lt', 'eq']).optional(),
              target: z.number(),
              title: z.string().max(255).optional(),
            }),
          )
          .max(MAX_ORCHESTRATION_WORKFLOW_METRIC_CRITERIA),
        /** `merge` upserts by key server-side; `replace` (default) swaps the list. */
        mode: z.enum(['merge', 'replace']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const orchestrationWorkflow = await ctx.orchestrationWorkflowModel.findById(input.id);
        if (!orchestrationWorkflow)
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
        assertWorkspaceRowManageable(ctx, orchestrationWorkflow.userId, 'orchestrationWorkflow');
        const data = await ctx.orchestrationWorkflowService.setMetricCriteria(
          input.id,
          input.metrics,
          input.mode,
        );
        // Relaxing a clause can free a orchestration workflow parked short of acceptance.
        await scheduleOrchestrationWorkflowAdvance({
          orchestrationWorkflowId: input.id,
          trigger: 'observe',
          userId: ctx.userId,
          workspaceId: ctx.workspaceId ?? undefined,
        });
        return { data, message: 'Metric criteria updated', success: true };
      } catch (error) {
        mapOrchestrationWorkflowError(error, 'setMetricCriteria');
      }
    }),

  /**
   * Record a measurement against this orchestration workflow and let the coordinator react.
   *
   * The graph otherwise only moves when a Task settles, but a long-horizon
   * orchestration workflow advances when the *world* changes — a follower count, a conversion
   * rate. This is that entry point: it writes to the generic metrics layer
   * (subject = this orchestration workflow) and schedules an advance, so a orchestration workflow whose numeric
   * acceptance was the last thing outstanding closes on the observation
   * instead of waiting up to a sweep window.
   */
  recordObservation: orchestrationWorkflowWriteProcedure
    .input(
      idInput.extend({
        key: z.string().min(1).max(255),
        kind: z.enum(['gauge', 'counter']).optional(),
        observedAt: z.coerce.date().optional(),
        title: z.string().optional(),
        unit: z.string().optional(),
        value: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...observation } = input;
        const { shouldAdvance, ...data } = await ctx.orchestrationWorkflowService.recordObservation(
          id,
          observation,
        );
        // A orchestration workflow parked short of its measured acceptance is only worth waking
        // when the measurement actually cleared the gate; otherwise the advance
        // would tick straight back out as `orchestration_workflow_paused`.
        if (shouldAdvance) {
          await scheduleOrchestrationWorkflowAdvance({
            orchestrationWorkflowId: id,
            trigger: 'observe',
            userId: ctx.userId,
            workspaceId: ctx.workspaceId ?? undefined,
          });
        }
        return { data, message: 'Observation recorded', success: true };
      } catch (error) {
        mapOrchestrationWorkflowError(error, 'recordObservation');
      }
    }),

  /**
   * Run the coordinator now and report where it stopped.
   *
   * The orchestration workflow advances on its own — this is the "don't wait for the next event"
   * nudge, so the surface can hand off in one call instead of holding a tick
   * loop open in the browser.
   */
  advance: orchestrationWorkflowWriteProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    try {
      const { result, ticks } = await advanceOrchestrationWorkflow({
        orchestrationWorkflowId: input.id,
        trigger: 'manual',
        userId: ctx.userId,
        workspaceId: ctx.workspaceId ?? undefined,
      });
      return { data: { ...result, ticks }, message: result.message, success: true };
    } catch (error) {
      mapOrchestrationWorkflowError(error, 'advance');
    }
  }),

  /**
   * Delete a orchestration workflow and, by FK cascade, its whole graph. Anything still running
   * is stopped first; the graph Tasks themselves are deliberately left in place
   * — they are ordinary tasks with their own history and acceptance.
   */
  delete: orchestrationWorkflowWriteProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    try {
      // `agent:update` says the member may change orchestration workflows; it does not say whose.
      // Without this any member could delete a colleague's orchestration workflow and cascade its
      // whole graph away, which is the same rule tasks already enforce.
      const orchestrationWorkflow = await ctx.orchestrationWorkflowModel.findById(input.id);
      if (!orchestrationWorkflow)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
      assertWorkspaceRowManageable(ctx, orchestrationWorkflow.userId, 'orchestrationWorkflow');

      await ctx.orchestrationWorkflowService.delete(input.id);
      return { message: 'Orchestration workflow deleted', success: true };
    } catch (error) {
      mapOrchestrationWorkflowError(error, 'delete');
    }
  }),

  graph: orchestrationWorkflowProcedure.input(idInput).query(async ({ ctx, input }) => {
    try {
      return { data: await ctx.orchestrationWorkflowService.graph(input.id), success: true };
    } catch (error) {
      mapOrchestrationWorkflowError(error, 'graph');
    }
  }),

  /**
   * List orchestration workflows with their graph roll-up: how many Tasks are done, how many
   * decision gates wait on a human, and what the exploration has cost.
   */
  list: orchestrationWorkflowProcedure
    .input(
      z.object({
        agentId: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
        projectId: z.string().optional(),
        statuses: z.array(z.enum(orchestrationWorkflowStatuses)).optional(),
      }),
    )
    .query(async ({ input, ctx }) => ctx.orchestrationWorkflowModel.list(input)),

  pause: orchestrationWorkflowWriteProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    try {
      return {
        data: await ctx.orchestrationWorkflowService.pause(input.id),
        message: 'Orchestration workflow paused',
        success: true,
      };
    } catch (error) {
      mapOrchestrationWorkflowError(error, 'pause');
    }
  }),

  resume: orchestrationWorkflowWriteProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    try {
      const data = await ctx.orchestrationWorkflowService.resume(input.id);
      await scheduleOrchestrationWorkflowAdvance({
        orchestrationWorkflowId: input.id,
        trigger: 'resume',
        userId: ctx.userId,
        workspaceId: ctx.workspaceId ?? undefined,
      });
      return { data, message: 'Orchestration workflow resumed', success: true };
    } catch (error) {
      mapOrchestrationWorkflowError(error, 'resume');
    }
  }),

  /**
   * Start every unfinished Task node over (cancel stale runs, back to
   * `backlog`), optionally under a different agent, and kick the coordinator
   * so the orchestration workflow begins moving without a second gesture.
   */
  restart: orchestrationWorkflowWriteProcedure
    .input(idInput.extend({ agentId: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input: { id, agentId } }) => {
      try {
        // `agent:update` says the member may change orchestration workflows; it does not say
        // whose. Without this any member could restart a colleague's visible
        // orchestration workflow — cancel its live runs and reset its tasks.
        const orchestrationWorkflow = await ctx.orchestrationWorkflowModel.findById(id);
        if (!orchestrationWorkflow)
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
        assertWorkspaceRowManageable(ctx, orchestrationWorkflow.userId, 'orchestrationWorkflow');

        const data = await ctx.orchestrationWorkflowService.restart(id, { agentId });
        await scheduleOrchestrationWorkflowAdvance({
          orchestrationWorkflowId: id,
          trigger: 'restart',
          userId: ctx.userId,
          workspaceId: ctx.workspaceId ?? undefined,
        });
        return {
          data,
          message: `Restarted ${data.restartedTaskIds.length} task(s)`,
          success: true,
        };
      } catch (error) {
        mapOrchestrationWorkflowError(error, 'restart');
      }
    }),

  /** Rebind which persisted verify criteria gate this orchestration workflow's terminal acceptance. */
  setAcceptanceCriteria: orchestrationWorkflowWriteProcedure
    .input(idInput.extend({ criteriaIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.orchestrationWorkflowService.setAcceptanceCriteria(input.id, input.criteriaIds);
        return { success: true };
      } catch (error) {
        mapOrchestrationWorkflowError(error, 'setAcceptanceCriteria');
      }
    }),

  /**
   * Hand the orchestration workflow to a different responsible agent. Unfinished Tasks follow by
   * default (`orchestrationWorkflowOnly` keeps them); Tasks mid-run switch on their next attempt.
   */
  setAgent: orchestrationWorkflowWriteProcedure
    .input(
      idInput.extend({
        agentId: z.string().min(1),
        orchestrationWorkflowOnly: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input: { id, agentId, orchestrationWorkflowOnly } }) => {
      try {
        // Same ownership rule as restart/delete: visibility is not
        // manageability, so only the orchestration workflow's owner may hand it to a new agent.
        const orchestrationWorkflow = await ctx.orchestrationWorkflowModel.findById(id);
        if (!orchestrationWorkflow)
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
        assertWorkspaceRowManageable(ctx, orchestrationWorkflow.userId, 'orchestrationWorkflow');

        const data = await ctx.orchestrationWorkflowService.setAgent(id, agentId, {
          orchestrationWorkflowOnly,
        });
        const reassigned = data.reassignedTaskIds.length;
        return {
          data,
          message: reassigned
            ? `Orchestration workflow agent updated; ${reassigned} task(s) reassigned`
            : 'Orchestration workflow agent updated',
          success: true,
        };
      } catch (error) {
        mapOrchestrationWorkflowError(error, 'setAgent');
      }
    }),

  setBudget: orchestrationWorkflowWriteProcedure
    .input(
      idInput.extend({
        /** ISO-8601 calendar-time budget; null clears the deadline. */
        deadline: z.string().datetime().nullable().optional(),
        // Bounds mirror `resolveMaxConcurrentTasks` and the create input.
        maxConcurrentTasks: z.number().int().min(1).max(10).nullable().optional(),
        maxExperiments: z.number().int().min(1).max(200).optional(),
        maxRounds: z.number().int().positive().nullable().optional(),
        maxTotalCost: z.number().positive().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input: { id, ...budget } }) => {
      try {
        const data = await ctx.orchestrationWorkflowService.setBudget(id, budget);
        // Raising a budget is how a user un-sticks a orchestration workflow that stopped on one;
        // it should start moving again without a second gesture.
        await scheduleOrchestrationWorkflowAdvance({
          orchestrationWorkflowId: id,
          trigger: 'budget',
          userId: ctx.userId,
          workspaceId: ctx.workspaceId ?? undefined,
        });
        return { data, message: 'Orchestration workflow budget updated', success: true };
      } catch (error) {
        mapOrchestrationWorkflowError(error, 'setBudget');
      }
    }),

  supervision: orchestrationWorkflowProcedure.input(idInput).query(async ({ ctx, input }) => {
    const graph = await ctx.orchestrationWorkflowService.graph(input.id);
    const state = graph.orchestrationWorkflow.config?.supervisorState;
    return {
      data: {
        enabled: graph.orchestrationWorkflow.config?.supervision?.enabled ?? false,
        state,
        summary: summarizeOrchestrationWorkflowSupervision(state),
      },
      success: true,
    };
  }),

  tick: orchestrationWorkflowWriteProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    try {
      return { data: await ctx.orchestrationWorkflowService.tick(input.id), success: true };
    } catch (error) {
      mapOrchestrationWorkflowError(error, 'tick');
    }
  }),

  updateRequirement: orchestrationWorkflowWriteProcedure
    .input(idInput.extend({ requirement: z.string().min(1) }))
    .mutation(async ({ ctx, input: { id, requirement } }) => {
      try {
        return {
          data: await ctx.orchestrationWorkflowService.updateRequirement(id, requirement),
          success: true,
        };
      } catch (error) {
        mapOrchestrationWorkflowError(error, 'updateRequirement');
      }
    }),
});
