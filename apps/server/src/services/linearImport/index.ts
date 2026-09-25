import type { LinearTeamSnapshot, TaskWorkflowCategory } from '@orvilo/types';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';

import { LinearImportModel } from '@/database/models/linearImport';
import { LinearSyncModel } from '@/database/models/linearSync';
import { projects } from '@/database/schemas/project';
import type { OrviloDatabase } from '@/database/type';
import { createLinearGraphqlIssueProvider } from '@/server/services/linearSync/provider';

export const LINEAR_IMPORT_CATEGORIES = [
  'backlog',
  'todo',
  'in_progress',
  'done',
  'canceled',
] as const satisfies readonly TaskWorkflowCategory[];

const allowedImportCategories = new Set<TaskWorkflowCategory>(LINEAR_IMPORT_CATEGORIES);

export type StateMapping = { linearStateId: string; workflowCategory: TaskWorkflowCategory };

export const suggestCategory = (type: string | null): TaskWorkflowCategory => {
  switch (type?.toLowerCase()) {
    case 'started': {
      return 'in_progress';
    }
    case 'completed': {
      return 'done';
    }
    case 'canceled': {
      return 'canceled';
    }
    case 'unstarted': {
      return 'todo';
    }
    case 'triage': {
      return 'backlog';
    }
    default: {
      return 'backlog';
    }
  }
};

export class LinearImportService {
  private readonly jobs: LinearImportModel;
  private readonly sync: LinearSyncModel;

  constructor(
    private readonly db: OrviloDatabase,
    private readonly workspaceId: string,
  ) {
    this.jobs = new LinearImportModel(db, workspaceId);
    this.sync = new LinearSyncModel(db, workspaceId);
  }

  private async source(installationId: string, teamId: string) {
    const installation = await this.sync.findInstallationById(installationId);
    if (!installation || installation.status !== 'active')
      throw new Error('Linear installation is unavailable');
    const provider = createLinearGraphqlIssueProvider({
      db: this.db,
      workspaceId: this.workspaceId,
      installationId,
      organizationId: installation.organizationId,
    });
    const team = (await provider.listTeams()).find((candidate) => candidate.id === teamId);
    if (
      !team ||
      team.organizationId !== installation.organizationId ||
      team.visibility !== 'public'
    ) {
      throw new Error('Select a public Linear team in the connected organization');
    }
    return { installation, provider, team };
  }

  async preview(installationId: string, teamId: string) {
    const { provider, team } = await this.source(installationId, teamId);
    const page = await provider.listTeamIssues(teamId, 50);
    return {
      team: { id: team.id, key: team.key, name: team.name },
      states: (team.workflowStates ?? []).map((state) => ({
        id: state.id,
        name: state.name,
        type: state.type,
        suggestedCategory: suggestCategory(state.type),
      })),
      counts: { issues: page.issues.length, exact: !page.hasNextPage },
    };
  }

  /** The router limits this to workspace admins, who can manage public projects. */
  async destinations(input: { search?: string; offset: number; limit: number }) {
    const search = input.search?.trim();
    const pattern = search ? `%${search}%` : undefined;
    const rows = await this.db
      .select({ id: projects.id, name: projects.name, identifier: projects.identifier })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, this.workspaceId),
          eq(projects.visibility, 'public'),
          sql`${projects.isDeleted} IS NOT TRUE`,
          pattern
            ? or(ilike(projects.name, pattern), ilike(projects.identifier, pattern))
            : undefined,
        ),
      )
      .orderBy(asc(projects.name), asc(projects.id))
      .limit(input.limit + 1)
      .offset(input.offset);
    const hasMore = rows.length > input.limit;
    return {
      items: rows.slice(0, input.limit),
      nextOffset: hasMore ? input.offset + input.limit : null,
    };
  }

  private validateMappings(team: LinearTeamSnapshot, mappings: StateMapping[]) {
    const stateIds = (team.workflowStates ?? []).map((state) => state.id);
    const mapped = mappings.map((mapping) => mapping.linearStateId);
    if (
      mapped.length !== stateIds.length ||
      new Set(mapped).size !== stateIds.length ||
      stateIds.some((id) => !mapped.includes(id))
    ) {
      throw new Error('Every Linear team state must have exactly one mapping');
    }
    if (mappings.some((mapping) => !allowedImportCategories.has(mapping.workflowCategory))) {
      throw new Error('Unsupported workflow category');
    }
  }

  async start(input: {
    installationId: string;
    teamId: string;
    projectId: string;
    requestedByUserId: string;
    stateMappings: StateMapping[];
  }) {
    const { team } = await this.source(input.installationId, input.teamId);
    this.validateMappings(team, input.stateMappings);
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.workspaceId, this.workspaceId),
          eq(projects.visibility, 'public'),
          sql`${projects.isDeleted} IS NOT TRUE`,
        ),
      )
      .limit(1);
    if (!project) throw new Error('Destination project is unavailable');
    return this.jobs.start(input);
  }

  status(jobId: string) {
    return this.jobs.findJob(jobId);
  }

  async resume(jobId: string) {
    const job = await this.jobs.findJob(jobId);
    if (!job) throw new Error('Linear import job not found');
    if (job.status === 'completed' || job.status === 'queued') return job;
    if (job.status === 'running' && job.lockedUntil && job.lockedUntil > new Date()) return job;
    return this.jobs.queue(jobId);
  }
}
