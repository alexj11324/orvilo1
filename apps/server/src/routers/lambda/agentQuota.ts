import { z } from 'zod';

import { AgentProviderAccountModel, AgentQuotaWindowModel } from '@/database/models/agentQuota';
import { DeviceModel } from '@/database/models/device';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { AgentQuotaService } from '@/server/services/agentQuota';

const quotaProcedure = authedProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const workspaceId = ctx.workspaceId ?? undefined;
  return opts.next({
    ctx: {
      accountModel: new AgentProviderAccountModel(ctx.serverDB, ctx.userId, workspaceId),
      quotaService: new AgentQuotaService(ctx.serverDB, ctx.userId, workspaceId),
      windowModel: new AgentQuotaWindowModel(ctx.serverDB, ctx.userId, workspaceId),
    },
  });
});

const providerSchema = z.enum(['claude-code', 'codex']);

const readingSchema = z.object({
  capturedAt: z.number(),
  isActive: z.boolean().optional(),
  limitType: z.string(),
  rateLimited: z.boolean().optional(),
  resetsAt: z.number().nullable(),
  scopeKey: z.string(),
  severity: z.string().optional(),
  utilization: z.number(),
});

export const agentQuotaRouter = router({
  // ── ingestion (desktop sampler → DB) ──────────────────────────────────────
  ingestSnapshot: quotaProcedure
    .input(
      z.object({
        deviceId: z.string().optional(),
        identity: z.object({
          displayName: z.string().optional(),
          email: z.string().optional(),
          externalAccountId: z.string().optional(),
          organizationId: z.string().optional(),
          planTier: z.string().optional(),
          rateLimitTier: z.string().optional(),
        }),
        provider: providerSchema,
        readings: z.array(readingSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Clients know a device by its gateway id (the string `devices.device_id`
      // stored in `agencyConfig.boundDeviceId`), but snapshots reference the
      // `devices.id` uuid. Resolve it here rather than trusting the client: a
      // raw gateway id fails the uuid/foreign-key check and would take the
      // whole ingest down with it, silently stranding the reading. An
      // unresolvable device only costs attribution, so keep the reading.
      //
      // A workspace device's identity is `(workspaceId, deviceId)` — `userId`
      // only records the first enroller — so the personal `(userId, deviceId)`
      // lookup misses a machine any other member enrolled. Try the
      // workspace-scoped lookup first when the request carries a workspace
      // (it also applies the device's visibility rules), then fall back to the
      // caller's own devices.
      const deviceModel = new DeviceModel(ctx.serverDB, ctx.userId, ctx.workspaceId ?? undefined);
      const deviceRow = input.deviceId
        ? ((ctx.workspaceId
            ? await deviceModel.findWorkspaceDeviceById(input.deviceId)
            : undefined) ?? (await deviceModel.findByDeviceId(input.deviceId)))
        : undefined;

      return ctx.quotaService.ingestSnapshot({
        credentialRef: { origin: 'keychain' },
        deviceId: deviceRow?.id,
        identity: input.identity,
        provider: input.provider,
        readings: input.readings,
      });
    }),

  /**
   * One assistant turn's consumption (desktop client-mode runs report from the
   * renderer). Idempotent by message id — replays cannot double-count.
   */
  recordUsage: quotaProcedure
    .input(
      z.object({
        agentId: z.string().optional(),
        externalAccountId: z.string().optional(),
        messageId: z.string().optional(),
        model: z.string().optional(),
        occurredAt: z.number().optional(),
        operationId: z.string().optional(),
        provider: providerSchema,
        topicId: z.string().optional(),
        usage: z.object({
          cacheRead: z.number().optional(),
          cacheWrite1h: z.number().optional(),
          cacheWrite5m: z.number().optional(),
          input: z.number().optional(),
          output: z.number().optional(),
          reasoning: z.number().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => ctx.quotaService.recordUsage(input)),

  // ── accounts (read-only observation) ─────────────────────────────────────
  // Accounts are registered exclusively by `ingestSnapshot` upserting on the
  // device-reported provider identity — there is no app-managed pool to write,
  // bind or route; the list exists so observation UI can resolve accounts.
  listAccounts: quotaProcedure.query(async ({ ctx }) => ctx.accountModel.list()),

  // ── quota read (QuotaMenu read model) ────────────────────────────────────
  getWindows: quotaProcedure
    .input(z.object({ accountId: z.string(), limit: z.number().optional() }))
    .query(async ({ ctx, input }) => ctx.windowModel.listByAccount(input.accountId, input.limit)),

  /**
   * Display read model: the newest reading per limit bucket. Prefer this over
   * `getWindows` for anything user-facing — windows are keyed by `resets_at`,
   * so limits the provider reports without one never make it into that table.
   */
  getLatestReadings: quotaProcedure
    .input(z.object({ accountId: z.string() }))
    .query(async ({ ctx, input }) => ctx.quotaService.listLatestReadings(input.accountId)),

  /**
   * Full reading time series (oldest first) for the usage calendar's daily
   * burn heat and per-window burn-down curve.
   */
  listSnapshots: quotaProcedure
    .input(z.object({ accountId: z.string(), sinceDays: z.number().min(1).max(90).optional() }))
    .query(async ({ ctx, input }) =>
      ctx.quotaService.listSnapshotSeries(
        input.accountId,
        new Date(Date.now() - (input.sinceDays ?? 42) * 24 * 60 * 60 * 1000),
      ),
    ),

  /**
   * Per-turn token + cost spend (oldest first) for the usage calendar. Kept
   * separate from `listSnapshots`: utilization is the provider's authority on
   * "how much quota is left", the ledger is ours on "what it was spent on".
   */
  listUsageTurns: quotaProcedure
    .input(z.object({ accountId: z.string(), sinceDays: z.number().min(1).max(90).optional() }))
    .query(async ({ ctx, input }) =>
      ctx.quotaService.listUsageTurns(
        input.accountId,
        new Date(Date.now() - (input.sinceDays ?? 42) * 24 * 60 * 60 * 1000),
      ),
    ),
});

export type AgentQuotaRouter = typeof agentQuotaRouter;
