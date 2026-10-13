import { TRPCError } from '@trpc/server';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { AcceptanceModel } from '@/database/models/acceptance';
import { AgentModel } from '@/database/models/agent';
import { MessageModel } from '@/database/models/message';
import { OrchestrationWorkflowModel } from '@/database/models/orchestrationWorkflow';
import { OrchestrationWorkflowGraphModel } from '@/database/models/orchestrationWorkflowGraph';
import { TaskModel } from '@/database/models/task';
import { TopicModel } from '@/database/models/topic';
import { messages } from '@/database/schemas/message';
import { orchestrationWorkflowEdges } from '@/database/schemas/orchestrationWorkflowGraph';
import type { OrviloDatabase } from '@/database/type';
import { assertAgentUsableBy } from '@/database/utils/agent-access';
import { TaskService } from '@/server/services/task';
import { AcceptanceService } from '@/server/services/verify/acceptanceService';

import { type CreateOrchestrationWorkflowGraphInput, OrchestrationWorkflowService } from './index';

export interface OrchestrationWorkflowSplitTask {
  assigneeAgentId?: string;
  dependsOn?: number[];
  description: string;
  reviewerAgentId?: string;
  title: string;
}

/** Board-backed splits use conversation replies, never a tool permission dialog. */
export class OrchestrationWorkflowConversationPlanService {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private assertConversation = async (agentId: string, topicId: string) => {
    const orchestrator = await new AgentModel(
      this.db,
      this.userId,
      this.workspaceId,
    ).getOrchestratorSourceAgentId();
    if (agentId !== orchestrator)
      throw new TRPCError({ code: 'FORBIDDEN', message: 'ORCHESTRATOR_REQUIRED' });
    const topic = await new TopicModel(this.db, this.userId, this.workspaceId).findById(topicId);
    if (!topic) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
  };

