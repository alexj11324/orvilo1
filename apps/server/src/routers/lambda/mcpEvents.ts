import { randomUUID } from 'node:crypto';

import { isLocalOrPrivateUrl } from '@orvilo/utils';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  requireWorkspaceRoleWhenScoped,
  wsCompatProcedure,
} from '@/business/server/trpc-middlewares/workspaceAuth';
import { ConnectorModel } from '@/database/models/connector';
import { TaskModel } from '@/database/models/task';
import { ConnectorMcpConnectionType, ConnectorStatus } from '@/database/schemas';
import { appEnv } from '@/envs/app';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { createConnectorEventsAdapter } from '@/server/services/mcpEvents/connector';
import { createMcpEventsSql } from '@/server/services/mcpEvents/database';
import { validMcpEventFilters } from '@/server/services/mcpEvents/filter';
import { SqlMcpEventBindingRepository } from '@/server/services/mcpEvents/inbox';
import { MCP_EVENT_RENEWAL_LEAD_MS } from '@/server/services/mcpEvents/renewalSchedule';
import { McpEventSubscriptionService } from '@/server/services/mcpEvents/subscription';
import { SqlMcpEventTriggerRepository } from '@/server/services/mcpEvents/workerRepository';

import { assertWorkspaceRowManageable } from './_helpers/assertWorkspaceRowManageable';

const eventProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
  return opts.next({
    ctx: {
      eventBindings: new SqlMcpEventBindingRepository(createMcpEventsSql(ctx.serverDB)),
      eventTriggers: new SqlMcpEventTriggerRepository(createMcpEventsSql(ctx.serverDB)),
      connectorModel: new ConnectorModel(
        ctx.serverDB,
        ctx.userId,
        ctx.workspaceId ?? undefined,
        gateKeeper,
      ),
      eventTaskModel: new TaskModel(ctx.serverDB, ctx.userId, ctx.workspaceId ?? undefined),
    },
  });
});

const eventWriteProcedure = eventProcedure.use(requireWorkspaceRoleWhenScoped('member'));

const taskInput = z.object({ taskId: z.string().min(1) });

const filterSchema = z.object({
  path: z.array(z.string().min(1).max(128)).min(1).max(10),
  operator: z.enum(['equals', 'contains']),
  value: z.union([z.string().max(4096), z.number().finite(), z.boolean(), z.null()]),
});

