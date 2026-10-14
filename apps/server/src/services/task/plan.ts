import { createHash } from 'node:crypto';

import { canMountBuiltinToolSurface } from '@orvilo/heterogeneous-agents';
import type { IssuePlan, TaskContext, TaskItem, TaskOriginContext } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AcceptanceModel } from '@/database/models/acceptance';
import { AgentModel } from '@/database/models/agent';
import { AgentOperationModel } from '@/database/models/agentOperation';
import { MessageModel } from '@/database/models/message';
import { ProjectModel } from '@/database/models/project';
import { RepositoryModel } from '@/database/models/repository';
import { TaskModel } from '@/database/models/task';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TeamModel } from '@/database/models/team';
import { TopicModel } from '@/database/models/topic';
import { getActiveWorkspaceMembershipRole } from '@/database/models/workspace';
import { agentOperations } from '@/database/schemas/agentOperations';
import { taskDispatches } from '@/database/schemas/task';
import { acceptances } from '@/database/schemas/verify';
import type { OrviloDatabase } from '@/database/type';
import { assertCanViewTopicTargets } from '@/server/routers/lambda/_helpers/conversationResourceGuard';
import { assertCanUseWorkspaceAgent } from '@/server/routers/lambda/_helpers/workspaceAgentGuard';
import { runAcpJudgment } from '@/server/services/aiGeneration/judgment';
import { resolveWorkflowTransition } from '@/server/services/taskSettlement/workflowTransition';

import { IssueChecklistService } from './checklist';
import { TaskService } from './index';

const PARENT_REPORT_INSTRUCTION =
  'After all prerequisite deliveries are available, publish the combined delivery report as an artifact or Issue comment with exact upstream Issue, Run, source revision and evidence references. Use the prerequisite work without modifying code or opening a PR. Do not merge PRs or mark this Issue Done.';

const itemSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  required: z.boolean(),
  description: z.string().optional(),
});
const checklistSchema = z
  .object({
    items: z
      .array(itemSchema)
      .min(1)
      .refine(
        (items) =>
          items.some((item) => item.required) &&
          new Set(items.map((item) => item.id)).size === items.length,
      ),
    deliveryKind: z.enum(['code', 'artifact']),
    repo: z.string().optional(),
    targetBranch: z.string().optional(),
  })
  .refine(
    (check) =>
      check.deliveryKind !== 'code' || Boolean(check.repo?.trim() && check.targetBranch?.trim()),
    'Code delivery requires repository and target branch',
  );
