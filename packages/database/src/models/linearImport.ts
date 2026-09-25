import { randomUUID } from 'node:crypto';

import type { LinearIssueSnapshot, TaskWorkflowCategory } from '@orvilo/types';
import { and, eq, gt, lt, or, sql } from 'drizzle-orm';

import { linearImportJobs, linearImportReceipts, linearIssueLinks, projects } from '../schemas';
import type { LinearImportMapping } from '../schemas/linearImport';
import type { OrviloDatabase } from '../type';
import { TaskModel } from './task';

export class LinearImportModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly workspaceId: string,
  ) {}

  async findJob(id: string) {
    const [row] = await this.db
      .select()
      .from(linearImportJobs)
      .where(and(eq(linearImportJobs.id, id), eq(linearImportJobs.workspaceId, this.workspaceId)))
      .limit(1);
    return row ?? null;
  }

  async start(input: {
    installationId: string;
    teamId: string;
    projectId: string;
    requestedByUserId: string;
    stateMappings: LinearImportMapping[];
  }) {
    const [row] = await this.db
      .insert(linearImportJobs)
      .values({
        ...input,
        workspaceId: this.workspaceId,
      })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    const [existing] = await this.db
      .select()
      .from(linearImportJobs)
      .where(
        and(
          eq(linearImportJobs.workspaceId, this.workspaceId),
          eq(linearImportJobs.installationId, input.installationId),
          eq(linearImportJobs.teamId, input.teamId),
          eq(linearImportJobs.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (!existing) throw new Error('Import job creation conflicted');
    const frozen = [...existing.stateMappings].sort((a, b) =>
      a.linearStateId.localeCompare(b.linearStateId),
    );
    const requested = [...input.stateMappings].sort((a, b) =>
      a.linearStateId.localeCompare(b.linearStateId),
    );
    if (JSON.stringify(frozen) !== JSON.stringify(requested)) {
      throw new Error(
        'This team and destination already have an import job with different state mappings',
      );
    }
    return existing;
  }

  async queue(id: string) {
    const [row] = await this.db
      .update(linearImportJobs)
      .set({
        status: 'queued',
        lastError: null,
        issuesFailed: 0,
        leaseOwner: null,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linearImportJobs.id, id),
          eq(linearImportJobs.workspaceId, this.workspaceId),
          or(
            eq(linearImportJobs.status, 'failed'),
            and(
              eq(linearImportJobs.status, 'running'),
              lt(linearImportJobs.lockedUntil, new Date()),
            ),
          ),
        ),
      )
      .returning();
    return row ?? this.findJob(id);
  }

  async claim(id: string) {
    const owner = randomUUID();
    const [row] = await this.db
      .update(linearImportJobs)
      .set({
        status: 'running',
        leaseOwner: owner,
        lockedUntil: new Date(Date.now() + 5 * 60_000),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linearImportJobs.id, id),
          eq(linearImportJobs.workspaceId, this.workspaceId),
          or(
            eq(linearImportJobs.status, 'queued'),
            and(
              eq(linearImportJobs.status, 'running'),
              lt(linearImportJobs.lockedUntil, new Date()),
            ),
          ),
        ),
      )
      .returning();
    return row ? { job: row, owner } : null;
  }

  async recordIssue(input: {
    jobId: string;
    owner: string;
    installationId: string;
    projectId: string;
    organizationName: string | null;
    organizationId: string;
    issue: LinearIssueSnapshot;
    workflowCategory: TaskWorkflowCategory;
  }): Promise<'imported' | 'skipped_sync' | 'already_imported'> {
    return this.db.transaction(async (tx) => {
      const [job] = await tx
        .select({ id: linearImportJobs.id })
        .from(linearImportJobs)
        .where(
          and(
            eq(linearImportJobs.id, input.jobId),
            eq(linearImportJobs.workspaceId, this.workspaceId),
            eq(linearImportJobs.leaseOwner, input.owner),
            eq(linearImportJobs.status, 'running'),
            gt(linearImportJobs.lockedUntil, new Date()),
          ),
        )
        .for('update')
        .limit(1);
      if (!job) throw new Error('Linear import lease was lost');
      const [existing] = await tx
        .select()
        .from(linearImportReceipts)
        .where(
          and(
            eq(linearImportReceipts.workspaceId, this.workspaceId),
            eq(linearImportReceipts.installationId, input.installationId),
            eq(linearImportReceipts.linearIssueId, input.issue.id),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.projectId !== input.projectId)
          throw new Error(
            `Linear issue ${input.issue.identifier} was already imported into another project`,
          );
        return 'already_imported';
      }
      const [project] = await tx
        .select({ id: projects.id, identifier: projects.identifier })
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
      const [liveLink] = await tx
        .select({ id: linearIssueLinks.id })
        .from(linearIssueLinks)
        .where(
          and(
            eq(linearIssueLinks.workspaceId, this.workspaceId),
            eq(linearIssueLinks.linearIssueId, input.issue.id),
          ),
        )
        .limit(1);
      // Reserve the source identity before creating a task. The reservation and
      // TaskModel create share one outer transaction; a failed create rolls both back.
      const [receipt] = await tx
        .insert(linearImportReceipts)
        .values({
          workspaceId: this.workspaceId,
          installationId: input.installationId,
          jobId: input.jobId,
          linearIssueId: input.issue.id,
          projectId: input.projectId,
          result: liveLink ? 'skipped_sync' : 'imported',
        })
        .onConflictDoNothing()
        .returning();
      if (!receipt) {
        const [raced] = await tx
          .select()
          .from(linearImportReceipts)
          .where(
            and(
              eq(linearImportReceipts.workspaceId, this.workspaceId),
              eq(linearImportReceipts.installationId, input.installationId),
              eq(linearImportReceipts.linearIssueId, input.issue.id),
            ),
          )
          .limit(1);
        if (raced?.projectId !== input.projectId)
          throw new Error(
            `Linear issue ${input.issue.identifier} was already imported into another project`,
          );
        return 'already_imported';
      }
      if (liveLink) {
        await tx
          .update(linearImportJobs)
          .set({ issuesSkipped: sql`${linearImportJobs.issuesSkipped} + 1` })
          .where(eq(linearImportJobs.id, input.jobId));
        return 'skipped_sync';
      }
      const task = await new TaskModel(
        tx as OrviloDatabase,
        `linear-installation:${input.installationId}`,
        this.workspaceId,
        { managedSubject: true },
      ).create(
        {
          description: input.issue.description?.slice(0, 255),
          identifierPrefix: project.identifier,
          instruction: input.issue.description || input.issue.title,
          name: input.issue.title,
          priority: input.issue.priority ?? 0,
          projectId: project.id,
          visibility: 'public',
          workflowCategory: input.workflowCategory,
          workflowStateId: input.issue.stateId ?? null,
        },
        {
          creationSubject: {
            id: `linear-installation:${input.installationId}`,
            kind: 'integration',
            snapshot: {
              displayName: input.organizationName || 'Linear',
              externalId: input.organizationId,
              kind: 'integration',
            },
          },
          mutation: { source: 'linear', suppressDomainEvent: true, suppressLinearOutbox: true },
          maxRetries: 1,
        },
      );
      await tx
        .update(linearImportReceipts)
        .set({ taskId: task.id })
        .where(eq(linearImportReceipts.id, receipt.id));
      await tx
        .update(linearImportJobs)
        .set({ issuesImported: sql`${linearImportJobs.issuesImported} + 1` })
        .where(eq(linearImportJobs.id, input.jobId));
      return 'imported';
    });
  }

  async completePage(input: {
    id: string;
    owner: string;
    nextCursor: string | null;
    hasNextPage: boolean;
  }) {
    const [row] = await this.db
      .update(linearImportJobs)
      .set({
        cursor: input.nextCursor,
        pagesProcessed: sql`${linearImportJobs.pagesProcessed} + 1`,
        status: input.hasNextPage ? 'queued' : 'completed',
        leaseOwner: null,
        lockedUntil: null,
        lastError: null,
        issuesFailed: 0,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linearImportJobs.id, input.id),
          eq(linearImportJobs.workspaceId, this.workspaceId),
          eq(linearImportJobs.leaseOwner, input.owner),
          eq(linearImportJobs.status, 'running'),
          gt(linearImportJobs.lockedUntil, new Date()),
        ),
      )
      .returning();
    if (!row) throw new Error('Linear import lease was lost');
    return row;
  }

  async fail(id: string, owner: string, message: string, issueFailed = false) {
    await this.db
      .update(linearImportJobs)
      .set({
        status: 'failed',
        issuesFailed: issueFailed ? 1 : 0,
        lastError: message.slice(0, 300),
        leaseOwner: null,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linearImportJobs.id, id),
          eq(linearImportJobs.workspaceId, this.workspaceId),
          eq(linearImportJobs.leaseOwner, owner),
        ),
      );
  }

  /** A page committed, but dispatching its continuation failed. Keep the cursor retryable. */
  async failQueued(id: string, message: string) {
    const [row] = await this.db
      .update(linearImportJobs)
      .set({
        status: 'failed',
        lastError: message.slice(0, 300),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linearImportJobs.id, id),
          eq(linearImportJobs.workspaceId, this.workspaceId),
          eq(linearImportJobs.status, 'queued'),
        ),
      )
      .returning();
    return row ?? null;
  }
}