export const mcpEventsRouter = router({
  create: eventWriteProcedure
    .input(
      taskInput.extend({
        connectorId: z.string().min(1),
        eventName: z.string().min(1),
        arguments: z.record(z.string(), z.unknown()),
        filters: z.array(filterSchema).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspaceId)
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Event triggers require a workspace',
        });
      if (!validMcpEventFilters(input.filters))
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid event filters' });
      const task = await ctx.eventTaskModel.findById(input.taskId);
      const connector = await ctx.connectorModel.findPublicById(input.connectorId);
      if (!task || !connector || connector.agentId) throw new TRPCError({ code: 'NOT_FOUND' });
      assertWorkspaceRowManageable(ctx, task.createdByUserId, 'task');
      assertWorkspaceRowManageable(ctx, connector.userId, 'connector');
      const scope = { tenantId: ctx.workspaceId, workspaceId: ctx.workspaceId, userId: ctx.userId };
      const [existing] = await ctx.eventTriggers.list(scope, input.taskId);
      const previousBinding = existing
        ? await ctx.eventBindings.get(
            { tenantId: scope.tenantId, connectorId: existing.sourceId },
            existing.subscriptionId,
          )
        : undefined;
      if (existing && previousBinding?.state !== 'revoked') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This task already has an event trigger',
        });
      }
      const adapter = createConnectorEventsAdapter(input.connectorId, ctx);
      const service = new McpEventSubscriptionService({
        repository: ctx.eventBindings,
        minimumRefreshWindowMs: MCP_EVENT_RENEWAL_LEAD_MS,
        adapterFor: async () => adapter,
        callbackUrl: (token) =>
          new URL(`/api/webhooks/mcp-events/${token}`, appEnv.APP_URL).toString(),
      });
      try {
        const discovery = await adapter.discover();
        const event = discovery.events.find(
          (definition) =>
            definition.name === input.eventName && definition.delivery.includes('webhook'),
        );
        if (!discovery.supported || !event)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Event unavailable' });
        const binding = await service.create({
          ...scope,
          connectorId: input.connectorId,
          event,
          arguments: input.arguments,
          schemaId: `${input.connectorId}:${event.name}`,
        });
        try {
          const trigger = await ctx.eventTriggers.save(
            {
              ...scope,
              id: existing?.id ?? randomUUID(),
              taskId: task.id,
              sourceId: input.connectorId,
              subscriptionId: binding.id,
              enabled: false,
              filters: input.filters,
            },
            existing?.revision,
          );
          if (!trigger)
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Trigger changed; reload before retrying',
            });
          return { data: trigger, success: true as const };
        } catch (error) {
          await service.stop(
            { tenantId: scope.tenantId, connectorId: input.connectorId },
            binding.id,
          );
          throw error;
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'BAD_GATEWAY',
          message: 'Event subscription could not be saved',
        });
      }
    }),

  list: eventProcedure.input(taskInput).query(async ({ ctx, input }) => {
    if (!(await ctx.eventTaskModel.findById(input.taskId)))
      throw new TRPCError({ code: 'NOT_FOUND' });
    const triggers = ctx.workspaceId
      ? await ctx.eventTriggers.list(
          { tenantId: ctx.workspaceId, workspaceId: ctx.workspaceId, userId: ctx.userId },
          input.taskId,
        )
      : [];
    return {
      data: {
        triggers: await Promise.all(
          triggers.map(async (trigger) => {
            const binding = await ctx.eventBindings.get(
              { tenantId: trigger.tenantId, connectorId: trigger.sourceId },
              trigger.subscriptionId,
            );
            return { ...trigger, bindingState: binding?.state ?? 'unavailable' };
          }),
        ),
        canCreate: !!ctx.workspaceId,
        canEnable: false,
      },
      success: true as const,
    };
  }),

  discover: eventProcedure
    .input(taskInput.extend({ connectorId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (!(await ctx.eventTaskModel.findById(input.taskId)))
        throw new TRPCError({ code: 'NOT_FOUND' });
      const connector = await ctx.connectorModel.findPublicById(input.connectorId);
      if (!connector || connector.agentId) throw new TRPCError({ code: 'NOT_FOUND' });
      try {
        const discovery = await createConnectorEventsAdapter(input.connectorId, ctx).discover();
        return { data: discovery, success: true as const };
      } catch {
        // Remote errors may contain provider tokens or headers. Never return them to the client.
        throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Event discovery is unavailable' });
      }
    }),

  stop: eventWriteProcedure.input(taskInput).mutation(async ({ ctx, input }) => {
    if (!ctx.workspaceId) throw new TRPCError({ code: 'PRECONDITION_FAILED' });
    const task = await ctx.eventTaskModel.findById(input.taskId);
    if (!task) throw new TRPCError({ code: 'NOT_FOUND' });
    assertWorkspaceRowManageable(ctx, task.createdByUserId, 'task');
    const scope = { tenantId: ctx.workspaceId, workspaceId: ctx.workspaceId, userId: ctx.userId };
    const [trigger] = await ctx.eventTriggers.list(scope, input.taskId);
    if (!trigger) throw new TRPCError({ code: 'NOT_FOUND' });
    // The caller owns this task/trigger. Local revocation never needs a live connector.
    const updated = await ctx.eventTriggers.save({ ...trigger, enabled: false }, trigger.revision);
    if (!updated) throw new TRPCError({ code: 'CONFLICT' });
    await ctx.eventBindings.revoke(
      { tenantId: scope.tenantId, connectorId: trigger.sourceId },
      trigger.subscriptionId,
    );
    const connector = await ctx.connectorModel.findPublicById(trigger.sourceId);
    if (!connector)
      return { data: { stopped: true, cleanupPending: true }, success: true as const };
    try {
      assertWorkspaceRowManageable(ctx, connector.userId, 'connector');
    } catch {
      return { data: { stopped: true, cleanupPending: true }, success: true as const };
    }
    const service = new McpEventSubscriptionService({
      repository: ctx.eventBindings,
      minimumRefreshWindowMs: MCP_EVENT_RENEWAL_LEAD_MS,
      adapterFor: async () => createConnectorEventsAdapter(trigger.sourceId, ctx),
      callbackUrl: () => {
        throw new Error('Stop never creates callbacks');
      },
    });
    try {
      await service.stop(
        { tenantId: scope.tenantId, connectorId: trigger.sourceId },
        trigger.subscriptionId,
      );
    } catch {
      return { data: { stopped: true, cleanupPending: true }, success: true as const };
    }
    return { data: { stopped: true, cleanupPending: false }, success: true as const };
  }),

  sources: eventProcedure.input(taskInput).query(async ({ ctx, input }) => {
    if (!(await ctx.eventTaskModel.findById(input.taskId)))
      throw new TRPCError({ code: 'NOT_FOUND' });
    const connectors = await ctx.connectorModel.queryPublic();
    return {
      data: connectors
        .filter(
          (connector) =>
            connector.isEnabled &&
            connector.status === ConnectorStatus.connected &&
            !connector.agentId &&
            connector.mcpConnectionType !== ConnectorMcpConnectionType.stdio &&
            connector.mcpServerUrl &&
            !isLocalOrPrivateUrl(connector.mcpServerUrl),
        )
        .map(({ id, name }) => ({ id, name })),
      success: true as const,
    };
  }),
});