export const issuePlanProposalSchema = z
  .object({
    summary: z.string().trim().min(1),
    scope: z.string().trim().min(1),
    checklist: checklistSchema,
    reviewerAgentId: z.string().min(1),
    tasks: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          instruction: z.string().trim().min(1),
          assigneeAgentId: z.string().min(1),
          reviewerAgentId: z.string().optional(),
          dependsOn: z.array(z.number().int().nonnegative()),
          checklist: checklistSchema,
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((plan, ctx) => {
    for (const [index, task] of plan.tasks.entries())
      if (task.dependsOn.some((dep) => dep >= plan.tasks.length || dep === index))
        ctx.addIssue({ code: 'custom', message: 'Dependency must name another task in this plan' });
    if (new Set(plan.tasks.map((task) => task.name.toLowerCase())).size !== plan.tasks.length)
      ctx.addIssue({ code: 'custom', message: 'Sub-Issue titles must be distinct' });
  });

/** Scope and graph facts only; unrelated comments and execution receipts do not invalidate a draft. */
export const issuePlanFingerprint = (
  issues: TaskItem[],
  dependencies: Array<{ taskId: string; dependsOnId: string; type: string }>,
) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        issues: issues
          .map((task) => ({
            id: task.id,
            name: task.name,
            instruction: task.instruction,
            description: task.description,
            projectId: task.projectId,
            parentTaskId: task.parentTaskId,
            assigneeAgentId: task.assigneeAgentId,
            reviewerAgentId: task.reviewerAgentId,
            repo: (task.config as { workspace?: { repo?: string } } | null)?.workspace?.repo,
            targetBranch: (task.config as { workspace?: { baseBranch?: string } } | null)?.workspace
              ?.baseBranch,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        dependencies: dependencies
          .filter((edge) => edge.type === 'blocks')
          .map(({ taskId, dependsOnId }) => ({ taskId, dependsOnId }))
          .sort((a, b) =>
            `${a.taskId}/${a.dependsOnId}`.localeCompare(`${b.taskId}/${b.dependsOnId}`),
          ),
      }),
    )
    .digest('hex');

export const issuePlanRefinementSchema = z
  .object({
    identifier: z.string().min(1),
    revision: z.number().int().positive(),
    refinementRevision: z.number().int().nonnegative(),
    addTasks: z
      .array(
        z
          .object({
            sourceIdentifier: z.string().min(1),
            name: z.string().trim().min(1),
            instruction: z.string().trim().min(1),
            assigneeAgentId: z.string().min(1).optional(),
            dependsOn: z.array(z.string().min(1)).default([]),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    dependencies: z
      .array(
        z
          .object({
            identifier: z.string().min(1),
            dependsOnIdentifier: z.string().min(1),
            action: z.enum(['add', 'remove']),
          })
          .strict(),
      )
      .max(200)
      .default([]),
  })
  .strict()
  .refine(
    (input) => input.addTasks.length || input.dependencies.length,
    'Provide an implementation task or dependency adjustment',
  );

export class TaskPlanService {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private model() {
    return new TaskModel(this.db, this.userId, this.workspaceId);
  }

  private async requireIssue(id: string, write = false) {
    const task = await this.model().resolve(id);
    if (!task || task.isDeleted)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
    if (write && !(await this.model().getCapabilities(task)).canEdit)
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Issue editing permission is required to draft its plan',
      });
    if (task.projectId) {
      const capabilities = await new ProjectModel(
        this.db,
        this.userId,
        this.workspaceId,
      ).getCapabilities(task.projectId);
      if (!(write ? capabilities.canEdit : capabilities.canComment))
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
    }
    return task;
  }

  private requireStoppedWriters(ids: string[], controlOperationId?: string) {
    return this.model().assertStoppedIssueWriters(ids, controlOperationId);
  }

  private async requireSettledScope(task: TaskItem) {
    if (!(task.context as TaskContext | null)?.issuePlan?.confirmedAt) return;
    const plan = (task.context as TaskContext).issuePlan!;
    await this.requireStoppedWriters(plan.checklists.map((check) => check.taskId));
    const [lastDispatch] = await this.db
      .select()
      .from(taskDispatches)
      .where(eq(taskDispatches.taskId, task.id))
      .orderBy(sql`${taskDispatches.generation} DESC`)
      .limit(1);
    if (
      task.workflowCategory === 'canceled' ||
      (lastDispatch?.phase === 'canceled' && lastDispatch.generation === task.executionGeneration)
    )
      return;
    const current = await new IssueChecklistService(
      this.db,
      this.userId,
      this.workspaceId,
    ).getChecklist(task.id);
    if (
      task.workflowCategory !== 'done' ||
      !current.current?.deliveryAccepted ||
      (current.current.proof?.deliveryKind === 'code' && !current.current.merged)
    )
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Finish the current accepted delivery before confirming changed scope',
      });
  }

  async intake(input: {
    name: string;
    instruction: string;
    projectId?: string;
    repositoryId?: string;
    teamId?: string;
    issueId?: string;
    origin?: TaskOriginContext;
  }) {
    if (!input.name.trim() || !input.instruction.trim())
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Clarify the request before creating an Issue',
      });
    if (input.origin?.topicId)
      await assertCanViewTopicTargets(
        { db: this.db, userId: this.userId, workspaceId: this.workspaceId },
        [input.origin.topicId],
      );
    let repository;
    if (input.repositoryId) {
      if (!this.workspaceId)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Repository requires a workspace' });
      repository = await new RepositoryModel(this.db, this.userId, this.workspaceId).findById(
        input.repositoryId,
      );
      if (!repository || repository.status !== 'active')
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Repository not found' });
    }
    let task: TaskItem;
    if (input.issueId) {
      const previous = await this.requireIssue(input.issueId, true);
      await this.requireSettledScope(previous);
      const changed = await this.model().update(
        previous.id,
        {
          name: input.name,
          instruction: input.instruction,
          description: input.instruction.slice(0, 255),
          context: {
            ...(previous.context as TaskContext | null),
            ...(input.origin ? { origin: input.origin } : {}),
          },
        },
        { expectedDomainRevision: previous.domainRevision },
      );
      if (!changed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
      task = changed;
    } else {
      task = await new TaskService(this.db, this.userId, this.workspaceId).createTask({
        name: input.name,
        instruction: input.instruction,
        description: input.instruction.slice(0, 255),
        projectId: input.projectId,
        config: repository
          ? {
              workspace: {
                repo: `${repository.coordinate.owner}/${repository.coordinate.name}`,
                baseBranch: repository.coordinate.defaultBranch ?? undefined,
              },
            }
          : undefined,
        teamId: input.teamId,
        workflowCategory: 'triage',
        triageStatus: 'untriaged',
        context: input.origin ? { origin: input.origin } : undefined,
      });
    }
    await this.draftIssuePlan(task.id);
    return (await this.model().findById(task.id))!;
  }

  async getIssuePlan(id: string) {
    const task = await this.requireIssue(id);
    const subtasks = await this.model().findAllDescendants(task.id);
    const dependencies = await this.model().getDependenciesByTaskIds([
      task.id,
      ...subtasks.map((task) => task.id),
    ]);
    const automationQueue =
      task.automationMode || (task.context as TaskContext | null)?.automationParentDispatchId
        ? await new TaskDispatchModel(this.db, this.workspaceId).automationQueueSummary(task.id)
        : undefined;
    return {
      plan: (task.context as TaskContext | null)?.issuePlan,
      subtasks,
      dependencies,
      automationQueue,
    };
  }

  async draftIssuePlan(id: string) {
    const task = await this.requireIssue(id, true);
    if (task.parentTaskId)
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Plan the parent Issue together with its sub-Issues',
      });
    if (!task.createdByUserId)
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Issue requester is missing' });
    const oldPlan = (task.context as TaskContext | null)?.issuePlan;
    await this.requireSettledScope(task);
    const requirement =
      oldPlan && task.instruction === `${oldPlan.requirement}\n\n${PARENT_REPORT_INSTRUCTION}`
        ? oldPlan.requirement
        : task.instruction;
    const origin = (task.context as TaskContext | null)?.origin;
    const sourceTopic = origin?.topicId
      ? await new TopicModel(this.db, this.userId, this.workspaceId).findById(origin.topicId)
      : undefined;
    const sourceTopicId = sourceTopic?.userId === this.userId ? sourceTopic.id : undefined;
    const before = await this.getIssuePlan(task.id);
    const pendingSubtasks = oldPlan?.confirmedAt
      ? []
      : before.subtasks.filter((task) => !['done', 'canceled'].includes(task.workflowCategory));
    const beforeFingerprint = issuePlanFingerprint([task, ...before.subtasks], before.dependencies);
    const agents = new AgentModel(this.db, this.userId, this.workspaceId);
    const agentId = await agents.getOrchestratorSourceAgentId();
    await assertCanUseWorkspaceAgent({
      agentId,
      db: this.db,
      userId: this.userId,
      workspaceId: this.workspaceId,
    });
    const usableAgents = (
      await Promise.all(
        (await agents.queryAgents()).map(async (candidate) => {
          try {
            await assertCanUseWorkspaceAgent({
              agentId: candidate.id,
              db: this.db,
              userId: this.userId,
              workspaceId: this.workspaceId,
            });
            return {
              id: candidate.id,
              name: candidate.title ?? candidate.name,
              canReviewIssues: canMountBuiltinToolSurface({ type: candidate.heterogeneousType }),
            };
          } catch (error) {
            if (error instanceof TRPCError && ['FORBIDDEN', 'NOT_FOUND'].includes(error.code))
              return null;
            throw error;
          }
        }),
      )
    ).filter((candidate) => candidate !== null);
    const repositories = this.workspaceId
      ? await new RepositoryModel(this.db, this.userId, this.workspaceId).listByWorkspace()
      : [];
    const declared = (
      task.config as {
        workspace?: { repo?: string; baseBranch?: string };
      } | null
    )?.workspace;
    const association =
      this.workspaceId && !declared?.repo
        ? await new RepositoryModel(this.db, this.userId, this.workspaceId).resolveForTask(task.id)
        : undefined;
    const associated = association?.ok
      ? repositories.find((repo) => repo.id === association.repositoryId)
      : undefined;
    const binding = declared?.repo
      ? { repo: declared.repo, baseBranch: declared.baseBranch }
      : associated?.coordinate.owner && associated.coordinate.name
        ? {
            repo: `${associated.coordinate.owner}/${associated.coordinate.name}`,
            baseBranch: associated.coordinate.defaultBranch,
          }
        : undefined;
    const allowedRepos = new Set(
      repositories.flatMap((repo) =>
        repo.remoteRepositoryId && repo.coordinate.owner && repo.coordinate.name
          ? [`${repo.coordinate.owner}/${repo.coordinate.name}`]
          : [],
      ),
    );
    if (binding?.repo) allowedRepos.add(binding.repo);
    const schema = z.toJSONSchema(issuePlanProposalSchema, {
      target: 'draft-07',
      unrepresentable: 'any',
    });
    const [previous] = await this.db
      .select({ context: agentOperations.appContext })
      .from(agentOperations)
      .where(
        and(
          eq(agentOperations.taskId, task.id),
          eq(agentOperations.userId, this.userId),
          this.workspaceId === undefined
            ? isNull(agentOperations.workspaceId)
            : eq(agentOperations.workspaceId, this.workspaceId),
          sql`${agentOperations.appContext}->'judgment'->>'purpose' = 'task.plan'`,
        ),
      )
      .orderBy(sql`${agentOperations.createdAt} DESC`)
      .limit(1);
    await this.requireStoppedWriters([task.id]);
    const result = await runAcpJudgment(this.db, this.userId, {
      workspaceId: this.workspaceId,
      judgment: {
        purpose: 'task.plan',
        attempt: previous ? (previous.context?.judgment?.attempt ?? 0) + 1 : 0,
        binding: { agentId, allowEnvFallback: false },
        taskId: task.id,
        sourceTopicId,
      },
      input: {
        schema: { name: 'issue_plan', schema },
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              request: requirement,
              background: task.description,
              existingIssues: pendingSubtasks,
              repositoryBinding: binding,
              availableRepositories: [...allowedRepos],
              orchestratorAgentId: agentId,
              usableAgents,
              instructions:
                'Draft a delivery plan only. No implementation or tools. Supply checkable Checklist items, scope and real dependencies by zero-based task index. Use only the supplied usableAgents for assignments; reviewerAgentId must have canReviewIssues=true. Use your saved Agent identity for execution unless a usable assigned Agent is already specified. For existing sub-Issues keep their count and order. Code tasks require an available repository and explicit final target branch; never invent a repository. Parent Checklist may describe the combined artifact when children cover multiple repositories. No Goal or Verify graph. The person must confirm before execution.',
            }),
          },
        ],
      },
    });
    const proposal = issuePlanProposalSchema.parse(result.data);
    if (pendingSubtasks.length && pendingSubtasks.length !== proposal.tasks.length)
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Edit the draft sub-Issues before replanning their scope',
      });
    for (const check of [proposal.checklist, ...proposal.tasks.map((task) => task.checklist)])
      if (check.deliveryKind === 'code' && !allowedRepos.has(check.repo!))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Plan repository is outside the available Issue scope',
        });
    for (const reviewer of [
      proposal.reviewerAgentId,
      ...proposal.tasks.map((task) => task.reviewerAgentId),
    ].filter((id): id is string => !!id))
      if (!usableAgents.some((agent) => agent.id === reviewer && agent.canReviewIssues))
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Choose a usable reviewer Agent that can submit Checklist verdicts',
        });
    for (const candidate of [
      { assigneeAgentId: agentId, reviewerAgentId: proposal.reviewerAgentId },
      ...proposal.tasks,
    ])
      for (const id of [candidate.assigneeAgentId, candidate.reviewerAgentId].filter(
        (id): id is string => !!id,
      )) {
        if (!(await agents.existsById(id)))
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan Agent not found' });
        await assertCanUseWorkspaceAgent({
          agentId: id,
          db: this.db,
          userId: this.userId,
          workspaceId: this.workspaceId,
        });
      }
    const saved = await this.model().withIssueDelivery(task.id, async (db, current) => {
      const service = new TaskPlanService(db, this.userId, this.workspaceId);
      const latest = await service.getIssuePlan(current.id);
      if (
        issuePlanFingerprint([current, ...latest.subtasks], latest.dependencies) !==
          beforeFingerprint ||
        (current.context as TaskContext | null)?.issuePlan?.revision !== oldPlan?.revision
      )
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Issue changed during planning; reload and draft again',
        });
      const model = service.model();
      await service.requireSettledScope(current);
      await service.requireStoppedWriters([
        current.id,
        ...latest.subtasks
          .filter(
            (child) =>
              !oldPlan?.confirmedAt && !['done', 'canceled'].includes(child.workflowCategory),
          )
          .map((child) => child.id),
      ]);
      if (oldPlan?.confirmedAt) {
        for (const member of latest.subtasks)
          if (
            oldPlan.checklists.some((check) => check.taskId === member.id) &&
            member.workflowCategory !== 'done'
          )
            await model.updateWithLog(
              member.id,
              { workflowCategory: 'canceled' },
              { agentId, userId: this.userId },
            );
        for (const edge of latest.dependencies)
          if (
            edge.type === 'blocks' &&
            edge.taskId === current.id &&
            oldPlan.checklists.some((check) => check.taskId === edge.dependsOnId)
          )
            await model.removeDependency(current.id, edge.dependsOnId);
      }
      await model.update(current.id, {
        workflowCategory: 'triage',
        triageStatus: 'untriaged',
        ...(oldPlan?.confirmedAt ? { executionGeneration: current.executionGeneration + 1 } : {}),
      });
      const existingChildren = oldPlan?.confirmedAt
        ? []
        : latest.subtasks.filter((task) => !['done', 'canceled'].includes(task.workflowCategory));
      const children: TaskItem[] = [];
      for (const [index, draft] of proposal.tasks.entries()) {
        const config =
          draft.checklist.deliveryKind === 'code'
            ? {
                ...(existingChildren[index]?.config as Record<string, unknown> | null),
                workspace: {
                  provider: 'git',
                  repo: draft.checklist.repo,
                  baseBranch: draft.checklist.targetBranch,
                },
              }
            : undefined;
        const fields = {
          name: draft.name,
          instruction: draft.instruction,
          description: draft.instruction.slice(0, 255),
          assigneeAgentId: draft.assigneeAgentId,
          reviewerAgentId: draft.reviewerAgentId,
          config,
          workflowCategory: 'triage' as const,
          triageStatus: 'untriaged' as const,
        };
        const child = existingChildren[index]
          ? await model.update(existingChildren[index].id, {
              ...fields,
              executionGeneration: existingChildren[index].executionGeneration + 1,
            })
          : await new TaskService(
              db,
              current.createdByUserId ?? this.userId,
              this.workspaceId,
            ).createTask({
              ...fields,
              parentTaskId: current.id,
              projectId: current.projectId ?? undefined,
              teamId: current.teamId ?? undefined,
              createdByAgentId: agentId,
            });
        if (!child)
          throw new TRPCError({ code: 'CONFLICT', message: 'Draft sub-Issue disappeared' });
        children.push(child);
      }
      for (const edge of latest.dependencies)
        if (
          edge.type === 'blocks' &&
          children.some((task) => task.id === edge.taskId) &&
          children.some((task) => task.id === edge.dependsOnId)
        )
          await model.removeDependency(edge.taskId, edge.dependsOnId);
      for (const [index, draft] of proposal.tasks.entries())
        for (const dep of new Set(draft.dependsOn))
          await model.addDependency(children[index].id, children[dep].id, 'blocks', {
            activityActor: { agentId, userId: this.userId },
          });
      for (const child of children)
        await model.addDependency(current.id, child.id, 'blocks', {
          activityActor: { agentId, userId: this.userId },
        });
      const parent = await model.update(current.id, {
        assigneeAgentId: agentId,
        reviewerAgentId: proposal.reviewerAgentId,
        instruction: `${requirement}\n\n${PARENT_REPORT_INSTRUCTION}`,
      });
      if (!parent) throw new TRPCError({ code: 'CONFLICT', message: 'Parent Issue disappeared' });
      const dependencies = await model.getDependenciesByTaskIds([
        current.id,
        ...latest.subtasks.map((task) => task.id),
        ...children.map((task) => task.id),
      ]);
      const checks = [
        {
          ...proposal.checklist,
          deliveryKind: 'artifact' as const,
          repo: undefined,
          targetBranch: undefined,
          taskId: current.id,
        },
        ...children.map((task, index) => ({ ...proposal.tasks[index].checklist, taskId: task.id })),
      ];
      const checklists = await Promise.all(
        checks.map(async (check) => ({
          ...check,
          expectedRevision:
            (
              await new IssueChecklistService(db, this.userId, this.workspaceId).getChecklist(
                check.taskId,
              )
            ).definition?.revision ?? 0,
        })),
      );
      const plan: IssuePlan = {
        revision: (oldPlan?.revision ?? 0) + 1,
        summary: proposal.summary,
        requirement,
        scope: {
          description: proposal.scope,
          repositories: checks
            .flatMap((check) =>
              check.deliveryKind === 'code'
                ? [{ repo: check.repo!, targetBranch: check.targetBranch! }]
                : [],
            )
            .filter(
              (repo, index, repos) =>
                repos.findIndex(
                  (other) => other.repo === repo.repo && other.targetBranch === repo.targetBranch,
                ) === index,
            ),
        },
        checklists,
        parentTaskId: current.id,
        orchestratorAgentId: agentId,
        planningOperationId: result.run.operationId,
        plannedBy: this.userId,
        scopeFingerprint: issuePlanFingerprint(
          [
            parent,
            ...latest.subtasks.filter((task) => !children.some((child) => child.id === task.id)),
            ...children,
          ],
          dependencies,
        ),
      };
      if (
        sourceTopicId &&
        (current.context as TaskContext | null)?.origin?.topicId === sourceTopicId
      ) {
        await assertCanViewTopicTargets(
          { db, userId: this.userId, workspaceId: this.workspaceId },
          [sourceTopicId],
        );
        const posted = await new MessageModel(db, this.userId, this.workspaceId).create({
          agentId,
          topicId: sourceTopicId,
          role: 'assistant',
          content: `${current.identifier}: ${proposal.summary}\n\n${proposal.scope}\n\n${children.map((task) => `${task.identifier}: ${task.name}`).join('\n')}\n\nOpen the Issue plan to review its Checklist and dependencies, then confirm. Execution is waiting for your confirmation.`,
        });
        plan.conversationPlan = {
          topicId: sourceTopicId,
          postedMessageId: posted.id,
          postedAt: new Date(posted.createdAt).toISOString(),
        };
      }
      await model.update(current.id, {
        context: { ...(current.context as TaskContext | null), issuePlan: plan },
        workflowCategory: 'triage',
        triageStatus: 'untriaged',
      });
      return plan;
    });
    if (!saved) throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
    return this.getIssuePlan(task.id);
  }

  /** Server runtime supplies the operation id; tool arguments never confer Agent authority. */
  async refineIssuePlan(raw: z.input<typeof issuePlanRefinementSchema>, operationId: string) {
    const input = issuePlanRefinementSchema.parse(raw);
    const parent = await this.requireIssue(input.identifier, true);
    const operation = await new AgentOperationModel(
      this.db,
      this.userId,
      this.workspaceId,
    ).findOwnOperationById(operationId);
    const initial = (parent.context as TaskContext | null)?.issuePlan;
    const orchestrator = await new AgentModel(
      this.db,
      this.userId,
      this.workspaceId,
    ).getOrchestratorSourceAgentId();
    if (
      !operation ||
      !initial?.confirmedAt ||
      parent.id !== initial.parentTaskId ||
      operation.userId !== parent.createdByUserId ||
      operation.userId !== this.userId ||
      operation.workspaceId !== parent.workspaceId ||
      operation.agentId !== orchestrator ||
      initial.orchestratorAgentId !== orchestrator ||
      !['running', 'waiting_for_async_tool'].includes(operation.status) ||
      !(operation.taskId
        ? initial.checklists.some((check) => check.taskId === operation.taskId)
        : operation.topicId &&
          operation.topicId === (parent.context as TaskContext | null)?.origin?.topicId)
    )
      throw new TRPCError({
        code: 'FORBIDDEN',
        message:
          'A current saved Orchestrator operation acting for the original requester is required',
      });
    await assertCanUseWorkspaceAgent({
      db: this.db,
      userId: operation.userId,
      workspaceId: this.workspaceId,
      agentId: orchestrator,
    });
    const result = await this.model().withIssueDelivery(parent.id, async (db, current) => {
      const service = new TaskPlanService(db, operation.userId, this.workspaceId);
      const model = service.model();
      const plan = (current.context as TaskContext | null)?.issuePlan;
      const live = await new AgentOperationModel(
        db,
        operation.userId,
        this.workspaceId,
      ).findOwnOperationById(operationId);
      const [stopping] = await db
        .select({ id: agentOperations.id })
        .from(agentOperations)
        .where(
          and(
            eq(agentOperations.id, operationId),
            sql`${agentOperations.metadata} #>> '{remoteCancel,state}' IN ('requested', 'unknown')`,
          ),
        )
        .limit(1);
      if (
        stopping ||
        !plan?.confirmedAt ||
        plan.revision !== input.revision ||
        (plan.refinement?.revision ?? 0) !== input.refinementRevision ||
        !live ||
        live.status !== operation.status ||
        live.agentId !== operation.agentId ||
        ['done', 'canceled'].includes(current.workflowCategory)
      )
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'The confirmed plan or Orchestrator operation changed; reload before refining',
        });
      if (
        (await new AgentModel(
          db,
          operation.userId,
          this.workspaceId,
        ).getOrchestratorSourceAgentId()) !== orchestrator
      )
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Saved Orchestrator changed; use its current operation',
        });
      await assertCanUseWorkspaceAgent({
        db,
        userId: operation.userId,
        workspaceId: this.workspaceId,
        agentId: orchestrator,
      });
      const members = await model.findByIds(plan.checklists.map((check) => check.taskId));
      if (members.length !== plan.checklists.length || !plan.executionScopes)
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Confirm the current execution scope before refining',
        });
      for (const member of members) await model.assertConfirmedIssuePlan(member.id);
      const deliveryRun = await new TaskTopicModel(
        db,
        operation.userId,
        this.workspaceId,
      ).findByOperationId(live.id);
      const [deliveryDispatch] = await db
        .select()
        .from(taskDispatches)
        .where(eq(taskDispatches.operationId, live.id))
        .limit(1);
      const isDeliveryWriter = Boolean(
        deliveryRun ||
        deliveryDispatch ||
        live.appContext?.dispatchId ||
        live.appContext?.executionGeneration !== undefined,
      );
      if (live.taskId) {
        const actorTask = members.find((member) => member.id === live.taskId);
        const generation =
          deliveryRun?.executionGeneration ??
          deliveryDispatch?.generation ??
          live.appContext?.executionGeneration;
        if (
          !actorTask ||
          (isDeliveryWriter &&
            (generation !== actorTask.executionGeneration ||
              (deliveryRun && deliveryRun.taskId !== actorTask.id) ||
              (deliveryDispatch && deliveryDispatch.taskId !== actorTask.id))) ||
          ['done', 'canceled'].includes(actorTask.workflowCategory)
        )
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'The Orchestrator Run no longer owns the current Issue generation',
          });
      }
      const resolve = (identifier: string) => {
        const member = members.find(
          (task) => task.id === identifier || task.identifier === identifier,
        );
        if (!member)
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Refinement may reference only current confirmed plan members',
          });
        return member;
      };
      const changes = input.dependencies.map((change) => ({
        ...change,
        task: resolve(change.identifier),
        prerequisite: resolve(change.dependsOnIdentifier),
      }));
      if (changes.some((change) => change.task.id === current.id && change.action === 'remove'))
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'The parent report must depend on every confirmed implementation task',
        });
      const affected = [...new Set([current.id, ...changes.map((change) => change.task.id)])];
      await service.requireStoppedWriters(affected, isDeliveryWriter ? undefined : live.id);
      const added: TaskItem[] = [];
      const checklists = [...plan.checklists];
      const scopes = [...plan.executionScopes];
      for (const draft of input.addTasks) {
        const source = resolve(draft.sourceIdentifier);
        if (source.id === current.id)
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Reuse an approved implementation Checklist, not the combined parent report',
          });
        const standard = plan.checklists.find((check) => check.taskId === source.id)!;
        const original = (
          await new IssueChecklistService(db, operation.userId, this.workspaceId).getChecklist(
            source.id,
          )
        ).definition!;
        const assigneeAgentId = draft.assigneeAgentId ?? source.assigneeAgentId ?? orchestrator;
        await assertCanUseWorkspaceAgent({
          db,
          userId: operation.userId,
          workspaceId: this.workspaceId,
          agentId: assigneeAgentId,
        });
        const child = await new TaskService(db, operation.userId, this.workspaceId).createTask({
          name: draft.name,
          instruction: draft.instruction,
          description: draft.instruction.slice(0, 255),
          assigneeAgentId,
          reviewerAgentId: source.reviewerAgentId ?? undefined,
          createdByAgentId: orchestrator,
          parentTaskId: current.id,
          projectId: current.projectId ?? undefined,
          teamId: current.teamId ?? undefined,
          workflowCategory: 'backlog',
          config:
            standard.deliveryKind === 'code'
              ? {
                  workspace: {
                    provider: 'git',
                    repo: standard.repo,
                    baseBranch: standard.targetBranch,
                  },
                }
              : undefined,
        });
        const aggregate = await new AcceptanceModel(
          db,
          operation.userId,
          this.workspaceId,
        ).ensureForSubject('task', child.id, { projectId: child.projectId });
        await db
          .update(acceptances)
          .set({
            metadata: {
              ...aggregate.metadata,
              issueChecklist: {
                ...original,
                revision: 1,
                inheritedFrom: {
                  taskId: source.id,
                  checklistRevision: original.revision,
                  planRevision: plan.revision,
                  operationId,
                },
              },
            },
          })
          .where(eq(acceptances.id, aggregate.id));
        checklists.push({ ...standard, taskId: child.id, expectedRevision: 0 });
        scopes.push({
          taskId: child.id,
          instruction: child.instruction,
          projectId: child.projectId,
          parentTaskId: current.id,
          minGeneration: child.executionGeneration,
        });
        added.push(child);
        for (const prerequisite of draft.dependsOn.map(resolve))
          await model.addDependency(child.id, prerequisite.id, 'blocks', {
            activityActor: { agentId: orchestrator, userId: operation.userId },
          });
        await model.addDependency(current.id, child.id, 'blocks', {
          activityActor: { agentId: orchestrator, userId: operation.userId },
        });
      }
      for (const change of changes) {
        if (change.action === 'add')
          await model.addDependency(change.task.id, change.prerequisite.id, 'blocks', {
            activityActor: { agentId: orchestrator, userId: operation.userId },
          });
        else
          await model.removeDependency(change.task.id, change.prerequisite.id, {
            actorAgentId: orchestrator,
            source: 'agent',
          });
      }
      const invalidated = new Set<string>();
      for (const id of affected) {
        if (
          (await new TaskTopicModel(db, operation.userId, this.workspaceId).findByTaskId(id)).length
        )
          invalidated.add(id);
      }
      for (const scope of scopes)
        if (invalidated.has(scope.taskId))
          scope.minGeneration =
            members.find((task) => task.id === scope.taskId)!.executionGeneration + 1;
      const { subtasks, dependencies } = await service.getIssuePlan(current.id);
      const refined: IssuePlan = {
        ...plan,
        checklists,
        executionScopes: scopes,
        scopeFingerprint: issuePlanFingerprint([current, ...subtasks], dependencies),
        refinement: {
          revision: input.refinementRevision + 1,
          operationId,
          agentId: orchestrator,
          at: new Date().toISOString(),
        },
      };
      for (const member of [...members, ...added]) {
        await model.update(member.id, {
          context: { ...(member.context as TaskContext | null), issuePlan: refined },
          ...(invalidated.has(member.id)
            ? {
                executionGeneration: member.executionGeneration + 1,
                workflowCategory: 'backlog' as const,
              }
            : {}),
        });
      }
      await model.addComment({
        taskId: current.id,
        userId: operation.userId,
        authorAgentId: orchestrator,
        content: `Refined implementation within confirmed plan ${plan.revision}: added ${added.map((task) => task.identifier).join(', ') || 'no tasks'}; adjusted ${changes.length} dependencies. Original goal, Checklist standards, repositories and final branches remain confirmed.`,
      });
      return { parent: current, plan: refined, added };
    });
    if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
    const dispatch = await new TaskService(
      this.db,
      operation.userId,
      this.workspaceId,
    ).runReadySubtasks(parent.id, `refinement:${result.plan.refinement!.revision}`);
    return { ...(await this.getIssuePlan(parent.id)), added: result.added, dispatch };
  }

  async confirmIssuePlan(input: { id: string; revision: number }) {
    const task = await this.requireIssue(input.id, true);
    if (!task.createdByUserId)
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Issue requester is missing' });
    if (
      task.createdByUserId !== this.userId &&
      (!this.workspaceId ||
        (await getActiveWorkspaceMembershipRole(this.db, {
          userId: this.userId,
          workspaceId: this.workspaceId,
        })) !== 'owner')
    )
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only the requester or workspace Owner may confirm the plan',
      });
    const confirmed = await this.model().withIssueDelivery(task.id, async (db, current) => {
      const service = new TaskPlanService(db, this.userId, this.workspaceId);
      const { plan, subtasks, dependencies } = await service.getIssuePlan(current.id);
      if (!plan || plan.revision !== input.revision)
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Plan changed; reload before confirming',
        });
      if (plan.confirmedAt) return { plan, dispatch: false };
      if (plan.scopeFingerprint !== issuePlanFingerprint([current, ...subtasks], dependencies))
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Issue scope or dependencies changed; draft the plan again',
        });
      const checklist = new IssueChecklistService(db, this.userId, this.workspaceId);
      for (const check of plan.checklists) {
        await checklist.confirmChecklist(check);
      }
      const frozen: IssuePlan = {
        ...plan,
        confirmedAt: new Date().toISOString(),
        confirmedBy: this.userId,
        executionScopes: [current, ...subtasks]
          .filter((task) => plan.checklists.some((check) => check.taskId === task.id))
          .map((task) => ({
            taskId: task.id,
            instruction: task.instruction,
            projectId: task.projectId,
            parentTaskId: task.parentTaskId,
            minGeneration: task.executionGeneration,
          })),
      };
      for (const issue of [
        current,
        ...subtasks.filter((task) => plan.checklists.some((check) => check.taskId === task.id)),
      ]) {
        const states =
          issue.teamId && this.workspaceId
            ? await new TeamModel(db, this.userId, this.workspaceId).listWorkflowStates(
                issue.teamId,
              )
            : [];
        await service.model().update(issue.id, {
          ...resolveWorkflowTransition({ category: 'backlog', states }).patch,
          triageStatus: null,
          context: { ...(issue.context as TaskContext | null), issuePlan: frozen },
        });
      }
      return { plan: frozen, dispatch: true };
    });
    if (!confirmed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue not found' });
    const dispatch =
      confirmed.dispatch && !task.automationMode
        ? await new TaskService(this.db, task.createdByUserId, this.workspaceId).runReadySubtasks(
            task.id,
            `plan:${confirmed.plan.revision}`,
          )
        : undefined;
    return { ...(await this.getIssuePlan(task.id)), dispatch };
  }
}
