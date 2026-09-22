import { createProjectCoordinatorAgentConfig } from '@orvilo/builtin-agents';
import type {
  ProjectDatePrecision,
  ProjectHealth,
  ProjectOrchestrationPolicy,
  ProjectPriority,
  ProjectStatus,
  ProjectUpdateKind,
  ProjectVisibility,
  TaskCreationSubjectSnapshot,
} from '@orvilo/types';
import { PROJECT_CREATABLE_STATUSES } from '@orvilo/types';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  getTableName,
  inArray,
  isNull,
  max,
  or,
  sql,
} from 'drizzle-orm';

import { agents } from '../schemas/agent';
import { knowledgeBases } from '../schemas/file';
import {
  projectAgents,
  projectCompletionReviews,
  projectDependencies,
  projectKnowledgeBases,
  projectLabelBindings,
  projectLabels,
  projectMilestones,
  projects,
} from '../schemas/project';
import { projectLinks } from '../schemas/projectLink';
import { projectMembers } from '../schemas/projectMember';
import { projectUpdates } from '../schemas/projectUpdate';
import { projectWorks } from '../schemas/projectWork';
import { tasks } from '../schemas/task';
import { users } from '../schemas/user';
import { works } from '../schemas/work';
import type { OrviloDatabase } from '../type';
import { buildProjectReadableWhere } from '../utils/projectReadable';
import { buildTaskTeamReadableWhere } from '../utils/taskTeamReadable';
import { buildWorkspacePayload, buildWorkspaceWhere } from '../utils/workspace';
import { AgentModel } from './agent';
import { ProjectMemberModel } from './projectMember';
import { TeamModel } from './team';
import { hasActiveWorkspaceMembership } from './workspace';

export interface ProjectPlanningInput {
  dependencies?: { projectId: string; type: 'blockedBy' | 'blocking' }[];
  labelIds?: string[];
  memberIds?: string[];
  milestones?: { name: string; description?: string; date?: string }[];
  newLabelNames?: string[];
  priority?: ProjectPriority;
  startDatePrecision?: ProjectDatePrecision;
  status?: ProjectStatus;
  targetDatePrecision?: ProjectDatePrecision;
}

export interface CreateProjectInput extends ProjectPlanningInput {
  avatar?: string;
  /** Managed creation audit for import/integration-created projects. */
  creationSubject?: {
    id?: string;
    kind: 'integration' | 'system';
    snapshot?: TaskCreationSubjectSnapshot;
  };
  description?: string;
  identifier: string;
  leadUserId?: string;
  name: string;
  slug?: string;
  startDate?: string;
  summary?: string;
  targetDate?: string;
  teamId?: string;
  visibility?: ProjectVisibility;
}

export interface UpdateProjectInput {
  avatar?: string | null;
  description?: string | null;
  labelIds?: string[];
  leadUserId?: string | null;
  name?: string;
  priority?: ProjectPriority;
  slug?: string | null;
  startDate?: string | null;
  startDatePrecision?: ProjectDatePrecision | null;
  summary?: string;
  targetDate?: string | null;
  targetDatePrecision?: ProjectDatePrecision | null;
  visibility?: ProjectVisibility;
}

export interface ProjectOrchestrationPolicyUpdateInput {
  coordinatorAgentId: string;
  expectedRevision: number;
  orchestrationPolicy: ProjectOrchestrationPolicy;
}

export interface ProjectOrchestrationPolicyView {
  coordinatorAgentId: string | null;
  orchestrationPolicy: ProjectOrchestrationPolicy;
  orchestrationPolicyRevision: number;
  requireHumanReviewRequired: boolean;
  stale?: boolean;
}

export interface ProjectModelOptions {
  /** Workspace administrators may manage shared projects they did not create. */
  canManageAll?: boolean;
}

export interface ProjectAgentInput {
  agentId: string;
  enabled?: boolean;
  responsibility?: string | null;
  role?: string | null;
  sortOrder?: number;
}

export interface ProjectKnowledgeBaseInput {
  enabled?: boolean;
  knowledgeBaseId: string;
  sortOrder?: number;
}

export interface ProjectWorkInput {
  sortOrder?: number;
  workId: string;
}

export const DEFAULT_PROJECT_ORCHESTRATION_POLICY: ProjectOrchestrationPolicy = {
  autoDispatch: false,
  concurrencyLimit: 1,
  executionBudget: { maxCost: 25, maxRuns: 10 },
  planningBudget: { maxRevisions: 20 },
  replanMode: 'disabled',
  requireHumanReview: true,
};

export const normalizeProjectOrchestrationPolicy = (
  policy: Partial<ProjectOrchestrationPolicy> | null | undefined,
): ProjectOrchestrationPolicy => ({
  allowedAgentIds:
    policy?.allowedAgentIds === undefined
      ? undefined
      : [...new Set(policy.allowedAgentIds.filter(Boolean))],
  allowedRoles:
    policy?.allowedRoles === undefined
      ? undefined
      : [...new Set(policy.allowedRoles.map((role) => role.trim()).filter(Boolean))],
  autoDispatch: policy?.autoDispatch ?? DEFAULT_PROJECT_ORCHESTRATION_POLICY.autoDispatch,
  concurrencyLimit:
    policy?.concurrencyLimit ?? DEFAULT_PROJECT_ORCHESTRATION_POLICY.concurrencyLimit,
  executionBudget: {
    maxCost:
      policy?.executionBudget?.maxCost ??
      DEFAULT_PROJECT_ORCHESTRATION_POLICY.executionBudget!.maxCost,
    maxRuns:
      policy?.executionBudget?.maxRuns ??
      DEFAULT_PROJECT_ORCHESTRATION_POLICY.executionBudget!.maxRuns,
  },
  planningBudget: {
    maxRevisions:
      policy?.planningBudget?.maxRevisions ??
      DEFAULT_PROJECT_ORCHESTRATION_POLICY.planningBudget!.maxRevisions,
  },
  replanMode: policy?.replanMode ?? DEFAULT_PROJECT_ORCHESTRATION_POLICY.replanMode,
  requireHumanReview:
    policy?.requireHumanReview ?? DEFAULT_PROJECT_ORCHESTRATION_POLICY.requireHumanReview,
});

