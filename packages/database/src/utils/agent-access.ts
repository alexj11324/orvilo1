import type { OrviloAgentAgencyConfig } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import { agents } from '../schemas';
import type { OrviloDatabase } from '../type';
import { buildWorkspaceWhere } from './workspace';

interface AgentAccessCtx {
  userId: string;
  workspaceId?: string;
}

/**
 * Assert that `ctx.userId` in `ctx.workspaceId` is allowed to use the agent —
 * i.e. it's a public agent in the same workspace OR owned by the caller.
 *
 * Cross-user access to someone else's private agent (and any cross-workspace
 * lookup) throws `NOT_FOUND` rather than `FORBIDDEN`, so a caller cannot probe
 * for the existence of a private agent they don't own.
 *
 * Use at every entry point that stores an agentId for later execution
 * (task assignee, group member, signal marker, bot binding ...) and as a
 * fail-closed guard at execution time. The single predicate keeps every
 * surface in sync with `buildWorkspaceWhere` semantics.
 */
export async function assertAgentUsableBy(
  db: OrviloDatabase,
  agentId: string,
  ctx: AgentAccessCtx,
): Promise<void> {
  const rows = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.id, agentId),
        buildWorkspaceWhere(ctx, {
          userId: agents.userId,
          workspaceId: agents.workspaceId,
          visibility: agents.visibility,
        }),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
  }
}

/**
 * The agent's execution-binding inputs (`agencyConfig`, `model`) when the
 * agent is usable by `ctx` — the same `buildWorkspaceWhere` visibility
 * semantics as `assertAgentUsableBy` — or null when it is missing or not
 * visible. Callers that gate on engine capabilities (e.g. whether the
 * resolved binding can mount the builtin tool surface) read this instead of
 * re-checking visibility themselves.
 */
export async function findUsableAgentExecutionBinding(
  db: OrviloDatabase,
  agentId: string,
  ctx: AgentAccessCtx,
): Promise<{ agencyConfig: OrviloAgentAgencyConfig | null; model: string | null } | null> {
  const rows = await db
    .select({ agencyConfig: agents.agencyConfig, model: agents.model })
    .from(agents)
    .where(
      and(
        eq(agents.id, agentId),
        buildWorkspaceWhere(ctx, {
          userId: agents.userId,
          workspaceId: agents.workspaceId,
          visibility: agents.visibility,
        }),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}
