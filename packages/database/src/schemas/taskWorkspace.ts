import type { TaskWorkspaceRecoveryKind, TaskWorkspaceRecoveryStatus } from '@orvilo/types';
import { integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { timestamps, timestamptz } from './_helpers';
import { workspaces } from './workspace';

/**
 * Durable ownership proof for a device worktree provisioned for a run (SA01
 * F01). Git state alone never proves ownership — a directory named like our
 * convention can belong to anyone — so `TaskWorkspaceService.provisionOnDevice`
 * mints one row per physical `(deviceId, repoCommonDir, worktreePath)` before it
 * inspects or touches the path, and a later provisioning of the same attempt
 * may reuse the checkout only while this row still matches the caller's
 * `(taskId, dispatchId, generation)`.
 *
 * `ownerToken` is the fencing token: a fresh UUID per claim, the value callers
 * must present to release the row. `expectedBaseSha` pins the remote base commit
 * resolved BEFORE `worktree add` — reuse compares the listed HEAD against it,
 * not against the mutable `origin/<base>` ref.
 */
export const taskWorkspaceClaims = pgTable(
  'task_workspace_claims',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    /** Owning scope (workspace) — null for legacy device paths without one. */
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),

    /**
     * Serialized unique key:
     * `${deviceId}:${repoCommonDir}::${canonicalWorktreePath}` — the device's
     * canonical identity, so aliases of the same physical directory share one
     * claim instead of splitting it.
     */
    key: text('key').notNull(),
    deviceId: text('device_id').notNull(),
    /** Raw repo path as requested on the device (kept for display/recovery). */
    repoPath: text('repo_path').notNull(),
    /** Canonical git common-dir proven by the device inspection. */
    repoCommonDir: text('repo_common_dir'),
    /** Canonical worktree path proven by the device inspection. */
    worktreePath: text('worktree_path').notNull(),

    taskId: text('task_id').notNull(),
    dispatchId: text('dispatch_id').notNull(),
    /** Dispatch generation at claim time — replays share it, retries do not. */
    generation: integer('generation').notNull(),
    /** Fencing token — a fresh UUID per claim mint. */
    ownerToken: text('owner_token').notNull(),
    /** Base branch resolved before `worktree add` — replays re-read it. */
    baseBranch: text('base_branch'),
    /** Remote base commit pinned before `worktree add`. */
    expectedBaseSha: text('expected_base_sha'),
    issuedAt: timestamptz('issued_at').notNull().defaultNow(),
    /** Clean release — the path is unclaimed once the worktree is discarded. */
    releasedAt: timestamptz('released_at'),

    ...timestamps,
  },
  (t) => [uniqueIndex('task_workspace_claims_key_unique').on(t.key)],
);

/**
 * Manual queue for worktree cleanup/recovery (SA01 F02). Unregistered,
 * foreign, or unclassifiable directories at a provisioned path are NEVER
 * deleted automatically — provisioning writes one pending row here and blocks;
 * a human resolves it. Keyed like claims so repeats dedupe onto the open row.
 */
export const taskWorkspaceRecoveries = pgTable(
  'task_workspace_recoveries',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),

    /** Serialized unique key: `${kind}:${deviceId}:${worktreePath}`. */
    key: text('key').notNull(),
    kind: text('kind').$type<TaskWorkspaceRecoveryKind>().notNull(),
    deviceId: text('device_id').notNull(),
    repoPath: text('repo_path'),
    worktreePath: text('worktree_path').notNull(),

    /** Task whose provisioning surfaced the condition, when known. */
    taskId: text('task_id'),
    /** Inspection snapshot + claim context for the human resolving it. */
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    status: text('status').$type<TaskWorkspaceRecoveryStatus>().notNull().default('pending'),

    ...timestamps,
  },
  (t) => [uniqueIndex('task_workspace_recoveries_key_unique').on(t.key)],
);

export type NewTaskWorkspaceClaim = typeof taskWorkspaceClaims.$inferInsert;
export type TaskWorkspaceClaimItem = typeof taskWorkspaceClaims.$inferSelect;
export type NewTaskWorkspaceRecovery = typeof taskWorkspaceRecoveries.$inferInsert;
export type TaskWorkspaceRecoveryItem = typeof taskWorkspaceRecoveries.$inferSelect;
