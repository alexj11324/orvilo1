import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { AgentModel } from '@/database/models/agent';
import { ConnectorModel } from '@/database/models/connector';
import { ConnectorToolModel } from '@/database/models/connectorTool';
import type { ConnectorMetadata } from '@/database/schemas';
import { ConnectorSourceType, ConnectorStatus, ConnectorToolPermission } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { inferCrudType } from '@/libs/mcp/utils';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { reconcileGitHubMcpAvailability } from '@/server/services/connector/githubMcp';
import { hasWorkspaceScopedPermission } from '@/server/services/workspacePermission';
import {
  resolveConnectorAuthorizerId,
  resolveUserDisplayMap,
} from '@/server/utils/connectorAttribution';

import { isWorkspaceNonOwner } from './_helpers/assertWorkspaceRowManageable';

const connectorProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  // Credentials (OAuth tokens) are encrypted at rest — give the model a gatekeeper.
  const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
  const wsId = ctx.workspaceId ?? undefined;
  return opts.next({
    ctx: {
      connectorModel: new ConnectorModel(ctx.serverDB, ctx.userId, wsId, gateKeeper),
      connectorToolModel: new ConnectorToolModel(ctx.serverDB, ctx.userId, wsId),
    },
  });
});

export const connectorRouter = router({
  // ── Queries ──────────────────────────────────────────────────────────────

  list: connectorProcedure.query(async ({ ctx }) => {
    const connectors = await reconcileGitHubMcpAvailability({
      connectors: await ctx.connectorModel.query(),
      db: ctx.serverDB,
    });

    // Attribution — resolve the member who authorized each connector (workspace
    // dimension), so the profile can tag "authorized by X". The ids come from
    // scope-checked rows the caller already sees.
    const authorMap = await resolveUserDisplayMap(
      ctx.serverDB,
      connectors.map((c) => resolveConnectorAuthorizerId(c)),
    );

    const toolsByConnector = await Promise.all(
      connectors.map(async (c) => {
        const tools = await ctx.connectorToolModel.queryByConnector(c.id);
        // Never ship decrypted OAuth tokens or the client secret to the browser.
        const { credentials: _credentials, oidcConfig, ...rest } = c;
        const safeOidcConfig = oidcConfig ? { ...oidcConfig, clientSecret: undefined } : oidcConfig;
        const author = authorMap.get(resolveConnectorAuthorizerId(c) ?? '');
        return {
          ...rest,
          authorizedByAvatar: author?.avatar ?? null,
          authorizedByName: author?.name ?? null,
          oidcConfig: safeOidcConfig,
          tools,
        };
      }),
    );

    return toolsByConnector;
  }),

  /**
   * List the connectors bound to a specific agent (agent-scoped rows only). The
   * agent-settings UI uses this to show + manage the agent's own connectors,
   * which the base `list` deliberately excludes.
   */
  listByAgent: connectorProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ input, ctx }) => {
      const connectors = await reconcileGitHubMcpAvailability({
        connectors: await ctx.connectorModel.queryByAgent(input.agentId),
        db: ctx.serverDB,
      });

      // Attribution — the member who authorized each agent-scoped connector, so
      // a teammate viewing the agent sees "authorized by X" on each chip.
      const authorMap = await resolveUserDisplayMap(
        ctx.serverDB,
        connectors.map((c) => resolveConnectorAuthorizerId(c)),
      );

      return Promise.all(
        connectors.map(async (c) => {
          const tools = await ctx.connectorToolModel.queryByConnector(c.id);
          const { credentials: _credentials, oidcConfig, ...rest } = c;
          const safeOidcConfig = oidcConfig
            ? { ...oidcConfig, clientSecret: undefined }
            : oidcConfig;
          const author = authorMap.get(resolveConnectorAuthorizerId(c) ?? '');
          return {
            ...rest,
            authorizedByAvatar: author?.avatar ?? null,
            authorizedByName: author?.name ?? null,
            oidcConfig: safeOidcConfig,
            tools,
          };
        }),
      );
    }),

  /**
   * List every agent-OWNED connector in the current scope (all agents at once),
   * so the unified connector-settings page can show "which connector belongs to
   * which agent" without querying one agent at a time. Each row keeps its
   * `agentId` and is enriched with the owning agent's `agentTitle`/`agentAvatar`
   * for attribution badges. Scope-correct via `ConnectorModel.ownership()` (and
   * `AgentModel.ownership()` for the titles) — a workspace context only returns
   * that workspace's agent connectors ( /).
   */
  listAgentBound: connectorProcedure.query(async ({ ctx }) => {
    const connectors = await reconcileGitHubMcpAvailability({
      connectors: await ctx.connectorModel.queryAllAgentScoped(),
      db: ctx.serverDB,
    });

    // Resolve owning-agent display info in one scoped query (workspace-aware),
    // instead of loading each agent's config client-side from a page that isn't
    // in any agent's context.
    const agentIds = [
      ...new Set(connectors.map((c) => c.agentId).filter((id): id is string => !!id)),
    ];
    const agentModel = new AgentModel(ctx.serverDB, ctx.userId, ctx.workspaceId ?? undefined);
    // `getAgentAvatarsByIds` applies `AgentModel.ownership()` (visibility-aware):
    // in a workspace it returns only agents visible to the caller — public ones
    // plus their own private agents. A `user_connectors` row is scoped only by
    // `workspace_id`, so on its own it would surface connectors owned by another
    // member's PRIVATE agent. Gate on the visible-agent set so private-agent
    // connector inventory never leaks across members.
    const agentMetas = agentIds.length > 0 ? await agentModel.getAgentAvatarsByIds(agentIds) : [];
    const agentMetaById = new Map(agentMetas.map((m) => [m.id, m]));

    return Promise.all(
      connectors
        .filter((c) => !!c.agentId && agentMetaById.has(c.agentId))
        .map(async (c) => {
          const tools = await ctx.connectorToolModel.queryByConnector(c.id);
          const { credentials: _credentials, oidcConfig, ...rest } = c;
          const safeOidcConfig = oidcConfig
            ? { ...oidcConfig, clientSecret: undefined }
            : oidcConfig;
          const meta = agentMetaById.get(c.agentId!);
          return {
            ...rest,
            agentAvatar: meta?.avatar ?? null,
            agentName: meta?.name ?? null,
            agentTitle: meta?.title ?? null,
            oidcConfig: safeOidcConfig,
            tools,
          };
        }),
    );
  }),

  /**
   * Return the connector record with decrypted user-set credentials so the
   * edit form can pre-fill accurately. Only the connector owner can call this
   * (enforced by connectorProcedure ownership check).
   *
   * Machine-managed secrets are intentionally excluded:
   * - OAuth access/refresh tokens (type 'oauth2') → stripped, returned as null
   * - oidcConfig.clientSecret (DCR-registered secret)  → stripped
   * User-set credentials (bearer token, custom headers) are returned as-is so
   * the edit form can display them.
   */
  // Member-gated even though it's a query: it returns decrypted credentials
  // for edit prefill, so a creator later downgraded to viewer must not reach it.
  /**
   * Bootstrap a connector entry for a builtin tool (orvilo-creds, orvilo-local-system, etc.)
   * by reading its manifest from @orvilo/builtin-tools.
   * Idempotent — safe to call on every open of the detail panel.
   */
  syncBuiltinTool: connectorProcedure
    .input(z.object({ identifier: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const { builtinTools } = await import('@orvilo/builtin-tools');
      const tool = builtinTools.find((t) => t.identifier === input.identifier);

      if (!tool) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Builtin tool '${input.identifier}' not found`,
        });
      }

      const { connectorId, writable } = await upsertConnectorEntry(ctx, {
        avatar: tool.manifest.meta?.avatar,
        description: tool.manifest.meta?.description,
        identifier: input.identifier,
        name: tool.manifest.meta?.title || input.identifier,
        sourceType: ConnectorSourceType.builtin,
      });
      if (!writable) return { connectorId, toolCount: 0 };

      const syncInputs = tool.manifest.api.map((api) => ({
        crudType: inferCrudType(api.name),
        defaultPermission: resolveDefaultPermission(api.humanIntervention),
        description: api.description,
        inputSchema: api.parameters as Record<string, unknown>,
        toolName: api.name,
      }));

      await ctx.connectorToolModel.upsertMany(connectorId, syncInputs);
      return { connectorId, toolCount: syncInputs.length };
    }),
});

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Create connector entry if not exists (or update metadata), return connectorId.
 *
 * These bootstrap syncs run whenever any member opens a shared skill's detail
 * panel, so an existing row created by someone else must not be rewritten by a
 * non-owner caller — the row is returned read-only (`writable: false`) and the
 * caller skips the tool upsert instead of throwing, keeping browsing intact.
 */
async function upsertConnectorEntry(
  ctx: {
    connectorModel: ConnectorModel;
    serverDB: OrviloDatabase;
    userId: string;
    workspaceId?: string | null;
    workspaceRole?: string;
  },
  params: {
    avatar?: string;
    composio?: ConnectorMetadata['composio'];
    description?: string;
    identifier: string;
    name: string;
    sourceType: string;
  },
): Promise<{ connectorId: string; writable: boolean }> {
  const metadata: ConnectorMetadata = {};
  if (params.description) metadata.description = params.description;
  if (params.avatar) metadata.avatar = params.avatar;
  if (params.composio) metadata.composio = params.composio;

  // Viewers keep browse access: they resolve existing rows read-only below,
  // but must never create or rewrite connector state. These bootstrap
  // endpoints run without the RBAC middleware, so ctx.workspaceRole may be
  // absent — a missing role must NOT be treated as writable; fall back to an
  // explicit member-level permission check (viewers lack agent:update).
  const canWrite = !ctx.workspaceId
    ? true
    : ctx.workspaceRole
      ? ctx.workspaceRole !== 'viewer'
      : await hasWorkspaceScopedPermission({
          action: 'AGENT_UPDATE',
          db: ctx.serverDB,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
        });

  const existing = await ctx.connectorModel.queryByIdentifiers([params.identifier]);
  if (existing.length > 0) {
    const row = existing[0];
    const writable = canWrite && (!isWorkspaceNonOwner(ctx) || row.userId === ctx.userId);
    if (writable) {
      // Preserve runtime-owned metadata (especially Composio account identity)
      // while refreshing display fields from the latest plugin manifest.
      await ctx.connectorModel.update(row.id, { metadata: { ...row.metadata, ...metadata } });
    }
    return { connectorId: row.id, writable };
  }

  if (!canWrite) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Viewers cannot install connectors' });
  }

  const created = await ctx.connectorModel.create({
    identifier: params.identifier,
    isEnabled: true,
    metadata,
    name: params.name,
    sourceType: params.sourceType as any,
    status: ConnectorStatus.connected,
  });
  return { connectorId: created.id, writable: true };
}

/** Map builtin manifest humanIntervention → default ConnectorToolPermission */
function resolveDefaultPermission(humanIntervention: unknown): ConnectorToolPermission {
  if (humanIntervention === 'required' || humanIntervention === 'always') {
    return ConnectorToolPermission.needs_approval;
  }
  return ConnectorToolPermission.auto;
}
