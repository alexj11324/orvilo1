import type { TaskIssueTemplateDefinition, TaskItem } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { ProjectModel } from '@/database/models/project';
import { TaskModel, TaskRevisionConflictError } from '@/database/models/task';
import { TaskLabelModel } from '@/database/models/taskLabel';
import { TeamModel } from '@/database/models/team';
import { tasks } from '@/database/schemas/task';
import { taskIssueTemplates } from '@/database/schemas/taskIssueTemplate';
import type { OrviloDatabase } from '@/database/type';
import { lockTaskDependencyGraph } from '@/database/utils/taskDependencyLock';
import { buildWorkspaceWhere } from '@/database/utils/workspace';

import { TaskService } from '../task';

export interface CopyIssueInput {
  copyAssignees?: boolean;
  copyDueDate?: boolean;
  copyLabels?: boolean;
  copyProject?: boolean;
  copyTeam?: boolean;
  expectedDomainRevision: number;
  id: string;
  includeSubIssues?: boolean;
  name?: string;
}

/** User-authored issue definitions; no execution state, runtime config or Agent dispatch. */
export class TaskIssueDefinitionService {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private async source(id: string) {
    const task = await new TaskModel(this.db, this.userId, this.workspaceId).resolve(id);
    if (!task || task.isDeleted || task.workspaceId !== (this.workspaceId ?? null))
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
    return task;
  }

