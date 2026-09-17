import { and, eq, isNull, sql } from 'drizzle-orm';

import type { ProjectMemberItem, ProjectMemberRole } from '../schemas/projectMember';
import { projectMembers } from '../schemas/projectMember';
import type { LobeChatDatabase, Transaction } from '../type';

/**
 * Explicit project membership. Lifecycle mirrors `workspace_members`: soft
 * removal flips `deletedAt` (re-adding restores the same PK row with a bumped
 * `authzVersion` and only the freshly granted role — old grants never come
 * back), suspension flips `suspendedAt`, and `getRole` — the
 * permission-checking read — honors both.
 */
export class ProjectMemberModel {
  private readonly db: LobeChatDatabase;
  private readonly userId: string;

  constructor(db: LobeChatDatabase, userId: string) {
    this.db = db;
    this.userId = userId;
  }

  /**
   * Insert the membership, or restore a soft-deleted/suspended row: the
   * upsert clears both lifecycle stamps, applies the newly granted role and
   * bumps `authzVersion`, so a re-added member starts from exactly what this
   * grant gave — nothing carried over from the removed row.
   */
  add = async (
    params: {
      createdBy?: string;
      projectId: string;
      role?: ProjectMemberRole;
      userId: string;
      workspaceId: string;
    },
    tx?: Transaction,
  ): Promise<ProjectMemberItem> => {
    const executor = tx ?? this.db;
    const [result] = await executor
      .insert(projectMembers)
      .values({
        createdBy: params.createdBy ?? this.userId,
        projectId: params.projectId,
        role: params.role ?? 'contributor',
        userId: params.userId,
        workspaceId: params.workspaceId,
      })
      .onConflictDoUpdate({
        set: {
          authzVersion: sql`${projectMembers.authzVersion} + 1`,
          createdBy: params.createdBy ?? this.userId,
          deletedAt: null,
          role: params.role ?? 'contributor',
          suspendedAt: null,
          updatedAt: new Date(),
        },
        target: [projectMembers.projectId, projectMembers.userId],
      })
      .returning();
    return result;
  };

  /** Soft-delete the membership and bump `authzVersion`; a re-`add` restores it. */
  remove = async (projectId: string, userId: string, tx?: Transaction) => {
    const executor = tx ?? this.db;
    return executor
      .update(projectMembers)
      .set({
        authzVersion: sql`${projectMembers.authzVersion} + 1`,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
          isNull(projectMembers.deletedAt),
        ),
      )
      .returning();
  };

  /**
   * Soft-delete every membership the user holds inside the workspace. Called
   * from workspace-member removal: a surviving row would let a re-invite
   * resurrect the old project role unchanged (`add` upserts on the same PK),
   * silently bypassing the fresh grant's role and cap.
   */
  removeAllForWorkspaceMember = async (workspaceId: string, userId: string, tx?: Transaction) => {
    const executor = tx ?? this.db;
    return executor
      .update(projectMembers)
      .set({
        authzVersion: sql`${projectMembers.authzVersion} + 1`,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectMembers.workspaceId, workspaceId),
          eq(projectMembers.userId, userId),
          isNull(projectMembers.deletedAt),
        ),
      )
      .returning();
  };

  /** Re-grade a non-deleted member; bumps `authzVersion` like every lifecycle write. */
  changeRole = async (
    projectId: string,
    userId: string,
    role: ProjectMemberRole,
    tx?: Transaction,
  ) => {
    const executor = tx ?? this.db;
    return executor
      .update(projectMembers)
      .set({
        authzVersion: sql`${projectMembers.authzVersion} + 1`,
        role,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
          isNull(projectMembers.deletedAt),
        ),
      )
      .returning();
  };

  /**
   * The member's effective project role, or `null` when no ACTIVE membership
   * exists — soft-deleted and suspended rows both resolve to `null` here even
   * though they still list in `listByProject`.
   */
  getRole = async (
    projectId: string,
    userId: string,
    tx?: Transaction,
  ): Promise<ProjectMemberRole | null> => {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
          isNull(projectMembers.deletedAt),
          isNull(projectMembers.suspendedAt),
        ),
      )
      .limit(1);
    return row?.role ?? null;
  };

  /** Every non-deleted member row of the project (suspended included — check `suspendedAt`). */
  listByProject = async (projectId: string, tx?: Transaction) => {
    const executor = tx ?? this.db;
    return executor
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), isNull(projectMembers.deletedAt)));
  };

  /** Every non-deleted membership the user holds inside the workspace. */
  listByUser = async (workspaceId: string, userId: string, tx?: Transaction) => {
    const executor = tx ?? this.db;
    return executor
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.workspaceId, workspaceId),
          eq(projectMembers.userId, userId),
          isNull(projectMembers.deletedAt),
        ),
      );
  };
}
