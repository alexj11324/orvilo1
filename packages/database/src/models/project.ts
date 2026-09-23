import { createProjectCoordinatorAgentConfig } from '@orvilo/builtin-agents';
import type {
  ProjectDatePrecision,
  ProjectHealth,
  ProjectMilestoneProgress,
  ProjectOrchestrationPolicy,
  ProjectPriority,
  ProjectStatus,
  ProjectUpdateKind,
  ProjectVisibility,
  TaskCreationSubjectSnapshot,
  TaskWorkflowCategory,
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
  isNotNull,
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

/** How one task's workflow category counts toward its milestone's readout. */
type MilestoneProgressBucket = 'canceled' | 'completed' | 'open' | 'unknown';

/**
 * Classify a task's workflow category for milestone progress.
 *
 * This restates `src/features/Projects/projectIssueProgress.ts` rather than
 * sharing it: that module lives in the app and cannot be imported from this
 * package. The two must agree — the project rail renders both readouts at
 * once, and a milestone that reads 50% next to a Progress card that reads
 * 40% is a bug in one of them. **A new `TaskWorkflowCategory` member has to be
 * classified in both places.**
 */
const milestoneProgressBucket = (category: TaskWorkflowCategory): MilestoneProgressBucket => {
  switch (category) {
    case 'done': {
      return 'completed';
    }
    case 'canceled': {
      return 'canceled';
    }
    case 'in_progress':
    case 'in_review':
    case 'triage':
    case 'backlog':
    case 'todo': {
      return 'open';
    }
    default: {
      // Unreachable through the type, reachable through the database. An
      // unrecognised state must not be counted as open work (that reports a
      // smaller, prettier percentage than the truth) nor as done.
      return 'unknown';
    }
  }
};

interface MilestoneTally {
  completed: number;
  /** In scope: linked tasks that are neither canceled nor unclassifiable. */
  issues: number;
  unknown: number;
}

const EMPTY_MILESTONE_TALLY: MilestoneTally = { completed: 0, issues: 0, unknown: 0 };

const tallyMilestoneCategory = (tally: MilestoneTally, category: TaskWorkflowCategory) => {
  switch (milestoneProgressBucket(category)) {
    case 'canceled': {
      // Out of scope, exactly as the project-level Progress card treats it:
      // canceled work neither counts as done nor dilutes the percentage.
      return tally;
    }
    case 'completed': {
      return { ...tally, completed: tally.completed + 1, issues: tally.issues + 1 };
    }
    case 'open': {
      return { ...tally, issues: tally.issues + 1 };
    }
    default: {
      return { ...tally, unknown: tally.unknown + 1 };
    }
  }
};

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
    const [milestones, milestoneProgress, labelRows, memberRows, edges, teamIdRows] =
      await Promise.all([
        this.db
          .select()
          .from(projectMilestones)
          .where(eq(projectMilestones.projectId, id))
          .orderBy(asc(projectMilestones.sortOrder)),
        this.listMilestoneProgress(id),
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
      milestones: milestones.map((milestone) => {
        // Three states, and `??` cannot tell the first two apart: the map only
        // holds milestones that have linked tasks, so a missing key is a real
        // zero while a present-but-`null` value means the readout could not be
        // computed. Collapsing them would print 0% over unknown work.
        if (!milestoneProgress?.has(milestone.id)) {
          return { ...milestone, progress: { completed: 0, issues: 0, percent: 0 } };
        }
        return { ...milestone, progress: milestoneProgress.get(milestone.id) ?? null };
      }),
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
        progressPercent: sql<number | null>`(
          select case
            when count(*) filter (where ${tasks.workflowCategory} not in ('triage', 'backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled')) > 0 then null
            when count(*) filter (where ${tasks.workflowCategory} <> 'canceled') = 0 then 0
            else round(
              100.0 * count(*) filter (where ${tasks.workflowCategory} = 'done') /
              count(*) filter (where ${tasks.workflowCategory} <> 'canceled')
            )::int
          end
          from ${tasks}
          where ${tasks.projectId} = ${sql.raw(`"${getTableName(projects)}"."id"`)}
            and ${this.taskReadable()}
        )`,
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

  /**
   * The project's tasks as this reader may see them. Every project task read
   * shares this scope, so a milestone readout can never count work the reader
   * is not allowed to see.
   */
  private projectTaskScope(projectId: string) {
    return and(
      eq(tasks.projectId, projectId),
      buildWorkspaceWhere(
        { userId: this.userId, workspaceId: this.workspaceId },
        {
          userId: tasks.createdByUserId,
          visibility: tasks.visibility,
          workspaceId: tasks.workspaceId,
        },
      ),
    );
  }

  async listTasks(projectId: string) {
    if (!(await this.findById(projectId))) return null;
    const rows = await this.db
      .select()
      .from(tasks)
      .where(this.projectTaskScope(projectId))
      .orderBy(asc(tasks.sortOrder), asc(tasks.seq));

    return rows;
  }

  /**
   * Completion readout for each milestone of a project, keyed by milestone id.
   *
   * ⚠️ **The denominator convention below is an unverified choice.** On the
   * reference (2026-09-22) every milestone reachable in the workspace read
   * `100%` because all 16 of its issues were Done — so whether Linear divides
   * by *all* linked issues or only by completed ones **cannot be observed
   * there**; both conventions produce 100% on that data. Do not read the
   * choice below as a verified parity claim.
   *
   * Chosen: divide by every linked issue that is in scope, `completed / issues`
   * — the convention that can produce a number other than 0% or 100%. The
   * alternatives were rejected for cause: "completed only" is degenerate
   * (always 100%, so it can never disagree with the reference or with itself),
   * and it would make the readout indistinguishable from a milestone with one
   * done issue and twenty open ones. Canceled issues leave the denominator
   * entirely, which is how the project-level Progress card on the same rail
   * already counts scope (`src/features/Projects/projectIssueProgress.ts`).
   *
   * The map holds one entry per milestone that has linked tasks; a milestone
   * with none is absent (callers rendering a fixed milestone list read that as
   * `{ completed: 0, issues: 0, percent: 0 }` — an honest zero, not a
   * placeholder). A linked task whose workflow category this build cannot
   * classify makes its milestone read `null`: unavailable beats a number that
   * silently drops the row.
   *
   * No surface renders this yet — deliberately: the readout belongs with the
   * `<a>` that points at the milestone-filtered issue list, so both land in
   * that page's task. `ProjectMilestoneProgress` carries the full reasoning.
   */
  async listMilestoneProgress(projectId: string) {
    if (!(await this.findById(projectId))) return null;
    const rows = await this.db
      .select({ category: tasks.workflowCategory, milestoneId: tasks.projectMilestoneId })
      .from(tasks)
      .where(and(this.projectTaskScope(projectId), isNotNull(tasks.projectMilestoneId)));

    const tallies = rows.reduce((acc, row) => {
      if (!row.milestoneId) return acc;
      const tally = tallyMilestoneCategory(
        acc.get(row.milestoneId) ?? EMPTY_MILESTONE_TALLY,
        row.category,
      );
      return acc.set(row.milestoneId, tally);
    }, new Map<string, MilestoneTally>());

    return new Map<string, ProjectMilestoneProgress | null>(
      [...tallies].map(([milestoneId, tally]) => [
        milestoneId,
        tally.unknown > 0
          ? null
          : {
              completed: tally.completed,
              issues: tally.issues,
              percent: tally.issues === 0 ? 0 : Math.round((tally.completed / tally.issues) * 100),
            },
      ]),
    );
  }

  /**
   * Attach a task to one of its project's milestones, or clear the link with
   * `milestoneId: null`. A task belongs to at most one milestone, so this
   * replaces whatever was there.
   *
   * Returns `null` when the project is not the caller's to manage, matching
   * `moveTaskTree`. Cross-project links are rejected rather than stored: the
   * milestone has to belong to the same project as the task, or a project's
   * readout would count work filed elsewhere.
   *
   * ⚠️ **Known inconsistency:** this writes `tasks` directly and so skips the
   * domain accounting `TaskModel.update` performs — no `domainRevision` bump,
   * no `task.*` domain event, no Linear-sync outbox row, and
   * `projectMilestoneId` is absent from `TASK_DOMAIN_COLUMNS`. That matches
   * `moveTaskTree`, which moves a task between projects the same way, and it
   * is recorded rather than fixed because the fix belongs in `models/task.ts`
   * (planning/Linear-sync territory) and should land once for both callers.
   */
  async setTaskMilestone(input: { milestoneId: string | null; projectId: string; taskId: string }) {
    const { milestoneId, projectId, taskId } = input;
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), this.manageable()))
        .for('update')
        .limit(1);
      if (!project) return null;

      const [task] = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), this.projectTaskScope(projectId)))
        .limit(1);
      if (!task) throw new Error('Task not found');

      if (milestoneId) {
        const [milestone] = await tx
          .select({ id: projectMilestones.id })
          .from(projectMilestones)
          .where(
            and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.projectId, projectId)),
          )
          .limit(1);
        if (!milestone) throw new Error('Milestone is not available in this project');
      }

      const [updated] = await tx
        .update(tasks)
        .set({ projectMilestoneId: milestoneId, updatedAt: new Date() })
        .where(and(eq(tasks.id, taskId), this.projectTaskScope(projectId)))
        .returning();
      return updated ?? null;
    });
  }

  /**
   * Create a milestone inside one of the caller's manageable projects.
   *
   * Returns `null` when the project is not the caller's to manage, matching
   * `setTaskMilestone`. `sortOrder` defaults to one past the current last
   * milestone so a created row lands at the bottom of the overview list —
   * the same place Linear's `+ Milestone` button appends.
   */
  async createMilestone(
    projectId: string,
    input: { date?: string | null; description?: string | null; name: string; sortOrder?: number },
  ) {
    const name = input.name.trim();
    if (!name) throw new Error('Milestone name is required');
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), this.manageable()))
        .for('update')
        .limit(1);
      if (!project) return null;

      let sortOrder = input.sortOrder;
      if (sortOrder === undefined) {
        const [row] = await tx
          .select({ value: max(projectMilestones.sortOrder) })
          .from(projectMilestones)
          .where(eq(projectMilestones.projectId, projectId));
        sortOrder = (row?.value ?? -1) + 1;
      }

      const [milestone] = await tx
        .insert(projectMilestones)
        .values({
          date: input.date ?? null,
          description: input.description?.trim() || null,
          name,
          projectId,
          sortOrder,
        })
        .returning();
      return milestone ?? null;
    });
  }

  /**
   * Update a milestone's name, description, or target date. `undefined`
   * leaves a field untouched; `null` clears `description`/`date`.
   *
   * Returns `null` when the project is not manageable or the milestone does
   * not belong to it — a milestone id taken from another project must not
   * leak its existence, the same read `findManageableById` applies.
   */
  async updateMilestone(
    projectId: string,
    milestoneId: string,
    input: { date?: string | null; description?: string | null; name?: string },
  ) {
    const name = input.name?.trim();
    if (name !== undefined && !name) throw new Error('Milestone name is required');
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), this.manageable()))
        .for('update')
        .limit(1);
      if (!project) return null;

      const [milestone] = await tx
        .update(projectMilestones)
        .set({
          ...(input.date !== undefined ? { date: input.date } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(name !== undefined ? { name } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.projectId, projectId)),
        )
        .returning();
      return milestone ?? null;
    });
  }

  /**
   * Delete a milestone. Tasks linked to it keep their place in the project —
   * `tasks.projectMilestoneId` is `onDelete: 'set null'`, so they land in the
   * "No milestone" bucket rather than being removed with the milestone.
   */
  async deleteMilestone(projectId: string, milestoneId: string) {
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), this.manageable()))
        .for('update')
        .limit(1);
      if (!project) return null;

      const deleted = await tx
        .delete(projectMilestones)
        .where(
          and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.projectId, projectId)),
        )
        .returning({ id: projectMilestones.id });
      return deleted.length > 0;
    });
  }

  /**
   * Persist the overview's milestone order. `milestoneIds` must be a full
   * permutation of the project's milestones — a partial list would leave the
   * omitted rows sharing stale sort keys, and a foreign id would silently
   * reorder another project's card. Stale clients get an error, not a
   * half-applied order.
   */
  async reorderMilestones(projectId: string, milestoneIds: string[]) {
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), this.manageable()))
        .for('update')
        .limit(1);
      if (!project) return null;

      const existing = await tx
        .select({ id: projectMilestones.id })
        .from(projectMilestones)
        .where(eq(projectMilestones.projectId, projectId));
      const existingIds = new Set(existing.map(({ id }) => id));
      if (
        milestoneIds.length !== existingIds.size ||
        milestoneIds.some((id) => !existingIds.has(id))
      ) {
        throw new Error('Milestone order does not match this project');
      }

      await Promise.all(
        milestoneIds.map((id, sortOrder) =>
          tx
            .update(projectMilestones)
            .set({ sortOrder, updatedAt: new Date() })
            .where(and(eq(projectMilestones.id, id), eq(projectMilestones.projectId, projectId))),
        ),
      );

      return tx
        .select()
        .from(projectMilestones)
        .where(eq(projectMilestones.projectId, projectId))
        .orderBy(asc(projectMilestones.sortOrder));
    });
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
