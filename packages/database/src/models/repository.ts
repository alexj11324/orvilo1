import type {
  AssociationDecisionItem,
  AssociationDecisionStatus,
  AssociationEvidence,
  AssociationRelationKind,
  AssociationSource,
  AssociationSourceKind,
  CheckoutRemoteRole,
  RepositoryCoordinate,
  RepositoryItem,
  RepositoryResolution,
  RepositoryStatus,
} from '@orvilo/types';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import {
  associationDecisions,
  projectRepositories,
  repositories,
  repositoryCheckouts,
  teamRepoDefaults,
} from '../schemas/repository';
import { tasks } from '../schemas/task';
import type { LobeChatDatabase } from '../type';

const toRepositoryItem = (row: typeof repositories.$inferSelect): RepositoryItem =>
  row as RepositoryItem;
const toDecisionItem = (row: typeof associationDecisions.$inferSelect): AssociationDecisionItem =>
  row as AssociationDecisionItem;

/**
 * Repository + association domain model (linear-workspace-v3, WM-06/07).
 *
 * Repositories are shared workspace code resources — never execution grants.
 * Checkouts record authorized local copies; association decisions make every
 * link auditable (evidence + input/policy/decision revisions). Resolution
 * follows the deterministic precedence frozen in `RepositoryResolution`.
 */
export class RepositoryModel {
  constructor(
    private readonly db: LobeChatDatabase,
    private readonly userId: string,
    private readonly workspaceId: string,
  ) {}

  // ── Repository identity ────────────────────────────────────────────────

  /**
   * Upsert by verified remote identity `(providerHost, remoteRepositoryId)`.
   * Callers must have verified the remote id through the provider API —
   * coordinates (owner/name/url) are snapshots, never identity.
   */
  upsertByRemoteIdentity = async (params: {
    coordinate: RepositoryCoordinate;
    isFork?: boolean;
    parentCoordinate?: RepositoryCoordinate | null;
    providerHost: string;
    remoteRepositoryId: string;
    status?: RepositoryStatus;
  }) => {
    const [row] = await this.db
      .insert(repositories)
      .values({
        coordinate: params.coordinate,
        isFork: params.isFork ?? false,
        parentCoordinate: params.parentCoordinate ?? null,
        providerHost: params.providerHost,
        registeredByUserId: this.userId,
        remoteRepositoryId: params.remoteRepositoryId,
        status: params.status ?? 'active',
        workspaceId: this.workspaceId,
      })
      .onConflictDoUpdate({
        set: {
          coordinate: params.coordinate,
          isFork: params.isFork ?? false,
          lastVerifiedAt: new Date(),
          parentCoordinate: params.parentCoordinate ?? null,
          status: params.status ?? 'active',
        },
        target: [
          repositories.workspaceId,
          repositories.providerHost,
          repositories.remoteRepositoryId,
        ],
      })
      .returning();
    return toRepositoryItem(row);
  };

  /** Register a local-only repository (no verified remote). */
  createLocalOnly = async (params: {
    coordinate: RepositoryCoordinate;
    localOnlyKey: string;
    providerHost?: string;
  }) => {
    const [row] = await this.db
      .insert(repositories)
      .values({
        coordinate: params.coordinate,
        localOnlyKey: params.localOnlyKey,
        providerHost: params.providerHost ?? 'local',
        registeredByUserId: this.userId,
        status: 'active',
        workspaceId: this.workspaceId,
      })
      .onConflictDoUpdate({
        set: { coordinate: params.coordinate },
        target: [repositories.workspaceId, repositories.localOnlyKey],
      })
      .returning();
    return toRepositoryItem(row);
  };

  findById = async (repositoryId: string): Promise<RepositoryItem | null> => {
    const [row] = await this.db
      .select()
      .from(repositories)
      .where(and(eq(repositories.id, repositoryId), eq(repositories.workspaceId, this.workspaceId)))
      .limit(1);
    return row ? toRepositoryItem(row) : null;
  };

  findByRemoteId = async (
    providerHost: string,
    remoteRepositoryId: string,
  ): Promise<RepositoryItem | null> => {
    const [row] = await this.db
      .select()
      .from(repositories)
      .where(
        and(
          eq(repositories.workspaceId, this.workspaceId),
          eq(repositories.providerHost, providerHost),
          eq(repositories.remoteRepositoryId, remoteRepositoryId),
        ),
      )
      .limit(1);
    return row ? toRepositoryItem(row) : null;
  };

  listByWorkspace = async (): Promise<RepositoryItem[]> => {
    const rows = await this.db
      .select()
      .from(repositories)
      .where(eq(repositories.workspaceId, this.workspaceId))
      .orderBy(asc(repositories.createdAt));
    return rows.map(toRepositoryItem);
  };

  // ── Checkouts (authorized local copies) ────────────────────────────────