  prepare = async (
    input: Omit<CreateOrchestrationWorkflowGraphInput, 'tasks'> & {
      tasks: OrchestrationWorkflowSplitTask[];
    },
    context: { agentId: string; topicId: string },
  ) => {
    await this.assertConversation(context.agentId, context.topicId);
    const titles = input.tasks.map((task) => task.title.trim().toLowerCase());
    if (!titles.length || new Set(titles).size !== titles.length || titles.some((title) => !title))
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A split needs distinct nonempty Issue titles',
      });
    for (const [index, task] of input.tasks.entries()) {
      if (!task.description.trim())
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Each Issue needs scope and acceptance criteria',
        });
      if ((task.dependsOn ?? []).some((dep) => !Number.isInteger(dep) || dep < 0 || dep >= index))
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Dependencies must refer to earlier Issues in the split',
        });
      for (const agentId of [task.assigneeAgentId, task.reviewerAgentId].filter(
        Boolean,
      ) as string[])
        await assertAgentUsableBy(this.db, agentId, {
          userId: this.userId,
          workspaceId: this.workspaceId,
        });
    }
    return this.db.transaction(async (tx) => {
      const service = new OrchestrationWorkflowService(tx, this.userId, this.workspaceId);
      const graph = await service.create({ ...input, createdByAgentId: context.agentId });
      const taskService = new TaskService(tx, this.userId, this.workspaceId);
      const parent = await taskService.createTask({
        createdByAgentId: context.agentId,
        instruction: input.requirement ?? input.title,
        name: input.title,
        projectId: input.projectId,
        status: 'backlog',
        workflowCategory: 'backlog',
      });
      const model = new OrchestrationWorkflowModel(tx, this.userId, this.workspaceId);
      await model.update(graph.orchestrationWorkflow.id, {
        subjectType: 'task',
        subjectId: parent.id,
      });
      const nodes = input.tasks.map((draft) =>
        graph.nodes.find((node) => node.kind === 'task' && node.title === draft.title)!,
      );
      const taskIds: string[] = [];
      const graphModel = new OrchestrationWorkflowGraphModel(tx, this.userId, this.workspaceId);
      const taskModel = new TaskModel(tx, this.userId, this.workspaceId);
      for (const [index, draft] of input.tasks.entries()) {
        const result = await service.createResponsibleTask(graph, nodes[index], [], {
          parentTaskId: parent.id,
          assigneeAgentId: draft.assigneeAgentId,
          reviewerAgentId: draft.reviewerAgentId,
        });
        if (!result.taskId) throw new Error('Could not materialize the split Issue');
        taskIds.push(result.taskId);
        for (const dependency of new Set(draft.dependsOn ?? [])) {
          await graphModel.createEdge(
            graph.orchestrationWorkflow.id,
            nodes[index].id,
            nodes[dependency].id,
            'depends_on',
          );
          await taskModel.addDependency(result.taskId, taskIds[dependency]);
        }
      }
      await new OrchestrationWorkflowConversationPlanService(
        tx,
        this.userId,
        this.workspaceId,
      ).post(graph.orchestrationWorkflow.id, context);
      return {
        orchestrationWorkflowId: graph.orchestrationWorkflow.id,
        parentTaskId: parent.id,
        taskIds,
      };
    });
  };

  /** After editing Backlog Issues, post the revised split and reset the reply boundary. */
  post = async (id: string, context: { agentId: string; topicId: string }) => {
    await this.assertConversation(context.agentId, context.topicId);
    return this.db.transaction(async (tx) => {
      const model = new OrchestrationWorkflowModel(tx, this.userId, this.workspaceId);
      const item = await model.findByIdForUpdate(id);
      if (!item || item.agentId !== context.agentId)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
      if (
        item.config?.planConfirmedAt ||
        (item.config?.conversationPlan && item.config.conversationPlan.topicId !== context.topicId)
      )
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Only a pending split in this conversation can be posted',
        });
      const issues = await new TaskModel(tx, this.userId, this.workspaceId).findSubtasks(
        item.subjectId!,
      );
      if (!issues.length)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'The split has no sub-Issues' });
      const taskModel = new TaskModel(tx, this.userId, this.workspaceId);
      const dependencies = await taskModel.getDependenciesByTaskIds(
        issues.map((issue) => issue.id),
      );
      const graphModel = new OrchestrationWorkflowGraphModel(tx, this.userId, this.workspaceId);
      const graph = await graphModel.getGraph(id);
      const nodesByTask = new Map(
        graph?.nodes
          .filter((node) => node.kind === 'task' && node.taskId)
          .map((node) => [node.taskId!, node.id]),
      );
      for (const node of graph?.nodes.filter((node) => node.kind === 'task') ?? []) {
        const issue = issues.find((item) => item.id === node.taskId);
        if (issue)
          await graphModel.updateNodeText(id, node.id, {
            title: issue.name ?? node.title,
            description: issue.instruction,
          });
        else
          await graphModel.updateNodeStatus(
            id,
            node.id,
            'retired',
            'Sub-Issue removed from the pending split',
          );
      }
      for (const issue of issues) {
        if (!nodesByTask.has(issue.id)) {
          const node = await graphModel.createNode(id, {
            kind: 'task',
            title: issue.name ?? issue.identifier,
            description: issue.instruction,
          });
          if (!node || !(await graphModel.bindTask(id, node.id, issue.id)))
            throw new Error('Could not attach the revised sub-Issue');
          nodesByTask.set(issue.id, node.id);
          const problem = graph?.nodes.find((item) => item.kind === 'problem');
          if (problem) await graphModel.createEdge(id, problem.id, node.id, 'decomposes');
        }
        const acceptance = await new AcceptanceService(
          tx,
          this.userId,
          this.workspaceId,
        ).ensureForSubject('task', issue.id, { config: { enabled: true } });
        await new AcceptanceModel(tx, this.userId, this.workspaceId).update(acceptance.id, {
          requirement: issue.instruction,
        });
      }
      await tx
        .delete(orchestrationWorkflowEdges)
        .where(
          and(
            eq(orchestrationWorkflowEdges.orchestrationWorkflowId, id),
            eq(orchestrationWorkflowEdges.kind, 'depends_on'),
          ),
        );
      for (const dependency of dependencies) {
        const node = nodesByTask.get(dependency.taskId);
        const prerequisite = nodesByTask.get(dependency.dependsOnId);
        if (node && prerequisite) await graphModel.createEdge(id, node, prerequisite, 'depends_on');
      }
      const agentModel = new AgentModel(tx, this.userId, this.workspaceId);
      const agentIds = [
        ...new Set(
          issues
            .flatMap((issue) => [
              issue.assigneeAgentId,
              (issue.config as { verify?: { verifierAgentId?: string } } | null)?.verify
                ?.verifierAgentId,
            ])
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const agentNames = new Map(
        await Promise.all(
          agentIds.map(async (id) => {
            const agent = await agentModel.getAgentConfig(id);
            return [id, agent?.title ?? 'Assigned Agent'] as const;
          }),
        ),
      );
      const content = [
        `Orchestration workflow: ${item.title}`,
        `Attempt budget per Issue: ${item.config?.recovery?.maxAttemptsPerTask ?? 3}; parallelism: ${item.config?.maxConcurrentTasks ?? 'coordinator default'}; cost budget: ${item.maxTotalCost ?? 'none'}; deadline: ${item.config?.schedule?.deadline ?? 'none'}.`,
        ...issues.map(
          (issue) =>
            `${issue.identifier}: ${issue.name}\n${issue.instruction}\nAssignee Agent: ${agentNames.get(issue.assigneeAgentId ?? '') ?? 'unassigned'}; reviewer Agent: ${agentNames.get((issue.config as { verify?: { verifierAgentId?: string } } | null)?.verify?.verifierAgentId ?? '') ?? 'existing verification policy'}; dependencies: ${
              dependencies
                .filter((dependency) => dependency.taskId === issue.id)
                .map(
                  (dependency) =>
                    issues.find((item) => item.id === dependency.dependsOnId)?.identifier ??
                    dependency.dependsOnId,
                )
                .join(', ') || 'none'
            }`,
        ),
        'Please reply in this conversation to confirm the split or request changes. The Issues are on the board; execution is awaiting your reply.',
      ].join('\n\n');
      const posted = await new MessageModel(tx, this.userId, this.workspaceId).create({
        agentId: context.agentId,
        content,
        role: 'assistant',
        topicId: context.topicId,
      });
      await model.update(id, {
        config: {
          ...item.config,
          conversationPlan: {
            topicId: context.topicId,
            postedMessageId: posted.id,
            postedAt: new Date(posted.createdAt).toISOString(),
          },
        },
      });
      return { postedMessageId: posted.id };
    });
  };

  release = async (
    id: string,
    context: { agentId: string; topicId: string; sourceMessageId: string },
  ) => {
    await this.assertConversation(context.agentId, context.topicId);
    return this.db.transaction(async (tx) => {
      const model = new OrchestrationWorkflowModel(tx, this.userId, this.workspaceId);
      const item = await model.findByIdForUpdate(id);
      if (!item || item.agentId !== context.agentId)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
      const plan = item.config?.conversationPlan;
      if (!plan || plan.topicId !== context.topicId)
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'The split belongs to another conversation',
        });
      const [reply] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.id, context.sourceMessageId),
            eq(messages.userId, this.userId),
            eq(messages.topicId, context.topicId),
            eq(messages.role, 'user'),
            isNull(messages.deletedAt),
            gt(messages.createdAt, new Date(plan.postedAt)),
          ),
        )
        .limit(1);
      if (!reply)
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'ORCHESTRATION_WORKFLOW_AWAITING_USER_REPLY',
        });
      if (!item.config?.planConfirmedAt)
        await model.update(id, {
          config: { ...item.config, planConfirmedAt: new Date().toISOString() },
        });
      if (item.status === 'planning') await model.updateStatus(id, 'running');
      return { orchestrationWorkflowId: id, parentTaskId: item.subjectId };
    });
  };
}
