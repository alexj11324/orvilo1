import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import type { CollaborationRoom } from '@orvilo/types';
import type { OrviloDatabase } from '@/database/type';

import {
  buildWorkspaceWhere,
  getActiveWorkspaceMembershipRole,
  ProjectMemberModel,
  projects,
  tasks,
} from './contractTables';

const NOT_FOUND = () => new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });

/**
 * Server-side room authorization. A client naming a room grants nothing —
 * every scope re-verifies tenant binding and caller visibility here:
 *
 * - `workspace:{id}`  → id must be the caller's selected workspace and the
 *   caller an active member.
 * - `project:{id}`    → project must belong to the workspace and be visible to
 *   the caller (public, own private, or an explicit project_members row).
 * - `task:{id}`       → task must belong to the workspace and be visible via
 *   `buildWorkspaceWhere` semantics (public or creator-private).
 */
export const assertRoomAccess = async (
  db: OrviloDatabase,
  ctx: { userId: string; workspaceId: string },
  room: CollaborationRoom,
): Promise<void> => {
  switch (room.scope) {
    case 'workspace': {
      if (room.id !== ctx.workspaceId) throw NOT_FOUND();
      const role = await getActiveWorkspaceMembershipRole(db, {
        userId: ctx.userId,
        workspaceId: room.id,
      });
      if (!role) throw NOT_FOUND();
      return;
    }

    case 'project': {
      // Tenant binding first — a project in another workspace is invisible
      // regardless of visibility mode (no existence leak across tenants).
      const [project] = await db
        .select({ userId: projects.userId, visibility: projects.visibility })
        .from(projects)
        .where(and(eq(projects.id, room.id), eq(projects.workspaceId, ctx.workspaceId)))
        .limit(1);
      if (!project) throw NOT_FOUND();

      const visibility = project.visibility as string;
      const isPublic = visibility !== 'private' && visibility !== 'restricted';
      const isOwner = project.userId === ctx.userId;
      if (isPublic || isOwner) return;

      // Restricted/private reach: an explicit project membership row grants
      // room access without widening the project's content visibility.
      const projectMemberModel = new ProjectMemberModel(db, ctx.userId);
      const projectRole = await projectMemberModel.getRole(room.id, ctx.userId);
      if (!projectRole) throw NOT_FOUND();
      return;
    }

    case 'task': {
      const [task] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.id, room.id),
            buildWorkspaceWhere(ctx, {
              userId: tasks.createdByUserId,
              visibility: tasks.visibility,
              workspaceId: tasks.workspaceId,
            }),
          ),
        )
        .limit(1);
      if (!task) throw NOT_FOUND();
      return;
    }
  }
};

/** Presence color palette — deterministic by actor id so all clients agree. */
const ACTOR_COLORS = [
  '#1677ff',
  '#722ed1',
  '#eb2f96',
  '#f5222d',
  '#fa8c16',
  '#a0d911',
  '#13c2c2',
  '#2f54eb',
] as const;

export const actorColorForId = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ACTOR_COLORS[hash % ACTOR_COLORS.length];
};
