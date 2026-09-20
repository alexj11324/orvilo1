import type { TaskWorkspaceRecoveryKind } from '@orvilo/types';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import type { TaskWorkspaceClaimItem } from '../schemas';
import { taskWorkspaceClaims, taskWorkspaceRecoveries } from '../schemas';
import type { OrviloDatabase } from '../type';

/**
 * Physical identity of one claimable worktree directory on one device.
 * The serialized `key` is the uniqueness boundary — a directory name that
 * merely matches our naming convention is not proof of ownership.
 */
export const taskWorkspaceClaimKey = (params: {
  deviceId: string;
  repoPath: string;
  worktreePath: string;
}): string => `${params.deviceId}:${params.repoPath}::${params.worktreePath}`;

export const taskWorkspaceRecoveryKey = (params: {
  deviceId: string;
  kind: TaskWorkspaceRecoveryKind;
  worktreePath: string;
}): string => `${params.kind}:${params.deviceId}:${params.worktreePath}`;

export interface TaskWorkspaceClaimMintParams {
  deviceId: string;
  dispatchId: string;
  expectedBaseSha?: string;
  generation: number;
  ownerToken: string;
  repoPath: string;
  taskId: string;
  workspaceId?: string;
  worktreePath: string;
}

export interface TaskWorkspaceRecoveryRequestParams {
  detail?: Record<string, unknown>;
  deviceId: string;
  kind: TaskWorkspaceRecoveryKind;
  repoPath?: string;
  taskId?: string;
  workspaceId?: string;
  worktreePath: string;
}

/**
 * TaskWorkspaceClaimModel — the persisted owner marker behind
 * `TaskWorkspaceService.provisionOnDevice` (SA01 F01/F02). Minting is a
 * single `INSERT ... ON CONFLICT DO NOTHING`: the winner's row survives
 * untouched, so a second dispatch can never overwrite a live claim — it reads
 * the conflict back and sees a foreign owner.
 */
export class TaskWorkspaceClaimModel {
  private db: OrviloDatabase;

  constructor(db: OrviloDatabase) {
    this.db = db;
  }

  /** Read the current claim for a physical path, live or released. */
  lookup = async (key: string): Promise<TaskWorkspaceClaimItem | undefined> =>
    this.db.query.taskWorkspaceClaims.findFirst({ where: eq(taskWorkspaceClaims.key, key) });

  /**
   * Mint the claim for `key`. Returns the row owned by this call — either
   * freshly inserted or re-read when the conflict hit a row already minted by
   * the same dispatch (an idempotent replay). A foreign row is returned as-is
   * for the caller to compare against; this method never overwrites one.
   */
  mint = async (params: TaskWorkspaceClaimMintParams): Promise<TaskWorkspaceClaimItem> => {
    const key = taskWorkspaceClaimKey(params);
    await this.db
      .insert(taskWorkspaceClaims)
      .values({
        deviceId: params.deviceId,
        dispatchId: params.dispatchId,
        expectedBaseSha: params.expectedBaseSha,
        generation: params.generation,
        key,
        ownerToken: params.ownerToken,
        repoPath: params.repoPath,
        taskId: params.taskId,
        workspaceId: params.workspaceId,
        worktreePath: params.worktreePath,
      })
      .onConflictDoNothing();

    // A released row has no live owner — it is claimable again. Take it over
    // with a conditional update fenced on `releasedAt IS NOT NULL`: a racing
    // reclaimer either wins the row or loses the fence and its re-read below
    // surfaces the winner's foreign ownership.
    await this.db
      .update(taskWorkspaceClaims)
      .set({
        dispatchId: params.dispatchId,
        expectedBaseSha: params.expectedBaseSha,
        generation: params.generation,
        issuedAt: sql`now()`,
        ownerToken: params.ownerToken,
        releasedAt: null,
        taskId: params.taskId,
        updatedAt: sql`now()`,
        workspaceId: params.workspaceId,
      })
      .where(and(eq(taskWorkspaceClaims.key, key), isNotNull(taskWorkspaceClaims.releasedAt)));

    const row = await this.lookup(key);
    if (!row) throw new Error(`Failed to mint workspace claim for ${params.worktreePath}`);
    return row;
  };

  /**
   * Does `row` belong to this dispatch? The trio (taskId, dispatchId,
   * generation) identifies one provisioning attempt — a replayed attempt
   * matches its own claim, a different owner never does.
   */
  matches = (
    row: TaskWorkspaceClaimItem,
    owner: { dispatchId: string; generation: number; taskId: string },
  ): boolean =>
    row.taskId === owner.taskId &&
    row.dispatchId === owner.dispatchId &&
    row.generation === owner.generation;

  /** Clean release — the claim leaves the path claimable again. */
  release = async (key: string, ownerToken: string): Promise<void> => {
    await this.db
      .update(taskWorkspaceClaims)
      .set({ releasedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(taskWorkspaceClaims.key, key), eq(taskWorkspaceClaims.ownerToken, ownerToken)));
  };

  /**
   * Queue a manual cleanup/recovery request — the ONLY outcome for an
   * unregistered, foreign, or unclassifiable directory at a claim path. No
   * code path may delete it. Re-requesting the same (kind, device, path)
   * refreshes the open row's detail instead of stacking duplicates.
   */
  requestRecovery = async (params: TaskWorkspaceRecoveryRequestParams): Promise<void> => {
    const key = taskWorkspaceRecoveryKey(params);
    await this.db
      .insert(taskWorkspaceRecoveries)
      .values({
        detail: params.detail,
        deviceId: params.deviceId,
        key,
        kind: params.kind,
        repoPath: params.repoPath,
        taskId: params.taskId,
        workspaceId: params.workspaceId,
        worktreePath: params.worktreePath,
      })
      .onConflictDoUpdate({
        // The same condition recurring reopens the request: a previously
        // resolved row going pending again is exactly the signal a manual
        // queue exists to surface.
        set: {
          detail: params.detail,
          status: 'pending',
          taskId: params.taskId,
          updatedAt: sql`now()`,
        },
        target: taskWorkspaceRecoveries.key,
      });
  };
}
