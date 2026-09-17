import { and, asc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

import { agents, projectAgents, projects } from '@orvilo/database/schemas';
import { UserModel } from '@/database/models/user';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

/** `workspaceAgent.list` — one row per agent participating in this workspace's projects. */
export interface WorkspaceAgentSummary {
  avatar: string | null;
  id: string;
  maintainer: { avatar: string | null; id: string; name: string | null } | null;
  name: string;
  projects: { id: string; name: string }[];
  status: 'active' | 'disabled';
}

/**
 * The Agent side of the teammates roster. Read-only in v1: which agents are
 * attached to this workspace's projects, who maintains them, and where they
 * can act. Lifecycle management stays on the agent surfaces that already own
 * it; this answers "who's here and usable where" for the workspace audience.
 */
export const workspaceAgentRouter = router({
  list: wsCompatProcedure
    .use(serverDatabase)
    .query(async ({ ctx }): Promise<WorkspaceAgentSummary[]> => {
      if (!ctx.workspaceId) return [];
      try {
        const rows = await ctx.serverDB
          .select({
            agentAvatar: agents.avatar,
            agentId: agents.id,
            agentName: agents.name,
            enabled: projectAgents.enabled,
            maintainerId: agents.userId,
            projectId: projects.id,
            projectName: projects.name,
          })
          .from(projectAgents)
          .innerJoin(agents, eq(projectAgents.agentId, agents.id))
          .innerJoin(projects, eq(projectAgents.projectId, projects.id))
          .where(
            and(
              eq(projectAgents.workspaceId, ctx.workspaceId),
              eq(projectAgents.enabled, true),
            ),
          )
          .orderBy(asc(projects.name), asc(projectAgents.sortOrder));

        const profiles = new Map(
          (
            await UserModel.getDisplayInfoByIds(
              ctx.serverDB,
              [...new Set(rows.map((row) => row.maintainerId).filter(Boolean))] as string[],
            )
          ).map((u) => [u.id, u]),
        );

        const byAgent = new Map<string, WorkspaceAgentSummary>();
        for (const row of rows) {
          let summary = byAgent.get(row.agentId);
          if (!summary) {
            const maintainer = row.maintainerId ? profiles.get(row.maintainerId) : undefined;
            summary = {
              avatar: row.agentAvatar,
              id: row.agentId,
              maintainer: maintainer
                ? {
                    avatar: maintainer.avatar,
                    id: maintainer.id,
                    name: maintainer.fullName ?? maintainer.username,
                  }
                : null,
              name: row.agentName ?? row.agentId,
              projects: [],
              status: 'active',
            };
            byAgent.set(row.agentId, summary);
          }
          if (!summary.projects.some((p) => p.id === row.projectId)) {
            summary.projects.push({ id: row.projectId, name: row.projectName ?? row.projectId });
          }
        }
        return [...byAgent.values()];
      } catch (error) {
        console.error('[workspaceAgent:list]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list workspace agents',
        });
      }
    }),
});