  /**
   * Record an authorized local checkout. `canonicalPath` stays server-side —
   * callers must never publish it into external descriptions. Registering a
   * checkout grants no execution or push rights.
   */
  registerCheckout = async (params: {
    canonicalPath: string;
    deviceId?: string | null;
    remoteRepositoryId?: string | null;
    remoteRole?: CheckoutRemoteRole;
    remoteUrl?: string | null;
    repositoryId: string;
  }) => {
    const [row] = await this.db
      .insert(repositoryCheckouts)
      .values({
        authorizedByUserId: this.userId,
        canonicalPath: params.canonicalPath,
        deviceId: params.deviceId ?? null,
        lastVerifiedAt: new Date(),
        remoteRepositoryId: params.remoteRepositoryId ?? null,
        remoteRole: params.remoteRole ?? 'origin',
        remoteUrl: params.remoteUrl ?? null,
        repositoryId: params.repositoryId,
        status: 'active',
        workspaceId: this.workspaceId,
      })
      .onConflictDoUpdate({
        set: {
          lastVerifiedAt: new Date(),
          remoteRepositoryId: params.remoteRepositoryId ?? null,
          remoteRole: params.remoteRole ?? 'origin',
          remoteUrl: params.remoteUrl ?? null,
          status: 'active',
        },
        target: [repositoryCheckouts.deviceId, repositoryCheckouts.canonicalPath],
      })
      .returning();
    return row;
  };