  private async lockSource(id: string, expectedDomainRevision: number) {
    await lockTaskDependencyGraph(this.db, this.userId, this.workspaceId);
    const source = await this.source(id);
    const [locked] = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, source.id), eq(tasks.domainRevision, expectedDomainRevision)))
      .limit(1)
      .for('update');
    if (!locked) throw new TaskRevisionConflictError();
    return this.source(source.id);
  }

  private async completeSubtree(source: TaskItem) {
    const descendants = await new TaskModel(
      this.db,
      this.userId,
      this.workspaceId,
    ).findAllDescendants(source.id);
    const tree = [source, ...descendants];
    const ids = tree.map((task) => task.id);
    const visibleIds = new Set(ids);
    const children = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(inArray(tasks.parentTaskId, ids), sql`${tasks.isDeleted} IS NOT TRUE`));
    if (children.some((child) => !visibleIds.has(child.id)))
      throw new TRPCError({ code: 'NOT_FOUND', message: 'One or more sub-issues are unavailable' });
    return tree;
  }

  private async definition(
    task: TaskItem,
    copyAssignees = false,
  ): Promise<TaskIssueTemplateDefinition> {
    const labels = await new TaskLabelModel(this.db, this.userId, this.workspaceId).listForTask(
      task.id,
    );
    return {
      description: task.description,
      editorData: task.editorData,
      instruction: task.instruction,
      name: task.name,
      priority: task.priority,
      projectId: task.projectId,
      teamId: task.teamId,
      labelIds: labels.map((label) => label.id),
      ...(copyAssignees
        ? { assigneeAgentId: task.assigneeAgentId, assigneeUserId: task.assigneeUserId }
        : {}),
    };
  }

  /** Shared by same-workspace copies, reusable templates and real recurring issue creation. */
  async createFromDefinition(
    definition: TaskIssueTemplateDefinition,
    options: {
      visibility: 'private' | 'public';
      parentTaskId?: string;
      name?: string;
      dueDate?: string | null;
    },
  ) {
    if (
      definition.teamId &&
      this.workspaceId &&
      !(await new TeamModel(this.db, this.userId, this.workspaceId).hasWriteAccess(
        definition.teamId,
      ))
    ) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Team write access required' });
    }
    const task = await new TaskService(this.db, this.userId, this.workspaceId).createTask(
      {
        assigneeAgentId: definition.assigneeAgentId ?? undefined,
        assigneeUserId: definition.assigneeUserId ?? undefined,
        description: definition.description ?? undefined,
        editorData: definition.editorData,
        instruction: definition.instruction,
        name: options.name ?? definition.name ?? undefined,
        parentTaskId: options.parentTaskId,
        priority: definition.priority,
        projectId: definition.projectId ?? undefined,
        teamId: definition.teamId ?? undefined,
        triageStatus: definition.teamId ? 'accepted' : undefined,
        visibility: options.visibility,
        workflowCategory: 'todo',
      },
      { source: 'user' },
    );
    const labels = new TaskLabelModel(this.db, this.userId, this.workspaceId);
    for (const labelId of definition.labelIds) await labels.assign(task.id, labelId);
    if (options.dueDate)
      return (await new TaskModel(this.db, this.userId, this.workspaceId).update(
        task.id,
        { dueDate: options.dueDate },
        { source: 'user' },
      ))!;
    return task;
  }

  async copyIssue(input: CopyIssueInput) {
    return this.db.transaction(async (tx) => {
      const service = new TaskIssueDefinitionService(
        tx as OrviloDatabase,
        this.userId,
        this.workspaceId,
      );
      const source = await service.lockSource(input.id, input.expectedDomainRevision);
      const originals = input.includeSubIssues ? await service.completeSubtree(source) : [source];
      const copies = new Map<string, string>();
      for (const original of originals) {
        const definition = await service.definition(original, input.copyAssignees === true);
        if (input.copyLabels === false) definition.labelIds = [];
        if (input.copyProject === false) definition.projectId = null;
        if (input.copyTeam === false) definition.teamId = null;
        const created = await service.createFromDefinition(definition, {
          dueDate: input.copyDueDate === false ? null : original.dueDate,
          name: original.id === source.id ? input.name : undefined,
          parentTaskId: original.id === source.id ? undefined : copies.get(original.parentTaskId!),
          visibility: original.visibility,
        });
        copies.set(original.id, created.id);
      }
      return { rootId: copies.get(source.id)!, taskIds: [...copies.values()] };
    });
  }

  async createRelated(input: {
    id: string;
    expectedDomainRevision: number;
    kind: 'related' | 'sub_issue' | 'parent' | 'blocked' | 'blocking';
    name: string;
    instruction?: string;
  }) {
    return this.db.transaction(async (tx) => {
      const db = tx as OrviloDatabase;
      const service = new TaskIssueDefinitionService(db, this.userId, this.workspaceId);
      const source = await service.lockSource(input.id, input.expectedDomainRevision);
      const created = await service.createFromDefinition(
        {
          name: input.name,
          instruction: input.instruction ?? '',
          editorData: null,
          priority: source.priority,
          teamId: source.teamId,
          projectId: source.projectId,
          labelIds: [],
        },
        {
          parentTaskId: input.kind === 'sub_issue' ? source.id : undefined,
          visibility: source.visibility,
        },
      );
      const taskModel = new TaskModel(db, this.userId, this.workspaceId);
      if (input.kind === 'parent')
        await taskModel.update(
          source.id,
          { parentTaskId: created.id },
          { expectedDomainRevision: input.expectedDomainRevision, source: 'user' },
        );
      else if (input.kind === 'blocked')
        await taskModel.addDependency(created.id, source.id, 'blocks');
      else if (input.kind === 'blocking')
        await taskModel.addDependency(source.id, created.id, 'blocks');
      else if (input.kind === 'related')
        await taskModel.addDependency(source.id, created.id, 'relates');
      return created;
    });
  }

  async markDuplicate(input: { id: string; targetId: string; expectedDomainRevision: number }) {
    const source = await this.source(input.id);
    const target = await this.source(input.targetId);
    if (source.id === target.id || target.duplicateOfTaskId)
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Choose a different issue that is not already a duplicate',
      });
    if (source.domainRevision !== input.expectedDomainRevision)
      throw new TaskRevisionConflictError();
    const result = await new TaskService(this.db, this.userId, this.workspaceId).updateStatus(
      {
        id: source.id,
        status: 'canceled',
        expectedContract: {
          assigneeAgentId: source.assigneeAgentId,
          executionGeneration: source.executionGeneration,
          policyRevision: source.policyRevision,
          requirementRevision: source.requirementRevision,
        },
        workflow: { workflowCategory: 'canceled', workflowStateId: null, workflowStateRefId: null },
      },
      undefined,
      undefined,
      {
        beforeMutation: async (db) => {
          await lockTaskDependencyGraph(db, this.userId, this.workspaceId);
          const ids = [source.id, target.id].sort();
          const locked = await db
            .select({ id: tasks.id, duplicateOfTaskId: tasks.duplicateOfTaskId })
            .from(tasks)
            .where(inArray(tasks.id, ids))
            .orderBy(asc(tasks.id))
            .for('update');
          const canonical = locked.find((task) => task.id === target.id);
          if (!canonical || canonical.duplicateOfTaskId)
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Canonical issue is already a duplicate',
            });
          if (!(await new TaskModel(db, this.userId, this.workspaceId).findById(target.id)))
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
          return Boolean(
            await new TaskModel(db, this.userId, this.workspaceId).update(
              source.id,
              { duplicateOfTaskId: target.id, triageStatus: 'duplicate' },
              { expectedDomainRevision: input.expectedDomainRevision, source: 'user' },
            ),
          );
        },
      },
    );
    return result?.task ?? null;
  }

  async clearDuplicate(input: { id: string; expectedDomainRevision: number }) {
    return this.db.transaction(async (tx) => {
      const db = tx as OrviloDatabase;
      const service = new TaskIssueDefinitionService(db, this.userId, this.workspaceId);
      const source = await service.lockSource(input.id, input.expectedDomainRevision);
      return new TaskModel(db, this.userId, this.workspaceId).update(
        source.id,
        {
          duplicateOfTaskId: null,
          ...(source.triageStatus === 'duplicate' ? { triageStatus: null } : {}),
        },
        { expectedDomainRevision: input.expectedDomainRevision, source: 'user' },
      );
    });
  }

  async convertToProject(input: {
    id: string;
    expectedDomainRevision: number;
    name: string;
    identifier: string;
    issueName: string;
  }) {
    return this.db.transaction(async (tx) => {
      const db = tx as OrviloDatabase;
      const service = new TaskIssueDefinitionService(db, this.userId, this.workspaceId);
      const source = await service.lockSource(input.id, input.expectedDomainRevision);
      const issues = await service.completeSubtree(source);
      const project = await new ProjectModel(db, this.userId, this.workspaceId).create({
        description: source.instruction,
        identifier: input.identifier,
        name: input.name,
        teamId: source.teamId ?? undefined,
        visibility: source.visibility,
        status: 'backlog',
        priority: source.priority as 0 | 1 | 2 | 3 | 4,
      });
      const model = new TaskModel(db, this.userId, this.workspaceId);
      for (const issue of issues) {
        await model.update(
          issue.id,
          {
            parentTaskId: null,
            projectId: project.id,
            ...(issue.id === source.id ? { name: input.issueName } : {}),
          },
          { expectedDomainRevision: issue.domainRevision, source: 'user' },
        );
      }
      return { projectId: project.id, taskIds: issues.map((issue) => issue.id) };
    });
  }

  async convertToTemplate(input: { id: string; expectedDomainRevision: number; name: string }) {
    return this.db.transaction(async (tx) => {
      const db = tx as OrviloDatabase;
      const service = new TaskIssueDefinitionService(db, this.userId, this.workspaceId);
      const source = await service.lockSource(input.id, input.expectedDomainRevision);
      const [template] = await db
        .insert(taskIssueTemplates)
        .values({
          definition: await service.definition(source, true),
          name: input.name,
          sourceTaskId: source.id,
          userId: this.userId,
          visibility: source.visibility,
          workspaceId: this.workspaceId ?? null,
        })
        .returning();
      return template;
    });
  }

  private templateOwnership() {
    return buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      taskIssueTemplates,
    );
  }

  async templates() {
    const rows = await this.db
      .select()
      .from(taskIssueTemplates)
      .where(this.templateOwnership())
      .orderBy(asc(taskIssueTemplates.name))
      .limit(100);
    const sources = await new TaskModel(this.db, this.userId, this.workspaceId).findByIds(
      rows.flatMap((row) => (row.sourceTaskId ? [row.sourceTaskId] : [])),
    );
    const readable = new Set(sources.map((source) => source.id));
    return rows.filter((row) =>
      row.sourceTaskId ? readable.has(row.sourceTaskId) : row.userId === this.userId,
    );
  }

  async createFromTemplate(input: { templateId: string; name?: string }) {
    return this.db.transaction(async (tx) => {
      const service = new TaskIssueDefinitionService(
        tx as OrviloDatabase,
        this.userId,
        this.workspaceId,
      );
      const [template] = await (tx as OrviloDatabase)
        .select()
        .from(taskIssueTemplates)
        .where(and(eq(taskIssueTemplates.id, input.templateId), service.templateOwnership()))
        .limit(1);
      if (
        !template ||
        (template.sourceTaskId
          ? !(await new TaskModel(tx as OrviloDatabase, this.userId, this.workspaceId).findById(
              template.sourceTaskId,
            ))
          : template.userId !== this.userId)
      )
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Issue template not found' });
      return service.createFromDefinition(template.definition, {
        name: input.name,
        visibility: template.visibility,
      });
    });
  }

  async snapshotForRecurrence(id: string, expectedDomainRevision: number) {
    const source = await this.lockSource(id, expectedDomainRevision);
    return { source, definition: await this.definition(source, true) };
  }
}
