import type { IntegrationLeasePhase } from '@orvilo/types';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';

import type { IntegrationLeaseItem } from '../schemas';
import { integrationLeases } from '../schemas';
import type { RepoRefLeaseOutcomeContext } from '../schemas/integrationLease';
import type { OrviloDatabase } from '../type';

export interface RepoRefLeaseAcquireParams {
  deadline: Date;
  expectedBaseSha?: string;
  expectedHeadSha?: string;
  /**
   * Serialized physical key: `${target}#${ref}`. Workspace scope is NOT part
   * of the key — two workspaces able to reach the same repo/ref must contend
   * on this single lock (authorization stays caller-side per workspace).
   */
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
   * Row evicted by the claim (expired or released), locked and read inside the
   * claim transaction so it is atomically bound to the write. When it carries
   * `outcomeUnknown` the caller must reconcile the remote before mutating.
   */
  prior?: IntegrationLeaseItem;
}

export type { RepoRefLeaseOutcomeContext };

/**
 * IntegrationLeaseModel — the durable repo/ref lease behind
 * `TaskIntegrationService.withRepoRefLease` (R02, hardened by SA03). The claim
 * is a single transaction: the row being displaced is locked
 * `FOR UPDATE` and returned as `prior`, so the previous holder's
 * `outcomeUnknown`/reconciliation context is bound atomically to the claim and
 * never cleared by the steal — the new owner inherits it and must reconcile
 * before issuing mutations. Ownership is fenced by `ownerToken` plus the
 * monotone `fenceSeq` bump applied by every successful claim.
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
   * The displaced row is read under `FOR UPDATE` in the same transaction, so a
   * claimant that arrives mid-write sees the row as it actually was, not a
   * pre-write snapshot from a separate read.
   */
  acquire = async (params: RepoRefLeaseAcquireParams): Promise<RepoRefLeaseAcquireResult> =>
    this.db.transaction(async (tx) => {
      const prior = (
        await tx
          .select()
          .from(integrationLeases)
          .where(eq(integrationLeases.key, params.key))
          .for('update')
      )[0];

      const rows = await tx
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
            deadline: params.deadline,
            expectedBaseSha: params.expectedBaseSha,
            expectedHeadSha: params.expectedHeadSha,
            // Every successful steal bumps the monotone fence — a holder that
            // was preempted cannot prove ownership with its old fence value.
            fenceSeq: sql`${integrationLeases.fenceSeq} + 1`,
            ownerTaskId: params.ownerTaskId,
            ownerToken: params.ownerToken,
            ownerTopicId: params.ownerTopicId,
            phase: 'claimed',
            releasedAt: null,
            // outcomeUnknown/context deliberately preserved: the stolen row's
            // reconciliation state is inherited by the new owner, which must
            // observe the remote terminal state before mutating again.
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
      return {
        lease,
        prior: prior && prior.ownerToken !== params.ownerToken ? prior : undefined,
      };
    });

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
   * Clean release — the next claimant inherits no ambiguity. `outcomeUnknown`
   * is NOT cleared here: a release racing a lost acknowledgement keeps the
   * flag so the next owner still reconciles. When the release itself fails
   * (dropped connection) the row simply expires on its deadline; an
   * expired-but-unreleased row is reconciled like an outcome_unknown one.
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
   * next acquirer inherits `outcomeUnknown` + the persisted context (phase,
   * fence and expected SHAs in flight when the acknowledgement was lost).
   */
  markOutcomeUnknown = async (
    id: string,
    ownerToken: string,
    context?: RepoRefLeaseOutcomeContext,
  ): Promise<void> => {
    await this.db
      .update(integrationLeases)
      .set({
        context: context ?? null,
        outcomeUnknown: true,
        updatedAt: sql`now()`,
      })
      .where(and(eq(integrationLeases.id, id), eq(integrationLeases.ownerToken, ownerToken)));
  };

  /**
   * Clear the inherited ambiguity after the current owner has reconciled the
   * remote terminal state. Fenced on `ownerToken` — a preempted owner cannot
   * clear someone else's inherited context.
   */
  clearOutcomeUnknown = async (id: string, ownerToken: string): Promise<boolean> => {
    const rows = await this.db
      .update(integrationLeases)
      .set({ outcomeUnknown: false, updatedAt: sql`now()` })
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

  findByKey = async (key: string) =>
    this.db.query.integrationLeases.findFirst({ where: eq(integrationLeases.key, key) });
}