  revokeCheckout = async (checkoutId: string) => {
    const [row] = await this.db
      .update(repositoryCheckouts)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(repositoryCheckouts.id, checkoutId),
          eq(repositoryCheckouts.workspaceId, this.workspaceId),
        ),
      )
      .returning();
    return row ?? null;
  };

  listCheckouts = async (repositoryId: string) => {
    return this.db
      .select()
      .from(repositoryCheckouts)
      .where(
        and(
          eq(repositoryCheckouts.repositoryId, repositoryId),
          eq(repositoryCheckouts.workspaceId, this.workspaceId),
          eq(repositoryCheckouts.status, 'active'),
        ),
      );
  };

  // ── Direct links (applied facts) ───────────────────────────────────────

  linkProject = async (projectId: string, repositoryId: string) => {
    await this.db
      .insert(projectRepositories)
      .values({
        addedByUserId: this.userId,
        projectId,
        repositoryId,
        workspaceId: this.workspaceId,
      })
      .onConflictDoNothing({
        target: [projectRepositories.projectId, projectRepositories.repositoryId],
      });
  };

  unlinkProject = async (projectId: string, repositoryId: string) => {
    await this.db
      .delete(projectRepositories)
      .where(
        and(
          eq(projectRepositories.projectId, projectId),
          eq(projectRepositories.repositoryId, repositoryId),
          eq(projectRepositories.workspaceId, this.workspaceId),
        ),
      );
  };

  setTeamDefault = async (teamId: string, repositoryId: string, isPrimary = false) => {
    await this.db.transaction(async (tx) => {
      if (isPrimary) {
        await tx
          .update(teamRepoDefaults)
          .set({ isPrimary: false })
          .where(and(eq(teamRepoDefaults.teamId, teamId), eq(teamRepoDefaults.isPrimary, true)));
      }
      await tx
        .insert(teamRepoDefaults)
        .values({
          addedByUserId: this.userId,
          isPrimary,
          repositoryId,
          teamId,
          workspaceId: this.workspaceId,
        })
        .onConflictDoUpdate({
          set: { isPrimary },
          target: [teamRepoDefaults.teamId, teamRepoDefaults.repositoryId],
        });
    });
  };

  // ── Association decisions (auditable) ──────────────────────────────────

  proposeAssociation = async (params: {
    confidence?: number | null;
    evidence: AssociationEvidence[];
    idempotencyKey: string;
    inputRevision?: number;
    policyRevision?: number;
    relation: AssociationRelationKind;
    source: AssociationSource;
    sourceId: string;
    sourceKind: AssociationSourceKind;
    status?: AssociationDecisionStatus;
    targetRepositoryId: string;
  }) => {
    const [row] = await this.db
      .insert(associationDecisions)
      .values({
        confidence: params.confidence ?? null,
        decidedAt: params.status === 'applied' ? new Date() : null,
        decidedByUserId: params.status === 'applied' ? this.userId : null,
        evidence: params.evidence,
        idempotencyKey: params.idempotencyKey,
        inputRevision: params.inputRevision ?? 0,
        policyRevision: params.policyRevision ?? 1,
        relation: params.relation,
        source: params.source,
        sourceId: params.sourceId,
        sourceKind: params.sourceKind,
        status: params.status ?? 'proposed',
        targetRepositoryId: params.targetRepositoryId,
        workspaceId: this.workspaceId,
      })
      .onConflictDoNothing({
        target: [associationDecisions.workspaceId, associationDecisions.idempotencyKey],
      })
      .returning();
    if (!row) {
      const [existing] = await this.db
        .select()
        .from(associationDecisions)
        .where(
          and(
            eq(associationDecisions.workspaceId, this.workspaceId),
            eq(associationDecisions.idempotencyKey, params.idempotencyKey),
          ),
        )
        .limit(1);
      return existing ? toDecisionItem(existing) : null;
    }
    return toDecisionItem(row);
  };

  private transitionDecision = async (
    decisionId: string,
    status: AssociationDecisionStatus,
    resolutionNote?: string,
  ) => {
    const [row] = await this.db
      .update(associationDecisions)
      .set({
        decidedAt: status === 'applied' ? new Date() : null,
        decidedByUserId: status === 'applied' ? this.userId : null,
        decisionRevision: sql`${associationDecisions.decisionRevision} + 1`,
        resolutionNote: resolutionNote ?? null,
        revokedAt: status === 'revoked' ? new Date() : null,
        status,
      })
      .where(
        and(
          eq(associationDecisions.id, decisionId),
          eq(associationDecisions.workspaceId, this.workspaceId),
        ),
      )
      .returning();
    return row ? toDecisionItem(row) : null;
  };

  /**
   * Apply a proposed decision: write the relation row and mark the decision
   * applied in one transaction. Deterministic sources may apply directly;
   * semantic sources land revocably (the revoke path removes the link again).
   */
  applyAssociation = async (decisionId: string) => {
    return this.db.transaction(async (tx) => {
      const [decision] = await tx
        .select()
        .from(associationDecisions)
        .where(
          and(
            eq(associationDecisions.id, decisionId),
            eq(associationDecisions.workspaceId, this.workspaceId),
          ),
        )
        .limit(1);
      if (!decision) return null;
      if (decision.status === 'applied') return toDecisionItem(decision);

      if (decision.relation === 'project_repository' && decision.sourceKind === 'project') {
        await tx
          .insert(projectRepositories)
          .values({
            addedByUserId: this.userId,
            projectId: decision.sourceId,
            repositoryId: decision.targetRepositoryId,
            workspaceId: this.workspaceId,
          })
          .onConflictDoNothing({
            target: [projectRepositories.projectId, projectRepositories.repositoryId],
          });
      }
      if (decision.relation === 'team_repository_default' && decision.sourceKind === 'team') {
        await tx
          .insert(teamRepoDefaults)
          .values({
            addedByUserId: this.userId,
            repositoryId: decision.targetRepositoryId,
            teamId: decision.sourceId,
            workspaceId: this.workspaceId,
          })
          .onConflictDoNothing({
            target: [teamRepoDefaults.teamId, teamRepoDefaults.repositoryId],
          });
      }

      const [updated] = await tx
        .update(associationDecisions)
        .set({
          decidedAt: new Date(),
          decidedByUserId: this.userId,
          decisionRevision: sql`${associationDecisions.decisionRevision} + 1`,
          status: 'applied',
        })
        .where(eq(associationDecisions.id, decisionId))
        .returning();
      return updated ? toDecisionItem(updated) : null;
    });
  };

  rejectAssociation = async (decisionId: string, resolutionNote?: string) => {
    return this.transitionDecision(decisionId, 'rejected', resolutionNote);
  };

  /** Revoke an applied decision — removes the relation row it wrote. */
  revokeAssociation = async (decisionId: string, resolutionNote?: string) => {
    return this.db.transaction(async (tx) => {
      const [decision] = await tx
        .select()
        .from(associationDecisions)
        .where(
          and(
            eq(associationDecisions.id, decisionId),
            eq(associationDecisions.workspaceId, this.workspaceId),
            eq(associationDecisions.status, 'applied'),
          ),
        )
        .limit(1);
      if (!decision) return null;

      if (decision.relation === 'project_repository' && decision.sourceKind === 'project') {
        await tx
          .delete(projectRepositories)
          .where(
            and(
              eq(projectRepositories.projectId, decision.sourceId),
              eq(projectRepositories.repositoryId, decision.targetRepositoryId),
              eq(projectRepositories.workspaceId, this.workspaceId),
            ),
          );
      }
      if (decision.relation === 'team_repository_default' && decision.sourceKind === 'team') {
        await tx
          .delete(teamRepoDefaults)
          .where(
            and(
              eq(teamRepoDefaults.teamId, decision.sourceId),
              eq(teamRepoDefaults.repositoryId, decision.targetRepositoryId),
              eq(teamRepoDefaults.workspaceId, this.workspaceId),
            ),
          );
      }

      const [updated] = await tx
        .update(associationDecisions)
        .set({
          decisionRevision: sql`${associationDecisions.decisionRevision} + 1`,
          resolutionNote: resolutionNote ?? null,
          revokedAt: new Date(),
          status: 'revoked',
        })
        .where(eq(associationDecisions.id, decisionId))
        .returning();
      return updated ? toDecisionItem(updated) : null;
    });
  };

  listDecisions = async (params: {
    sourceId?: string;
    sourceKind?: AssociationSourceKind;
    status?: AssociationDecisionStatus;
  }) => {
    const rows = await this.db
      .select()
      .from(associationDecisions)
      .where(
        and(
          eq(associationDecisions.workspaceId, this.workspaceId),
          params.sourceKind ? eq(associationDecisions.sourceKind, params.sourceKind) : undefined,
          params.sourceId ? eq(associationDecisions.sourceId, params.sourceId) : undefined,
          params.status ? eq(associationDecisions.status, params.status) : undefined,
        ),
      )
      .orderBy(desc(associationDecisions.createdAt));
    return rows.map(toDecisionItem);
  };

  // ── Deterministic execution-resource resolution ────────────────────────

  /**
   * Precedence (frozen contract): explicit task target → confirmed primary
   * project repository → confirmed team default → approved candidates.
   * `ambiguous`/`unresolved` block — never silently pick the first candidate.
   */
  resolveForTask = async (taskId: string): Promise<RepositoryResolution> => {
    const [task] = await this.db
      .select({ id: tasks.id, projectId: tasks.projectId, teamId: tasks.teamId })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, this.workspaceId)))
      .limit(1);
    if (!task) return { candidates: [], ok: false, reason: 'unresolved' };

    const appliedCandidates = async (
      sourceKind: AssociationSourceKind,
      sourceId: string,
    ): Promise<string[]> => {
      const rows = await this.db
        .select({ targetRepositoryId: associationDecisions.targetRepositoryId })
        .from(associationDecisions)
        .where(
          and(
            eq(associationDecisions.workspaceId, this.workspaceId),
            eq(associationDecisions.sourceKind, sourceKind),
            eq(associationDecisions.sourceId, sourceId),
            eq(associationDecisions.status, 'applied'),
          ),
        );
      return rows.map((r) => r.targetRepositoryId);
    };

    // 1. Explicit task target.
    const taskCandidates = await appliedCandidates('task', task.id);
    if (taskCandidates.length === 1) {
      return { ok: true, repositoryId: taskCandidates[0], source: 'task' };
    }
    if (taskCandidates.length > 1) {
      return { candidates: taskCandidates, ok: false, reason: 'ambiguous' };
    }

    // 2. Confirmed primary project repository.
    if (task.projectId) {
      const projectRows = await this.db
        .select({ repositoryId: projectRepositories.repositoryId })
        .from(projectRepositories)
        .where(
          and(
            eq(projectRepositories.projectId, task.projectId),
            eq(projectRepositories.workspaceId, this.workspaceId),
          ),
        );
      if (projectRows.length === 1) {
        return { ok: true, repositoryId: projectRows[0].repositoryId, source: 'project' };
      }
      if (projectRows.length > 1) {
        return {
          candidates: projectRows.map((r) => r.repositoryId),
          ok: false,
          reason: 'ambiguous',
        };
      }
    }

    // 3. Confirmed team default (primary first, then single default).
    if (task.teamId) {
      const defaults = await this.db
        .select({
          repositoryId: teamRepoDefaults.repositoryId,
          isPrimary: teamRepoDefaults.isPrimary,
        })
        .from(teamRepoDefaults)
        .where(
          and(
            eq(teamRepoDefaults.teamId, task.teamId),
            eq(teamRepoDefaults.workspaceId, this.workspaceId),
          ),
        )
        .orderBy(desc(teamRepoDefaults.isPrimary), asc(teamRepoDefaults.sortOrder));
      const primary = defaults.find((d) => d.isPrimary);
      if (primary) return { ok: true, repositoryId: primary.repositoryId, source: 'team' };
      if (defaults.length === 1) {
        return { ok: true, repositoryId: defaults[0].repositoryId, source: 'team' };
      }
      if (defaults.length > 1) {
        return {
          candidates: defaults.map((d) => d.repositoryId),
          ok: false,
          reason: 'ambiguous',
        };
      }
    }

    // 4. Approved candidates from any source object.
    const candidates = new Set<string>([
      ...(task.projectId ? await appliedCandidates('project', task.projectId) : []),
      ...(task.teamId ? await appliedCandidates('team', task.teamId) : []),
    ]);
    if (candidates.size === 1) {
      return { ok: true, repositoryId: [...candidates][0], source: 'single_candidate' };
    }
    if (candidates.size > 1) {
      return { candidates: [...candidates], ok: false, reason: 'ambiguous' };
    }
    return { candidates: [], ok: false, reason: 'unresolved' };
  };
}