const validateOrchestrationPolicy = (policy: ProjectOrchestrationPolicy) => {
  if (
    policy.concurrencyLimit !== undefined &&
    (!Number.isInteger(policy.concurrencyLimit) ||
      policy.concurrencyLimit < 1 ||
      policy.concurrencyLimit > 100)
  ) {
    throw new Error('Concurrency limit must be an integer between 1 and 100');
  }

  const maxRuns = policy.executionBudget?.maxRuns;
  if (maxRuns !== undefined && (!Number.isInteger(maxRuns) || maxRuns < 1 || maxRuns > 1000)) {
    throw new Error('Maximum runs must be an integer between 1 and 1000');
  }

  const maxCost = policy.executionBudget?.maxCost;
  if (maxCost !== undefined && (!Number.isFinite(maxCost) || maxCost < 0 || maxCost > 100_000)) {
    throw new Error('Maximum cost must be a finite number between 0 and 100000');
  }

  const maxRevisions = policy.planningBudget?.maxRevisions;
  if (
    maxRevisions !== undefined &&
    (!Number.isInteger(maxRevisions) || maxRevisions < 1 || maxRevisions > 1000)
  ) {
    throw new Error('Maximum planning revisions must be an integer between 1 and 1000');
  }

  if (!['disabled', 'observe', 'suggest', 'apply'].includes(policy.replanMode)) {
    throw new Error('Invalid replanning mode');
  }
};

type ProjectPolicyRow = Pick<
  typeof projects.$inferSelect,
  | 'coordinatorAgentId'
  | 'orchestrationPolicy'
  | 'orchestrationPolicyRevision'
  | 'status'
  | 'completedReviewId'
>;

const projectRequiresHumanReview = (project: ProjectPolicyRow) =>
  project.status === 'reviewing' ||
  project.status === 'completed' ||
  project.completedReviewId !== null;

const toOrchestrationPolicyView = (project: ProjectPolicyRow): ProjectOrchestrationPolicyView => ({
  coordinatorAgentId: project.coordinatorAgentId,
  orchestrationPolicy: normalizeProjectOrchestrationPolicy(project.orchestrationPolicy),
  orchestrationPolicyRevision: project.orchestrationPolicyRevision,
  requireHumanReviewRequired: projectRequiresHumanReview(project),
});

