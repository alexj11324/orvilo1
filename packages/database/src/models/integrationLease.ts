import type { IntegrationLeasePhase } from '@orvilo/types';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';

import type { IntegrationLeaseItem } from '../schemas';
import { integrationLeases } from '../schemas';
import type { OrviloDatabase } from '../type';

export interface RepoRefLeaseAcquireParams {
  deadline: Date;
  expectedBaseSha?: string;
  expectedHeadSha?: string;
  /** Serialized unique key: `${scope}:${target}#${ref}`. */
  key: string;
  ownerTaskId?: string;
  ownerToken: string;
  ownerTopicId?: string;
  ref: string;
  target: string;
  workspaceId?: string;
}

export interface RepoRefLeaseAcquireResult {
  /** Row claimed by this call. Absent while another owner holds a live lease. */
  lease?: IntegrationLeaseItem;
  /**
   * Row evicted by the claim (expired or released). When it carries
   * `outcomeUnknown` the caller must reconcile the remote before writing.
   */
  prior?: IntegrationLeaseItem;
}

/**
 * IntegrationLeaseModel — the durable repo/ref lease behind
 * `TaskIntegrationService.withRepoRefLease` (R02). The claim is a single
 * upsert whose conflict WHERE only fires on a dead or released row, so no
 * transaction or connection is held across remote I/O; ownership is fenced by
 * `ownerToken` and a heartbeat `deadline`.
 */
export class IntegrationLeaseModel {
  private db: OrviloDatabase;

  constructor(db: OrviloDatabase) {
    this.db = db;
  }

  /**
   * Claim `key` for `ownerToken`. Race-safe: the conflict update only lands on
   * an expired (`deadline < now`) or cleanly released row, evaluated against
   * the conflicting row at write time — concurrent claimants cannot both win.
   */
  acquire = async (params: RepoRefLeaseAcquireParams): Promise<RepoRefLeaseAcquireResult> => {
    const prior = await this.db.query.integrationLeases.findFirst({
      where: eq(integrationLeases.key, params.key),
    });

    const rows = await this.db
      .insert(integrationLeases)
      .values({
        deadline: params.deadline,
        expectedBaseSha: params.expectedBaseSha,
        expectedHeadSha: params.expectedHeadSha,
        key: params.key,
        ownerTaskId: params.ownerTaskId,
        ownerToken: params.ownerToken,
        ownerTopicId: params.ownerTopicId,
        phase: 'claimed',
        ref: params.ref,
        target: params.target,
        workspaceId: params.workspaceId,
      })
      .onConflictDoUpdate({
        set: {
          context: null,
          deadline: params.deadline,
          expectedBaseSha: params.expectedBaseSha,
          expectedHeadSha: params.expectedHeadSha,
          outcomeUnknown: false,
          ownerTaskId: params.ownerTaskId,
          ownerToken: params.ownerToken,
          ownerTopicId: params.ownerTopicId,
          phase: 'claimed',
          releasedAt: null,
        },
        target: integrationLeases.key,
        where: or(
          lt(integrationLeases.deadline, sql`now()`),
          sql`${integrationLeases.releasedAt} IS NOT NULL`,
          eq(integrationLeases.ownerToken, params.ownerToken),
        ),
      })
      .returning();

    if (rows.length === 0) return { prior };
    const lease = rows[0];
    return { lease, prior: prior && prior.ownerToken !== params.ownerToken ? prior : undefined };
  };

  /**
   * Renew the deadline and record the in-flight phase — doubles as the fence:
   * returns false once the row was stolen or released so the holder must stop
   * before its next remote write.
   */
  renew = async (
    id: string,
    ownerToken: string,
    deadline: Date,
    phase?: IntegrationLeasePhase,
  ): Promise<boolean> => {
    const rows = await this.db
      .update(integrationLeases)
      .set({
        deadline,
        ...(phase ? { phase } : {}),
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(integrationLeases.id, id),
          eq(integrationLeases.ownerToken, ownerToken),
          isNull(integrationLeases.releasedAt),
        ),
      )
      .returning({ id: integrationLeases.id });
    return rows.length > 0;
  };

  /**
   * Clean release — the next claimant inherits no ambiguity. When the release
   * itself fails (dropped connection) the row simply expires on its deadline;
   * an expired-but-unreleased row is reconciled like an outcome_unknown one.
   */
  release = async (id: string, ownerToken: string): Promise<void> => {
    await this.db
      .update(integrationLeases)
      .set({ phase: 'claimed', releasedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(integrationLeases.id, id), eq(integrationLeases.ownerToken, ownerToken)));
  };

  /**
   * Mark the holder's in-flight mutation ambiguous: remote state may or may
   * not have advanced. The row stays claimable only via expiry/steal and the
   * next acquirer sees `prior.outcomeUnknown`.
   */
  markOutcomeUnknown = async (id: string, ownerToken: string): Promise<void> => {
    await this.db
      .update(integrationLeases)
      .set({ outcomeUnknown: true, updatedAt: sql`now()` })
      .where(and(eq(integrationLeases.id, id), eq(integrationLeases.ownerToken, ownerToken)));
  };

  findByKey = async (key: string) =>
    this.db.query.integrationLeases.findFirst({ where: eq(integrationLeases.key, key) });
}
