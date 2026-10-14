import type { WorkspaceUserPreference } from '@orvilo/types';
import { mergeNotificationSettings } from '@orvilo/utils/mergeNotificationSettings';
import { pickString, toRecord } from '@orvilo/utils/object';
import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';

import { agents } from '../schemas/agent';
import { workspaces, workspaceUserSettings } from '../schemas/workspace';
import type { OrviloDatabase } from '../type';
import { hasWorkspaceAdminAccess } from './workspace';

/**
 * Per-user preferences scoped to a specific workspace — the workspace-scoped
 * counterpart to `UserSettingsModel`. Rows live in `workspace_user_settings`
 * (PK `(workspaceId, userId)`) and cascade with either identity anchor.
 *
 * Member preferences remain scoped to `(workspaceId, userId)`. The Orchestrator
 * source is shared in `workspaces.settings` and managed by Owner/Admin only;
 * legacy per-member Orchestrator choices are never used as a fallback.
 *
 * Rows are lazily created — the first `updatePreference` call for a given
 * pair upserts, so members who never customize anything simply have no row
 * and callers fall through to defaults on read.
 */
export class WorkspaceUserSettingsModel {
  private readonly db: OrviloDatabase;
  private readonly userId: string;
  private readonly workspaceId: string;

  constructor(db: OrviloDatabase, userId: string, workspaceId: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  /**
   * The caller's preference row for this workspace, or `undefined` when
   * nothing has been saved yet. Callers should treat `undefined` as "no
   * per-user override" and fall back to the shared defaults — the same
   * behaviour a first-open would see before this feature existed.
   */
  get = async () => {
    return this.db.query.workspaceUserSettings.findFirst({
      where: and(
        eq(workspaceUserSettings.workspaceId, this.workspaceId),
        eq(workspaceUserSettings.userId, this.userId),
      ),
    });
  };

  /**
   * The caller's effective preference bag, with defaults applied. Never
   * `undefined` — an unwritten row returns `{}`, so consumers can index into
   * it without null-guarding every field.
   */
  getPreference = async (): Promise<WorkspaceUserPreference> => {
    const [row, [workspace]] = await Promise.all([
      this.get(),
      this.db
        .select({ settings: workspaces.settings })
        .from(workspaces)
        .where(eq(workspaces.id, this.workspaceId))
        .limit(1),
    ]);
    const { orchestratorAgentId: _legacy, ...personal } = row?.preference ?? {};
    const orchestratorAgentId = pickString(toRecord(workspace?.settings)?.orchestratorAgentId);
    return { ...personal, ...(orchestratorAgentId ? { orchestratorAgentId } : {}) };
  };

  /**
   * Merge `patch` on top of the caller's current preference and persist the
   * result via UPSERT. The merge is done at the application layer (read →
   * merge → write) because only the caller writes their own row, so the
   * lost-update surface is limited to the same user racing themselves in
   * multiple tabs — an acceptable trade for simple code.
   *
   * The first call for a `(workspace, user)` pair creates the row; subsequent
   * calls update the `preference` column in place, replacing the whole jsonb
   * with the newly merged object (so setting a top-level key to `undefined`
   * in the patch is a no-op — pass an explicit `{}` to clear it).
   */
  updatePreference = async (patch: Partial<WorkspaceUserPreference>) => {
    const { orchestratorAgentId, ...memberPatch } = patch;
    if (orchestratorAgentId !== undefined) {
      if (
        !(await hasWorkspaceAdminAccess(this.db, {
          userId: this.userId,
          workspaceId: this.workspaceId,
        }))
      )
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Workspace admin access required' });
      if (orchestratorAgentId) {
        const [source] = await this.db
          .select({ id: agents.id })
          .from(agents)
          .where(
            and(
              eq(agents.id, orchestratorAgentId),
              eq(agents.workspaceId, this.workspaceId),
              eq(agents.visibility, 'public'),
            ),
          )
          .limit(1);
        if (!source)
          throw new TRPCError({ code: 'FORBIDDEN', message: 'ORCHESTRATOR_SOURCE_PRIVATE' });
      }
    }
    const { orchestratorAgentId: _shared, ...current } = await this.getPreference();
    // Per-agent override maps merge one level deeper: clients patch a single
    // agent's leaf from a local copy that may be stale or empty (for example a
    // picker used before the preference fetch settles). A top-level replace
    // would silently drop this user's choices for every other agent.
    // Individual per-agent entries still replace wholesale.
    const next: WorkspaceUserPreference = {
      ...current,
      ...memberPatch,
      ...(patch.notification
        ? { notification: mergeNotificationSettings(current.notification, patch.notification) }
        : {}),
      ...(patch.agentModeOverrides
        ? {
            agentModeOverrides: {
              ...current.agentModeOverrides,
              ...patch.agentModeOverrides,
            },
          }
        : {}),
      ...(patch.sidebarAgentVisibilityOverrides
        ? {
            sidebarAgentVisibilityOverrides: {
              ...current.sidebarAgentVisibilityOverrides,
              ...patch.sidebarAgentVisibilityOverrides,
            },
          }
        : {}),
      // Deprecated, but still merged: the fields stay on the API, so a client
      // from before the shared-sidebar change can still patch a single item.
      // A top-level replace would let one such write shred the rest of that
      // user's saved map — which is exactly the data the deprecation promises
      // to leave intact for a rollback. Drop these two once the fields leave
      // `WorkspaceUserPreference`.
      ...(patch.sidebarGroupAssignments
        ? {
            sidebarGroupAssignments: {
              ...current.sidebarGroupAssignments,
              ...patch.sidebarGroupAssignments,
            },
          }
        : {}),
      ...(patch.sidebarPinnedOverrides
        ? {
            sidebarPinnedOverrides: {
              ...current.sidebarPinnedOverrides,
              ...patch.sidebarPinnedOverrides,
            },
          }
        : {}),
    };
    return this.db.transaction(async (tx) => {
      if (orchestratorAgentId !== undefined) {
        await tx
          .update(workspaces)
          .set({
            settings: sql`coalesce(${workspaces.settings}, '{}'::jsonb) || jsonb_build_object('orchestratorAgentId', ${orchestratorAgentId}::text)`,
            updatedAt: new Date(),
          })
          .where(eq(workspaces.id, this.workspaceId));
      }
      const [row] = await tx
        .insert(workspaceUserSettings)
        .values({
          preference: next,
          userId: this.userId,
          workspaceId: this.workspaceId,
        })
        .onConflictDoUpdate({
          set: { preference: next, updatedAt: new Date() },
          target: [workspaceUserSettings.workspaceId, workspaceUserSettings.userId],
        })
        .returning();
      return {
        ...row,
        preference: await new WorkspaceUserSettingsModel(
          tx as OrviloDatabase,
          this.userId,
          this.workspaceId,
        ).getPreference(),
      };
    });
  };
}