export class ProjectModel {
  private readonly canManageAll: boolean;

  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
    options: ProjectModelOptions = {},
  ) {
    this.canManageAll = Boolean(options.canManageAll && workspaceId);
  }

  private readable() {
    return buildProjectReadableWhere(this.db, {
      userId: this.userId,
      workspaceId: this.workspaceId,
    });
  }

  private manageable() {
    return and(this.readable(), eq(projects.userId, this.userId));
  }

  /**
   * The same predicate TaskModel uses for list/read — workspace visibility,
   * private-team ACL, and soft-delete. `taskCount` must match what the
   * project's Issues list would actually show the caller.
   */
  private taskReadable() {
    return and(
      buildWorkspaceWhere(
        { userId: this.userId, workspaceId: this.workspaceId },
        {
          userId: tasks.createdByUserId,
          visibility: tasks.visibility,
          workspaceId: tasks.workspaceId,
        },
      ),
      this.workspaceId ? buildTaskTeamReadableWhere(this.db, this.userId) : undefined,
      sql`${tasks.isDeleted} IS NOT TRUE`,
    );
  }

  private orchestrationPolicyManageable() {
    return this.canManageAll
      ? this.readable()
      : and(this.readable(), eq(projects.userId, this.userId));
  }

  async create(input: CreateProjectInput) {
    const identifier = input.identifier.trim().toUpperCase();
    if (identifier.length < 3 || identifier.length > 6) {
      throw new Error('Project identifier must be between 3 and 6 characters');
    }
    const {
      creationSubject,
      teamId,
      dependencies = [],
      labelIds = [],
      memberIds = [],
      milestones = [],
      newLabelNames = [],
      ...projectInput
    } = input;
    if (input.status && !(PROJECT_CREATABLE_STATUSES as readonly string[]).includes(input.status)) {
      throw new Error('Project completion requires a human review');
    }
    if (
      input.priority !== undefined &&
      (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 4)
    ) {
      throw new Error('Invalid project priority');
    }
    if (milestones.some(({ name }) => !name.trim())) throw new Error('Milestone name is required');
    const dependencyDirections = new Map<string, string>();
    for (const dependency of dependencies) {
      if (
        dependencyDirections.has(dependency.projectId) &&
        dependencyDirections.get(dependency.projectId) !== dependency.type
      ) {
        throw new Error('Project dependencies cannot form a cycle');
      }
      dependencyDirections.set(dependency.projectId, dependency.type);
    }

    return this.db.transaction(async (tx) => {
      const db = tx as OrviloDatabase;
      if (input.startDate && input.targetDate && input.targetDate < input.startDate) {
        throw new Error('Target date must not precede start date');
      }
      if (input.leadUserId) {
        const validLead = this.workspaceId
          ? await hasActiveWorkspaceMembership(db, {
              userId: input.leadUserId,
              workspaceId: this.workspaceId,
            })
          : input.leadUserId === this.userId;
        if (!validLead) throw new Error('Project lead must be an active workspace member');
      }
      const teamModel = this.workspaceId ? new TeamModel(db, this.userId, this.workspaceId) : null;
      if (
        teamId &&
        !(await teamModel?.listReadable())?.some(
          (team) => team.id === teamId && team.status === 'active',
        )
      ) {
        throw new Error('Project team is not available in this workspace');
      }
      if ((memberIds.length || labelIds.length || newLabelNames.length) && !this.workspaceId) {
        throw new Error('Project members and labels require a workspace');
      }
      for (const memberId of new Set(memberIds)) {
        if (
          !this.workspaceId ||
          !(await hasActiveWorkspaceMembership(db, {
            userId: memberId,
            workspaceId: this.workspaceId,
          }))
        ) {
          throw new Error('Project member must be an active workspace member');
        }
      }
      const planningModel = new ProjectModel(db, this.userId, this.workspaceId);
      for (const dependencyId of dependencyDirections.keys()) {
        if (!(await planningModel.findById(dependencyId)))
          throw new Error('Dependent project is not available');
      }
      // Lock the dependency endpoints first so concurrent creates referencing
      // the same projects serialize: a second transaction waits here, then
      // re-reads the dependency graph committed by the first.
      if (dependencyDirections.size) {
        await tx
          .select({ id: projects.id })
          .from(projects)
          .where(inArray(projects.id, [...dependencyDirections.keys()]))
          .for('update');
      }
      // A new project can close an existing path even without a direct reverse edge.
      const predecessors = new Set(
        [...dependencyDirections].filter(([, type]) => type === 'blockedBy').map(([id]) => id),
      );
      let frontier = [...dependencyDirections]
        .filter(([, type]) => type === 'blocking')
        .map(([id]) => id);
      const visited = new Set<string>();
      while (predecessors.size && frontier.length) {
        if (frontier.some((id) => predecessors.has(id)))
          throw new Error('Project dependencies cannot form a cycle');
        frontier.forEach((id) => visited.add(id));
        const edges = await db
          .select({ id: projectDependencies.successorId })
          .from(projectDependencies)
          .where(inArray(projectDependencies.predecessorId, frontier));
        frontier = [...new Set(edges.map(({ id }) => id).filter((id) => !visited.has(id)))];
      }
      const selectedLabels =
        labelIds.length && this.workspaceId
          ? await db
              .select()
              .from(projectLabels)
              .where(
                and(
                  inArray(projectLabels.id, [...new Set(labelIds)]),
                  eq(projectLabels.workspaceId, this.workspaceId),
                ),
              )
          : [];
      if (selectedLabels.length !== new Set(labelIds).size)
        throw new Error('Project label is not available in this workspace');
      if (newLabelNames.some((name) => !name.trim() || name.trim().length > 100))
        throw new Error('Invalid project label');
      const coordinatorConfig = createProjectCoordinatorAgentConfig({
        avatar: input.avatar,
        description: input.description,
        identifier,
        name: input.name,
      });
      const coordinator = await new AgentModel(
        tx as OrviloDatabase,
        this.userId,
        this.workspaceId,
      ).create({
        ...coordinatorConfig,
        visibility: input.visibility,
        virtual: true,
      });

      const [project] = await tx
        .insert(projects)
        .values(
          buildWorkspacePayload(
            { userId: this.userId, workspaceId: this.workspaceId },
            {
              ...projectInput,
              coordinatorAgentId: coordinator.id,
              createdBySnapshot: creationSubject?.snapshot ?? null,
              createdBySubjectId: creationSubject?.id ?? this.userId,
              createdBySubjectKind: creationSubject?.kind ?? 'user',
              identifier,
              orchestrationPolicy: DEFAULT_PROJECT_ORCHESTRATION_POLICY,
            },
          ),
        )
        .returning();

      await tx.insert(projectAgents).values({
        addedByUserId: this.userId,
        agentId: coordinator.id,
        projectId: project.id,
        responsibility: 'Coordinates project conversations, work, and resources',
        role: 'coordinator',
        workspaceId: this.workspaceId ?? null,
      });

      if (teamId && teamModel) await teamModel.linkProject(project.id, teamId);

      if (this.workspaceId) {
        for (const memberId of new Set(memberIds)) {
          await new ProjectMemberModel(db, this.userId).add({
            projectId: project.id,
            userId: memberId,
            workspaceId: this.workspaceId,
          });
        }
        for (const name of new Set(newLabelNames.map((value) => value.trim()))) {
          const [label] = await db
            .insert(projectLabels)
            .values({ workspaceId: this.workspaceId, name })
            .onConflictDoUpdate({
              target: [projectLabels.workspaceId, projectLabels.name],
              set: { name },
            })
            .returning();
          selectedLabels.push(label);
        }
      }
      const boundLabelIds = [...new Set(selectedLabels.map(({ id }) => id))];
      if (boundLabelIds.length)
        await db
          .insert(projectLabelBindings)
          .values(boundLabelIds.map((labelId) => ({ projectId: project.id, labelId })));
      if (milestones.length)
        await db.insert(projectMilestones).values(
          milestones.map((milestone, sortOrder) => ({
            ...milestone,
            name: milestone.name.trim(),
            projectId: project.id,
            sortOrder,
          })),
        );
      if (dependencyDirections.size)
        await db.insert(projectDependencies).values(
          [...dependencyDirections].map(([dependencyId, direction]) => ({
            predecessorId: direction === 'blockedBy' ? dependencyId : project.id,
            successorId: direction === 'blockedBy' ? project.id : dependencyId,
          })),
        );
      return project;
    });
  }

  async listLabels() {
    if (
      !this.workspaceId ||
      !(await hasActiveWorkspaceMembership(this.db, {
        userId: this.userId,
        workspaceId: this.workspaceId,
      }))
    )
      return [];
    return this.db
      .select()
      .from(projectLabels)
      .where(eq(projectLabels.workspaceId, this.workspaceId))
      .orderBy(asc(projectLabels.name));
  }

  async getPlanning(id: string) {
    if (!(await this.findById(id))) return null;
    const [milestones, labelRows, memberRows, edges, teamIdRows] = await Promise.all([
      this.db
        .select()
        .from(projectMilestones)
        .where(eq(projectMilestones.projectId, id))
        .orderBy(asc(projectMilestones.sortOrder)),
      this.db
        .select({ label: projectLabels })
        .from(projectLabelBindings)
        .innerJoin(projectLabels, eq(projectLabels.id, projectLabelBindings.labelId))
        .where(eq(projectLabelBindings.projectId, id)),
      this.db
        .select({ userId: projectMembers.userId, name: users.fullName, avatar: users.avatar })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(
          and(
            eq(projectMembers.projectId, id),
            isNull(projectMembers.deletedAt),
            isNull(projectMembers.suspendedAt),
          ),
        ),
      this.db
        .select()
        .from(projectDependencies)
        .where(
          or(eq(projectDependencies.predecessorId, id), eq(projectDependencies.successorId, id)),
        ),
      this.workspaceId
        ? new TeamModel(this.db, this.userId, this.workspaceId).listTeamIdsForProject(id)
        : Promise.resolve([] as string[]),
    ]);
    const teamModel = this.workspaceId
      ? new TeamModel(this.db, this.userId, this.workspaceId)
      : null;
    const teamRows = teamModel
      ? (await Promise.all(teamIdRows.map((teamId) => teamModel.findById(teamId)))).filter(
          (team): team is NonNullable<typeof team> => team !== null,
        )
      : [];
    const relatedProjects = await this.findByIds(
      edges.map((edge) => (edge.predecessorId === id ? edge.successorId : edge.predecessorId)),
    );
    const dependencies = edges.flatMap((edge) => {
      const projectId = edge.predecessorId === id ? edge.successorId : edge.predecessorId;
      const project = relatedProjects.find((row) => row.id === projectId);
      return project
        ? [
            {
              project,
              type: edge.predecessorId === id ? ('blocking' as const) : ('blockedBy' as const),
            },
          ]
        : [];
    });
    return {
      dependencies,
      labels: labelRows.map(({ label }) => label),
      members: memberRows,
      milestones,
      teams: teamRows,
    };
  }

  async delete(id: string) {
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ coordinatorAgentId: projects.coordinatorAgentId })
        .from(projects)
        .where(and(eq(projects.id, id), this.manageable()))
        .limit(1);
      if (!project) return null;

      const [deleted] = await tx
        .delete(projects)
        .where(and(eq(projects.id, id), this.manageable()))
        .returning();
      if (project.coordinatorAgentId) {
        await new AgentModel(tx as OrviloDatabase, this.userId, this.workspaceId).delete(
          project.coordinatorAgentId,
        );
      }
      return deleted ?? null;
    });
  }

  async findById(id: string) {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), this.readable()))
      .limit(1);
    return project ?? null;
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(projects)
      .where(and(inArray(projects.id, ids), this.readable()));
  }

  async findByIdOrSlug(reference: string) {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(and(or(eq(projects.id, reference), eq(projects.slug, reference)), this.readable()))
      .limit(1);
    return project ?? null;
  }

  async list(options: { limit?: number; offset?: number; statuses?: ProjectStatus[] } = {}) {
    const { limit = 50, offset = 0, statuses } = options;
    const statusWhere = statuses?.length ? inArray(projects.status, statuses) : undefined;
    return this.db
      .select({
        ...getTableColumns(projects),
        // Column refs lose their table qualifier inside `sql` templates, so the
        // outer correlation is spelled out — a bare "id" would bind to tasks.id.
        taskCount: sql<number>`(select count(*)::int from ${tasks} where ${tasks.projectId} = ${sql.raw(`"${getTableName(projects)}"."id"`)} and ${this.taskReadable()})`,
      })
      .from(projects)
      .where(and(this.readable(), statusWhere))
      .orderBy(desc(projects.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  async update(id: string, input: UpdateProjectInput) {
    const { labelIds, ...fields } = input;
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), this.manageable()))
        .for('update')
        .limit(1);
      if (!current) return null;
      if (input.leadUserId) {
        const validLead = this.workspaceId
          ? await hasActiveWorkspaceMembership(tx as OrviloDatabase, {
              userId: input.leadUserId,
              workspaceId: this.workspaceId,
            })
          : input.leadUserId === this.userId;
        if (!validLead) throw new Error('Project lead must be an active workspace member');
      }
      // Validate the merged range under a row lock: partial/concurrent edits must
      // not validate against an obsolete opposite endpoint.
      const startDate = input.startDate === undefined ? current.startDate : input.startDate;
      const targetDate = input.targetDate === undefined ? current.targetDate : input.targetDate;
      if (startDate && targetDate && targetDate < startDate)
        throw new Error('Target date must not precede start date');
      if (labelIds !== undefined) {
        const selectedIds = [...new Set(labelIds)];
        const labels =
          selectedIds.length && this.workspaceId
            ? await tx
                .select({ id: projectLabels.id })
                .from(projectLabels)
                .where(
                  and(
                    inArray(projectLabels.id, selectedIds),
                    eq(projectLabels.workspaceId, this.workspaceId),
                  ),
                )
            : [];
        if (labels.length !== selectedIds.length)
          throw new Error('Project label is not available in this workspace');
        await tx.delete(projectLabelBindings).where(eq(projectLabelBindings.projectId, current.id));
        if (selectedIds.length)
          await tx
            .insert(projectLabelBindings)
            .values(selectedIds.map((labelId) => ({ projectId: current.id, labelId })));
      }
      const [project] = await tx
        .update(projects)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(projects.id, id), this.manageable()))
        .returning();
      return project ?? null;
    });
  }

  async getOrchestrationPolicy(id: string) {
    const [project] = await this.db
      .select({
        completedReviewId: projects.completedReviewId,
        coordinatorAgentId: projects.coordinatorAgentId,
        orchestrationPolicy: projects.orchestrationPolicy,
        orchestrationPolicyRevision: projects.orchestrationPolicyRevision,
        status: projects.status,
      })
      .from(projects)
      .where(and(eq(projects.id, id), this.orchestrationPolicyManageable()))
      .limit(1);

    return project ? toOrchestrationPolicyView(project) : null;
  }

  async updateOrchestrationPolicy(
    id: string,
    input: ProjectOrchestrationPolicyUpdateInput,
  ): Promise<ProjectOrchestrationPolicyView | null> {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new Error('Expected orchestration policy revision must be a positive integer');
    }

    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), this.orchestrationPolicyManageable()))
        .for('update')
        .limit(1);
      if (!project) return null;

      const current = toOrchestrationPolicyView(project);
      if (project.orchestrationPolicyRevision !== input.expectedRevision) {
        return { ...current, stale: true };
      }

      const policy = normalizeProjectOrchestrationPolicy(input.orchestrationPolicy);
      validateOrchestrationPolicy(policy);
      if (!policy.requireHumanReview && projectRequiresHumanReview(project)) {
        throw new Error('Human review is required while the project is completing or completed');
      }

      const projectAgentScope = project.workspaceId
        ? and(
            eq(agents.workspaceId, project.workspaceId),
            eq(projectAgents.workspaceId, project.workspaceId),
          )
        : and(
            project.userId ? eq(agents.userId, project.userId) : isNull(agents.userId),
            isNull(agents.workspaceId),
            isNull(projectAgents.workspaceId),
          );
      const participants = await tx
        .select({
          agentId: projectAgents.agentId,
          enabled: projectAgents.enabled,
          role: projectAgents.role,
        })
        .from(projectAgents)
        .innerJoin(agents, eq(projectAgents.agentId, agents.id))
        .where(and(eq(projectAgents.projectId, id), projectAgentScope));
      const eligibleParticipants = participants.filter(({ enabled }) => enabled);
      const eligibleAgentIds = new Set(eligibleParticipants.map(({ agentId }) => agentId));

      if (!eligibleAgentIds.has(input.coordinatorAgentId)) {
        throw new Error('Coordinator agent must be an enabled project participant');
      }

      if (policy.allowedAgentIds?.some((agentId) => !eligibleAgentIds.has(agentId))) {
        throw new Error('Allowed agents must be enabled project participants in this workspace');
      }

      const eligibleRoles = new Set(
        eligibleParticipants.flatMap(({ role }) => (role ? [role] : [])),
      );
      if (policy.allowedRoles?.some((role) => !eligibleRoles.has(role))) {
        throw new Error('Allowed roles must belong to enabled project participants');
      }

      const [updated] = await tx
        .update(projects)
        .set({
          coordinatorAgentId: input.coordinatorAgentId,
          orchestrationPolicy: policy,
          orchestrationPolicyRevision: sql`${projects.orchestrationPolicyRevision} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning({
          completedReviewId: projects.completedReviewId,
          coordinatorAgentId: projects.coordinatorAgentId,
          orchestrationPolicy: projects.orchestrationPolicy,
          orchestrationPolicyRevision: projects.orchestrationPolicyRevision,
          status: projects.status,
        });

      return updated ? toOrchestrationPolicyView(updated) : null;
    });
  }

  async updateStatus(id: string, status: ProjectStatus) {
    if (status === 'completed' || status === 'reviewing') {
      throw new Error('Completion states must be changed through the review workflow');
    }
    const project = await this.findManageableById(id);
    if (!project) return null;
    if (project.status === 'reviewing') {
      throw new Error('A project awaiting review must be accepted or rejected');
    }
    if (project.status === 'completed' && status !== 'archived') {
      throw new Error('A completed project must be reopened before changing status');
    }
    if (project.completedReviewId && status !== 'archived') {
      throw new Error('An archived completed project must be reopened before changing status');
    }
    return this.setStatus(id, status, project.startedAt);
  }

  private async setStatus(id: string, status: ProjectStatus, startedAt?: Date | null) {
    const now = new Date();
    const timestamps = {
      ...(status === 'active' ? { startedAt: startedAt ?? now } : {}),
      ...(status === 'archived' ? { archivedAt: now } : {}),
      ...(status !== 'archived' ? { archivedAt: null } : {}),
      updatedAt: now,
    };
    const [project] = await this.db
      .update(projects)
      .set({ ...timestamps, status })
      .where(and(eq(projects.id, id), this.manageable()))
      .returning();
    return project ?? null;
  }

  async listAgents(projectId: string) {
    if (!(await this.findById(projectId))) return null;
    return this.db
      .select({ agent: agents, binding: projectAgents })
      .from(projectAgents)
      .innerJoin(agents, eq(projectAgents.agentId, agents.id))
      .where(
        and(
          eq(projectAgents.projectId, projectId),
          buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, agents),
        ),
      )
      .orderBy(asc(projectAgents.sortOrder), asc(projectAgents.createdAt));
  }

  async addAgent(projectId: string, input: ProjectAgentInput) {
    if (!(await this.findManageableById(projectId))) return null;
    const [agent] = await this.db
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.id, input.agentId),
          buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, agents),
        ),
      )
      .limit(1);
    if (!agent) throw new Error('Agent not found');

    const [binding] = await this.db
      .insert(projectAgents)
      .values({
        ...input,
        addedByUserId: this.userId,
        projectId,
        workspaceId: this.workspaceId ?? null,
      })
      .onConflictDoUpdate({
        set: {
          enabled: input.enabled,
          responsibility: input.responsibility,
          role: input.role,
          sortOrder: input.sortOrder,
          updatedAt: new Date(),
        },
        target: [projectAgents.projectId, projectAgents.agentId],
      })
      .returning();
    return binding;
  }

  async removeAgent(projectId: string, agentId: string) {
    const project = await this.findManageableById(projectId);
    if (!project) return false;
    if (project.coordinatorAgentId === agentId) {
      throw new Error('The project coordinator cannot be removed');
    }
    const deleted = await this.db
      .delete(projectAgents)
      .where(and(eq(projectAgents.projectId, projectId), eq(projectAgents.agentId, agentId)))
      .returning({ id: projectAgents.id });
    return deleted.length > 0;
  }

  async listKnowledgeBases(projectId: string) {
    if (!(await this.findById(projectId))) return null;
    return this.db
      .select({ binding: projectKnowledgeBases, knowledgeBase: knowledgeBases })
      .from(projectKnowledgeBases)
      .innerJoin(knowledgeBases, eq(projectKnowledgeBases.knowledgeBaseId, knowledgeBases.id))
      .where(
        and(
          eq(projectKnowledgeBases.projectId, projectId),
          buildWorkspaceWhere(
            { userId: this.userId, workspaceId: this.workspaceId },
            knowledgeBases,
          ),
        ),
      )
      .orderBy(asc(projectKnowledgeBases.sortOrder), asc(projectKnowledgeBases.createdAt));
  }

  async addKnowledgeBase(projectId: string, input: ProjectKnowledgeBaseInput) {
    if (!(await this.findManageableById(projectId))) return null;
    const [knowledgeBase] = await this.db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.id, input.knowledgeBaseId),
          buildWorkspaceWhere(
            { userId: this.userId, workspaceId: this.workspaceId },
            knowledgeBases,
          ),
        ),
      )
      .limit(1);
    if (!knowledgeBase) throw new Error('Knowledge base not found');

    const [binding] = await this.db
      .insert(projectKnowledgeBases)
      .values({
        ...input,
        addedByUserId: this.userId,
        projectId,
        workspaceId: this.workspaceId ?? null,
      })
      .onConflictDoUpdate({
        set: { enabled: input.enabled, sortOrder: input.sortOrder, updatedAt: new Date() },
        target: [projectKnowledgeBases.projectId, projectKnowledgeBases.knowledgeBaseId],
      })
      .returning();
    return binding;
  }

  async removeKnowledgeBase(projectId: string, knowledgeBaseId: string) {
    if (!(await this.findManageableById(projectId))) return false;
    const deleted = await this.db
      .delete(projectKnowledgeBases)
      .where(
        and(
          eq(projectKnowledgeBases.projectId, projectId),
          eq(projectKnowledgeBases.knowledgeBaseId, knowledgeBaseId),
        ),
      )
      .returning({ id: projectKnowledgeBases.id });
    return deleted.length > 0;
  }

  async listWorks(projectId: string) {
    if (!(await this.findById(projectId))) return null;
    return this.db
      .select({ binding: projectWorks, work: works })
      .from(projectWorks)
      .innerJoin(works, eq(projectWorks.workId, works.id))
      .where(
        and(
          eq(projectWorks.projectId, projectId),
          buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, works),
        ),
      )
      .orderBy(asc(projectWorks.sortOrder), asc(projectWorks.createdAt));
  }

  async addWork(projectId: string, input: ProjectWorkInput) {
    if (!(await this.findManageableById(projectId))) return null;
    const [work] = await this.db
      .select({ id: works.id })
      .from(works)
      .where(
        and(
          eq(works.id, input.workId),
          buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, works),
        ),
      )
      .limit(1);
    if (!work) throw new Error('Work not found');

    const [binding] = await this.db
      .insert(projectWorks)
      .values({
        ...input,
        addedByUserId: this.userId,
        projectId,
        workspaceId: this.workspaceId ?? null,
      })
      .onConflictDoUpdate({
        set: { sortOrder: input.sortOrder, updatedAt: new Date() },
        target: [projectWorks.projectId, projectWorks.workId],
      })
      .returning();
    return binding;
  }

  async removeWork(projectId: string, workId: string) {
    if (!(await this.findManageableById(projectId))) return false;
    const deleted = await this.db
      .delete(projectWorks)
      .where(and(eq(projectWorks.projectId, projectId), eq(projectWorks.workId, workId)))
      .returning({ id: projectWorks.id });
    return deleted.length > 0;
  }

  async listTasks(projectId: string) {
    if (!(await this.findById(projectId))) return null;
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          buildWorkspaceWhere(
            { userId: this.userId, workspaceId: this.workspaceId },
            {
              userId: tasks.createdByUserId,
              visibility: tasks.visibility,
              workspaceId: tasks.workspaceId,
            },
          ),
        ),
      )
      .orderBy(asc(tasks.sortOrder), asc(tasks.seq));

    return rows;
  }

  async getEnabledKnowledgeBaseIdsForTask(taskId: string) {
    const [task] = await this.db
      .select({ projectId: tasks.projectId })
      .from(tasks)
      .where(
        and(
          eq(tasks.id, taskId),
          buildWorkspaceWhere(
            { userId: this.userId, workspaceId: this.workspaceId },
            {
              userId: tasks.createdByUserId,
              visibility: tasks.visibility,
              workspaceId: tasks.workspaceId,
            },
          ),
        ),
      )
      .limit(1);
    if (!task?.projectId || !(await this.findById(task.projectId))) return [];

    const rows = await this.db
      .select({ id: projectKnowledgeBases.knowledgeBaseId })
      .from(projectKnowledgeBases)
      .innerJoin(knowledgeBases, eq(projectKnowledgeBases.knowledgeBaseId, knowledgeBases.id))
      .where(
        and(
          eq(projectKnowledgeBases.projectId, task.projectId),
          eq(projectKnowledgeBases.enabled, true),
          buildWorkspaceWhere(
            { userId: this.userId, workspaceId: this.workspaceId },
            knowledgeBases,
          ),
        ),
      );
    return rows.map(({ id }) => id);
  }

  async moveTaskTree(projectId: string, taskId: string) {
    if (!(await this.findManageableById(projectId))) return null;
    const taskScope = buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      {
        userId: tasks.createdByUserId,
        visibility: tasks.visibility,
        workspaceId: tasks.workspaceId,
      },
    );
    const [root] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), taskScope, eq(tasks.createdByUserId, this.userId)))
      .limit(1);
    if (!root) throw new Error('Task not found');
    if (root.parentTaskId) {
      const [parent] = await this.db
        .select({ projectId: tasks.projectId })
        .from(tasks)
        .where(and(eq(tasks.id, root.parentTaskId), taskScope))
        .limit(1);
      if (parent?.projectId !== projectId) {
        throw new Error('Cannot move a task away from its parent project');
      }
    }

    // Visibility must not hide private descendants here: moving the visible
    // parent while leaving an unseen child behind would split one tree across
    // projects. The creator check below still rejects any row not owned by the
    // caller before the update runs.
    const treeScope = this.workspaceId
      ? eq(tasks.workspaceId, this.workspaceId)
      : and(eq(tasks.createdByUserId, this.userId), isNull(tasks.workspaceId));
    const descendants = await this.db.execute<{ created_by_user_id: string }>(sql`
      WITH RECURSIVE task_tree AS (
        SELECT ${tasks.id}, ${tasks.createdByUserId}
        FROM ${tasks}
        WHERE ${tasks.id} = ${root.id} AND ${treeScope}
        UNION ALL
        SELECT ${tasks.id}, ${tasks.createdByUserId}
        FROM ${tasks}
        JOIN task_tree parent ON ${tasks.parentTaskId} = parent.id
        WHERE ${treeScope}
      )
      SELECT created_by_user_id FROM task_tree
    `);
    if (descendants.rows.some(({ created_by_user_id }) => created_by_user_id !== this.userId)) {
      throw new Error('Cannot move a task tree containing tasks created by another user');
    }

    const { rows } = await this.db.execute<{ id: string }>(sql`
      WITH RECURSIVE task_tree AS (
        SELECT ${tasks.id}
        FROM ${tasks}
        WHERE ${tasks.id} = ${root.id} AND ${taskScope}
          AND ${tasks.createdByUserId} = ${this.userId}
        UNION ALL
        SELECT ${tasks.id}
        FROM ${tasks}
        JOIN task_tree parent ON ${tasks.parentTaskId} = parent.id
        WHERE ${taskScope} AND ${tasks.createdByUserId} = ${this.userId}
      )
      UPDATE ${tasks}
      SET ${sql.identifier(tasks.projectId.name)} = ${projectId},
          ${sql.identifier(tasks.updatedAt.name)} = NOW()
      WHERE ${tasks.id} IN (SELECT id FROM task_tree)
      RETURNING ${tasks.id}
    `);
    return rows;
  }

  async requestCompletion(id: string) {
    const project = await this.findManageableById(id);
    if (!project) return null;
    if (!['active', 'paused'].includes(project.status)) {
      throw new Error('Only active or paused projects can request completion');
    }
    return this.setStatus(id, 'reviewing', project.startedAt);
  }

  async reviewCompletion(id: string, decision: 'accepted' | 'rejected', comment?: string) {
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), this.manageable()))
        .for('update')
        .limit(1);
      if (!project) return null;
      if (project.status !== 'reviewing') throw new Error('Project is not awaiting review');

      const [{ value: lastRound }] = await tx
        .select({ value: max(projectCompletionReviews.round) })
        .from(projectCompletionReviews)
        .where(eq(projectCompletionReviews.projectId, id));
      const [review] = await tx
        .insert(projectCompletionReviews)
        .values({
          comment,
          decision,
          projectId: id,
          reviewerUserId: this.userId,
          round: (lastRound ?? 0) + 1,
          workspaceId: this.workspaceId ?? null,
        })
        .returning();
      const now = new Date();
      const [updated] = await tx
        .update(projects)
        .set(
          decision === 'accepted'
            ? {
                completedAt: now,
                completedReviewId: review.id,
                status: 'completed',
                updatedAt: now,
              }
            : { completedAt: null, completedReviewId: null, status: 'active', updatedAt: now },
        )
        .where(eq(projects.id, id))
        .returning();
      return { project: updated, review };
    });
  }

  async listCompletionReviews(projectId: string) {
    if (!(await this.findById(projectId))) return null;
    return this.db
      .select()
      .from(projectCompletionReviews)
      .where(eq(projectCompletionReviews.projectId, projectId))
      .orderBy(desc(projectCompletionReviews.round));
  }

  async reopen(id: string) {
    const [project] = await this.db
      .update(projects)
      .set({ completedAt: null, completedReviewId: null, status: 'active', updatedAt: new Date() })
      .where(
        and(
          eq(projects.id, id),
          inArray(projects.status, ['completed', 'archived']),
          sql`${projects.completedReviewId} IS NOT NULL`,
          this.manageable(),
        ),
      )
      .returning();
    return project ?? null;
  }

  async findManageableById(id: string) {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), this.manageable()))
      .limit(1);
    return project ?? null;
  }

  async listUpdates(projectId: string) {
    if (!(await this.findById(projectId))) return null;
    return this.db
      .select({
        authorAvatar: users.avatar,
        authorId: projectUpdates.userId,
        authorName: users.fullName,
        body: projectUpdates.body,
        createdAt: projectUpdates.createdAt,
        health: projectUpdates.health,
        id: projectUpdates.id,
        kind: projectUpdates.kind,
        projectId: projectUpdates.projectId,
      })
      .from(projectUpdates)
      .innerJoin(users, eq(users.id, projectUpdates.userId))
      .where(eq(projectUpdates.projectId, projectId))
      .orderBy(desc(projectUpdates.createdAt));
  }

  async listLinks(projectId: string) {
    if (!(await this.findById(projectId))) return null;
    return this.db
      .select()
      .from(projectLinks)
      .where(eq(projectLinks.projectId, projectId))
      .orderBy(asc(projectLinks.createdAt), asc(projectLinks.id));
  }

  async saveLink(projectId: string, input: { id?: string; title?: string; url: string }) {
    const title = input.title?.trim() ?? '';
    if (title.length > 255) throw new Error('Project link title must not exceed 255 characters');
    const url = new URL(input.url.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error('Project links require an HTTP(S) URL without credentials');
    if (url.href.length > 8192) throw new Error('Project link URL is too long');
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), this.manageable()))
        .for('update')
        .limit(1);
      if (!project) return null;
      if (input.id) {
        const [link] = await tx
          .update(projectLinks)
          .set({ title, url: url.href, updatedAt: new Date() })
          .where(and(eq(projectLinks.id, input.id), eq(projectLinks.projectId, projectId)))
          .returning();
        return link ?? null;
      }
      const [link] = await tx
        .insert(projectLinks)
        .values({ projectId, title, url: url.href, addedByUserId: this.userId })
        .returning();
      return link;
    });
  }

  async removeLink(projectId: string, linkId: string) {
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), this.manageable()))
        .for('update')
        .limit(1);
      if (!project) return null;
      const [link] = await tx
        .delete(projectLinks)
        .where(and(eq(projectLinks.projectId, projectId), eq(projectLinks.id, linkId)))
        .returning();
      return link ?? null;
    });
  }

  async createUpdate(
    projectId: string,
    input: { body: string; health?: ProjectHealth; kind?: ProjectUpdateKind },
  ) {
    if (!(await this.findById(projectId))) return null;
    const kind = input.kind ?? 'update';
    const health = kind === 'update' ? (input.health ?? 'onTrack') : null;
    return this.db.transaction(async (tx) => {
      const db = tx as OrviloDatabase;
      const [update] = await db
        .insert(projectUpdates)
        .values({
          body: input.body,
          health,
          kind,
          projectId,
          userId: this.userId,
        })
        .returning();
      // Only real status updates move the project's denormalized health.
      if (health !== null) {
        await db
          .update(projects)
          .set({ health, updatedAt: new Date() })
          .where(eq(projects.id, projectId));
      }
      return update;
    });
  }
}
