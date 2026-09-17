import { TASK_ASSIGNEE_PERMISSION_CODES } from '@orvilo/const/rbac';
import type { LinearIssueSnapshot, LinearProjectBindingSettings } from '@orvilo/types';
import { and, eq, isNull, or } from 'drizzle-orm';

import { RbacModel } from '@/database/models/rbac';
import { TaskModel, type TaskMutationContext } from '@/database/models/task';
import { agents } from '@/database/schemas/agent';
import { projects } from '@/database/schemas/project';
import { workspaceMembers } from '@/database/schemas/workspace';
import type { LobeChatDatabase } from '@/database/type';

const LINEAR_INTEGRATION_SUBJECT_PREFIX = 'linear-installation:';

export const linearIntegrationPrincipal = (installationId: string) =>
  `${LINEAR_INTEGRATION_SUBJECT_PREFIX}${installationId}`;

type LinearBinding = {
  defaultTeamId: string | null;
  installationId: string;
  projectId: string;
  settings: LinearProjectBindingSettings;
  teamIds: string[];
};

type LinearInstallation = {
  id: string;
  organizationId: string;
  organizationName: string | null;
  status: string;
};

/**
 * Narrow task command boundary used by the Linear worker.
 *
 * The principal is an integration subject, never a workspace user. Every
 * read goes through TaskModel's public-or-owner predicate with that subject,
 * and every write is preceded by explicit binding/project/assignment checks.
 */
export class LinearIntegrationTaskService {
  private readonly principal: string;
  private readonly taskModel: TaskModel;

  constructor(
    private readonly db: LobeChatDatabase,
    private readonly workspaceId: string,
    installationId: string,
  ) {
    this.principal = linearIntegrationPrincipal(installationId);
    this.taskModel = new TaskModel(db, this.principal, workspaceId);
  }

  private async validateAssignmentMappings(settings: LinearProjectBindingSettings) {
    for (const mapping of settings.assignmentMappings ?? []) {
      if (!mapping.orviloAgentId && !mapping.orviloUserId) {
        throw new Error(
          `Linear assignment mapping ${mapping.linearUserId} has no workspace target`,
        );
      }

      if (mapping.orviloAgentId) {
        const [agent] = await this.db
          .select({ id: agents.id })
          .from(agents)
          .where(
            and(
              eq(agents.id, mapping.orviloAgentId),
              eq(agents.workspaceId, this.workspaceId),
              eq(agents.visibility, 'public'),
              or(isNull(agents.isDeleted), eq(agents.isDeleted, false)),
            ),
          )
          .limit(1);
        if (!agent) {
          throw new Error(
            `Linear assignment agent ${mapping.orviloAgentId} is not public in this workspace`,
          );
        }
      }

      if (mapping.orviloUserId) {
        const [member] = await this.db
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, this.workspaceId),
              eq(workspaceMembers.userId, mapping.orviloUserId),
              isNull(workspaceMembers.deletedAt),
            ),
          )
          .limit(1);
        if (!member) {
          throw new Error(
            `Linear assignment user ${mapping.orviloUserId} is not an active workspace member`,
          );
        }
        const canManageTasks = await new RbacModel(this.db, mapping.orviloUserId).hasAnyPermission(
          [...TASK_ASSIGNEE_PERMISSION_CODES],
          { userId: mapping.orviloUserId, workspaceId: this.workspaceId },
        );
        if (!canManageTasks) {
          throw new Error(
            `Linear assignment user ${mapping.orviloUserId} cannot be assigned workspace tasks`,
          );
        }
      }
    }
  }

  /** Validate the persisted binding and return the locked public project scope. */
  private validateScope = async (input: {
    binding: LinearBinding;
    installation: LinearInstallation;
    issue: LinearIssueSnapshot;
  }): Promise<{ identifierPrefix: string; inScope: boolean }> => {
    const { binding, installation, issue } = input;
    if (installation.status !== 'active') throw new Error('Linear installation is unavailable');
    if (binding.installationId !== installation.id) {
      throw new Error('Linear binding does not belong to the installation');
    }
    if (!binding.defaultTeamId || !binding.teamIds.includes(binding.defaultTeamId)) {
      throw new Error('Linear binding has no validated default team scope');
    }

    const [project] = await this.db
      .select({ identifier: projects.identifier, visibility: projects.visibility })
      .from(projects)
      .where(
        and(
          eq(projects.id, binding.projectId),
          eq(projects.workspaceId, this.workspaceId),
          eq(projects.visibility, 'public'),
          or(isNull(projects.isDeleted), eq(projects.isDeleted, false)),
        ),
      )
      .for('update')
      .limit(1);
    if (!project) throw new Error('Linear binding project is not public in this workspace');

    if (!issue.teamId || !binding.teamIds.includes(issue.teamId)) {
      return { identifierPrefix: project.identifier, inScope: false };
    }

    await this.validateAssignmentMappings(binding.settings);
    return { identifierPrefix: project.identifier, inScope: true };
  };

  /** Validate the persisted binding and return whether this issue's team is in scope. */
  async validateIssueScope(input: {
    binding: LinearBinding;
    installation: LinearInstallation;
    issue: LinearIssueSnapshot;
  }): Promise<boolean> {
    return (await this.validateScope(input)).inScope;
  }

  async createPublicTask(input: {
    binding: LinearBinding;
    installation: LinearInstallation;
    issue: LinearIssueSnapshot;
    mutation: TaskMutationContext;
  }) {
    const scope = await this.validateScope(input);
    if (!scope.inScope) return null;

    const { binding, installation, issue } = input;
    const workflowMapping = binding.settings.statusMappings?.find(
      (mapping) => mapping.linearStateId === issue.stateId,
    );

    return this.taskModel.create(
      {
        assigneeAgentId: binding.settings.assignmentMappings?.find(
          (mapping) => mapping.linearUserId === issue.assigneeId,
        )?.orviloAgentId,
        assigneeUserId: binding.settings.assignmentMappings?.find(
          (mapping) => mapping.linearUserId === issue.assigneeId,
        )?.orviloUserId,
        description: issue.description?.slice(0, 255),
        identifierPrefix: scope.identifierPrefix,
        instruction: issue.description || issue.title,
        name: issue.title,
        priority: issue.priority ?? 0,
        projectId: binding.projectId,
        visibility: 'public',
        workflowCategory: workflowMapping?.workflowCategory ?? 'backlog',
        workflowStateId: issue.stateId ?? null,
      },
      {
        creationSubject: {
          id: this.principal,
          kind: 'integration',
          snapshot: {
            displayName: installation.organizationName || 'Linear',
            externalId: installation.organizationId,
            kind: 'integration',
          },
        },
        mutation: input.mutation,
      },
    );
  }

  /** Public-only lookup: private tasks are intentionally indistinguishable from missing tasks. */
  findPublicTask = (taskId: string) => this.taskModel.findById(taskId);

  updatePublicTask = (
    taskId: string,
    patch: Parameters<TaskModel['update']>[1],
    mutation: TaskMutationContext,
  ) => this.taskModel.update(taskId, patch, mutation);
}
