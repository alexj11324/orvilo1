import { randomUUID } from 'node:crypto';

import { isLocalOrPrivateUrl } from '@orvilo/utils';
import { isRecord } from '@orvilo/utils/object';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  requireWorkspaceRoleWhenScoped,
  wsCompatProcedure,
} from '@/business/server/trpc-middlewares/workspaceAuth';
import { ConnectorModel } from '@/database/models/connector';
import { TaskModel } from '@/database/models/task';
import { ConnectorMcpConnectionType, ConnectorStatus } from '@/database/schemas';
import { tasks } from '@/database/schemas/task';
import type { OrviloDatabase } from '@/database/type';
import { snapshotAutomationDefinition } from '@/database/utils/automationOccurrence';
import { appEnv } from '@/envs/app';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { isGitHubMcpConnector } from '@/server/services/connector/githubMcp';
import { createConnectorEventsAdapter } from '@/server/services/mcpEvents/connector';
import { createMcpEventsSql } from '@/server/services/mcpEvents/database';
import { validMcpEventFilters } from '@/server/services/mcpEvents/filter';
import {
  createGithubEventBinding,
  githubEventDefinitions,
} from '@/server/services/mcpEvents/githubSubscription';
import { SqlMcpEventBindingRepository } from '@/server/services/mcpEvents/inbox';
import { checkMcpAutomationReadiness } from '@/server/services/mcpEvents/readiness';
import { MCP_EVENT_RENEWAL_LEAD_MS } from '@/server/services/mcpEvents/renewalSchedule';
import { McpEventSubscriptionService } from '@/server/services/mcpEvents/subscription';
import { SqlMcpEventTriggerRepository } from '@/server/services/mcpEvents/workerRepository';
import { TaskService } from '@/server/services/task';

import { assertWorkspaceRowManageable } from './_helpers/assertWorkspaceRowManageable';

const eventProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
  return opts.next({
    ctx: {
      eventBindings: new SqlMcpEventBindingRepository(createMcpEventsSql(ctx.serverDB)),
      eventGateKeeper: gateKeeper,
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
      const task = await ctx.eventTaskModel.resolve(input.taskId);
      const connector = await ctx.connectorModel.findPublicById(input.connectorId);
      if (!task || !connector || connector.agentId) throw new TRPCError({ code: 'NOT_FOUND' });
      assertWorkspaceRowManageable(ctx, task.createdByUserId, 'task');
      assertWorkspaceRowManageable(ctx, connector.userId, 'connector');
      if (task.status === 'running' || (task.automationMode && task.automationMode !== 'event'))
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Pause the current automation before changing its trigger type',
        });
      const scope = { tenantId: ctx.workspaceId, workspaceId: ctx.workspaceId, userId: ctx.userId };
      const [existing] = await ctx.eventTriggers.list(scope, task.id);
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
      const nativeGithub = isGitHubMcpConnector(connector);
      const service = new McpEventSubscriptionService({
        repository: ctx.eventBindings,
        minimumRefreshWindowMs: MCP_EVENT_RENEWAL_LEAD_MS,
        adapterFor: async () => adapter,
        callbackUrl: (token) =>
          new URL(`/api/webhooks/mcp-events/${token}`, appEnv.APP_URL).toString(),
      });
      try {
        const binding = await (async () => {
          if (nativeGithub)
            return createGithubEventBinding({
              arguments: input.arguments,
              callbackUrl: (token) =>
                new URL(`/api/webhooks/github-events/${token}`, appEnv.APP_URL).toString(),
              connector,
              db: ctx.serverDB,
              eventName: input.eventName,
              repository: ctx.eventBindings,
              tenantId: scope.tenantId,
            });
          const discovery = await adapter.discover();
          const event = discovery.events.find(
            (definition) =>
              definition.name === input.eventName && definition.delivery.includes('webhook'),
          );
          if (!discovery.supported || !event)
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Event unavailable' });
          return service.create({
            ...scope,
            connectorId: input.connectorId,
            event,
            arguments: input.arguments,
            schemaId: `${input.connectorId}:${event.name}`,
          });
        })();
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
          const savedTask = await new TaskService(
            ctx.serverDB,
            ctx.userId,
            ctx.workspaceId,
          ).updateTaskWithAssigneeLock(
            task.id,
            { automationMode: 'event', status: 'paused' },
            { userId: ctx.userId },
            { expectedDomainRevision: task.domainRevision },
          );
          if (!savedTask)
            throw new TRPCError({ code: 'CONFLICT', message: 'Task changed while saving trigger' });
          return { data: trigger, success: true as const };
        } catch (error) {
          const bindingScope = { tenantId: scope.tenantId, connectorId: input.connectorId };
          if (nativeGithub) await ctx.eventBindings.revoke(bindingScope, binding.id);
          else await service.stop(bindingScope, binding.id);
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
    const task = await ctx.eventTaskModel.resolve(input.taskId);
    if (!task) throw new TRPCError({ code: 'NOT_FOUND' });
    const triggers = ctx.workspaceId
      ? await ctx.eventTriggers.list(
          { tenantId: ctx.workspaceId, workspaceId: ctx.workspaceId, userId: ctx.userId },
          task.id,
        )
      : [];
    const enriched = await Promise.all(
      triggers.map(async (trigger) => {
        const binding = await ctx.eventBindings.get(
          { tenantId: trigger.tenantId, connectorId: trigger.sourceId },
          trigger.subscriptionId,
        );
        const readiness = await checkMcpAutomationReadiness({
          db: ctx.serverDB,
          task,
          trigger,
          binding,
        });
        return {
          ...trigger,
          bindingState: binding?.state ?? 'unavailable',
          sourceType: binding?.sourceType ?? 'mcp',
          eventName: binding?.eventName,
          repository: binding?.github?.repositoryFullName,
          callbackUrl: binding?.sourceType === 'github' ? binding.callbackUrl : undefined,
          readiness,
        };
      }),
    );
    return {
      data: {
        triggers: enriched,
        canCreate: !!ctx.workspaceId,
        canEnable: enriched.some((trigger) => trigger.readiness.canEnable),
      },
      success: true as const,
    };
  }),

  readiness: eventProcedure
    .input(taskInput.extend({ deviceId: z.string().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.workspaceId) throw new TRPCError({ code: 'PRECONDITION_FAILED' });
      const task = await ctx.eventTaskModel.resolve(input.taskId);
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' });
      const [trigger] = await ctx.eventTriggers.list(
        { tenantId: ctx.workspaceId, workspaceId: ctx.workspaceId, userId: ctx.userId },
        task.id,
      );
      if (!trigger) throw new TRPCError({ code: 'NOT_FOUND' });
      const binding = await ctx.eventBindings.get(
        { tenantId: trigger.tenantId, connectorId: trigger.sourceId },
        trigger.subscriptionId,
      );
      return {
        data: await checkMcpAutomationReadiness({
          db: ctx.serverDB,
          task,
          trigger,
          binding,
          deviceId: input.deviceId,
        }),
        success: true as const,
      };
    }),

  enable: eventWriteProcedure
    .input(
      taskInput.extend({
        triggerRevision: z.number().int().nonnegative(),
        definitionVersionId: z.string().min(1),
        deviceId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspaceId) throw new TRPCError({ code: 'PRECONDITION_FAILED' });
      const task = await ctx.eventTaskModel.resolve(input.taskId);
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' });
      assertWorkspaceRowManageable(ctx, task.createdByUserId, 'task');
      const scope = { tenantId: ctx.workspaceId, workspaceId: ctx.workspaceId, userId: ctx.userId };
      const [trigger] = await ctx.eventTriggers.list(scope, task.id);
      if (!trigger) throw new TRPCError({ code: 'NOT_FOUND' });
      if (
        trigger.revision !== input.triggerRevision ||
        snapshotAutomationDefinition(task).definitionVersionId !== input.definitionVersionId
      )
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Automation changed; reload before enabling',
        });
      const connector = await ctx.connectorModel.findPublicById(trigger.sourceId);
      if (!connector || !connector.isEnabled || connector.status !== ConnectorStatus.connected)
        return { data: { enabled: false, reasons: ['CONNECTOR_REVOKED'] }, success: true as const };
      assertWorkspaceRowManageable(ctx, connector.userId, 'connector');
      const binding = await ctx.eventBindings.get(
        { tenantId: trigger.tenantId, connectorId: trigger.sourceId },
        trigger.subscriptionId,
      );
      const readiness = await checkMcpAutomationReadiness({
        db: ctx.serverDB,
        task,
        trigger,
        binding,
        deviceId: input.deviceId,
      });
      if (!readiness.canEnable)
        return { data: { enabled: false, ...readiness }, success: true as const };
      // Probe outside the transaction; lock and recheck definition + subscription when arming it.
      const updated = await ctx.serverDB.transaction(async (tx) => {
        const db = tx as OrviloDatabase;
        await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(eq(tasks.id, task.id), eq(tasks.workspaceId, ctx.workspaceId!)))
          .for('update');
        const fresh = await new TaskModel(db, ctx.userId, ctx.workspaceId!).findById(task.id);
        if (
          !fresh ||
          snapshotAutomationDefinition(fresh).definitionVersionId !== input.definitionVersionId
        )
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Automation changed during readiness check',
          });
        const sql = createMcpEventsSql(db);
        const currentBinding = await new SqlMcpEventBindingRepository(sql).get(
          { tenantId: trigger.tenantId, connectorId: trigger.sourceId },
          trigger.subscriptionId,
        );
        if (
          !currentBinding ||
          currentBinding.revision !== binding?.revision ||
          currentBinding.state !== 'active' ||
          (currentBinding.expiresAt !== null && currentBinding.expiresAt <= Date.now())
        )
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Subscription changed during readiness check',
          });
        await new TaskService(db, ctx.userId, ctx.workspaceId!).updateTaskWithAssigneeLock(
          task.id,
          {
            status: 'scheduled',
            config: {
              ...(isRecord(fresh.config) ? fresh.config : {}),
              automationDeviceId: readiness.deviceId,
              automationEnabledAt:
                trigger.enabled && isRecord(fresh.config)
                  ? fresh.config.automationEnabledAt
                  : new Date().toISOString(),
            },
          },
          { userId: ctx.userId },
          { expectedDomainRevision: fresh.domainRevision },
        );
        const enabled = await new SqlMcpEventTriggerRepository(sql).save(
          { ...trigger, enabled: true },
          input.triggerRevision,
        );
        if (!enabled)
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Trigger changed during readiness check',
          });
        return enabled;
      });
      return {
        data: { enabled: true, trigger: updated, deviceId: readiness.deviceId, reasons: [] },
        success: true as const,
      };
    }),

  pause: eventWriteProcedure
    .input(taskInput.extend({ triggerRevision: z.number().int().nonnegative() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspaceId) throw new TRPCError({ code: 'PRECONDITION_FAILED' });
      const task = await ctx.eventTaskModel.resolve(input.taskId);
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' });
      assertWorkspaceRowManageable(ctx, task.createdByUserId, 'task');
      const [trigger] = await ctx.eventTriggers.list(
        { tenantId: ctx.workspaceId, workspaceId: ctx.workspaceId, userId: ctx.userId },
        task.id,
      );
      if (!trigger) throw new TRPCError({ code: 'NOT_FOUND' });
      const updated = await ctx.eventTriggers.save(
        { ...trigger, enabled: false },
        input.triggerRevision,
      );
      if (!updated) throw new TRPCError({ code: 'CONFLICT' });
      return { data: updated, success: true as const };
    }),

  discover: eventProcedure
    .input(taskInput.extend({ connectorId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (!(await ctx.eventTaskModel.resolve(input.taskId)))
        throw new TRPCError({ code: 'NOT_FOUND' });
      const connector = await ctx.connectorModel.findPublicById(input.connectorId);
      if (!connector || connector.agentId) throw new TRPCError({ code: 'NOT_FOUND' });
      try {
        if (isGitHubMcpConnector(connector))
          return {
            data: {
              events: githubEventDefinitions,
              sourceType: 'github' as const,
              supported: true,
            },
            success: true as const,
          };
        const discovery = await createConnectorEventsAdapter(input.connectorId, ctx).discover();
        return { data: { ...discovery, sourceType: 'mcp' as const }, success: true as const };
      } catch {
        // Remote errors may contain provider tokens or headers. Never return them to the client.
        throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Event discovery is unavailable' });
      }
    }),

  stop: eventWriteProcedure.input(taskInput).mutation(async ({ ctx, input }) => {
    if (!ctx.workspaceId) throw new TRPCError({ code: 'PRECONDITION_FAILED' });
    const task = await ctx.eventTaskModel.resolve(input.taskId);
    if (!task) throw new TRPCError({ code: 'NOT_FOUND' });
    assertWorkspaceRowManageable(ctx, task.createdByUserId, 'task');
    const scope = { tenantId: ctx.workspaceId, workspaceId: ctx.workspaceId, userId: ctx.userId };
    const [trigger] = await ctx.eventTriggers.list(scope, task.id);
    if (!trigger) throw new TRPCError({ code: 'NOT_FOUND' });
    // The caller owns this task/trigger. Local revocation never needs a live connector.
    const updated = await ctx.eventTriggers.save({ ...trigger, enabled: false }, trigger.revision);
    if (!updated) throw new TRPCError({ code: 'CONFLICT' });
    await ctx.eventBindings.revoke(
      { tenantId: scope.tenantId, connectorId: trigger.sourceId },
      trigger.subscriptionId,
    );
    const binding = await ctx.eventBindings.get(
      { tenantId: scope.tenantId, connectorId: trigger.sourceId },
      trigger.subscriptionId,
    );
    if (binding?.sourceType === 'github')
      return { data: { stopped: true, cleanupPending: false }, success: true as const };
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
    if (!(await ctx.eventTaskModel.resolve(input.taskId)))
      throw new TRPCError({ code: 'NOT_FOUND' });
    const connectors = await ctx.connectorModel.queryPublic();
    return {
      data: connectors
        .filter(
          (connector) =>
            connector.isEnabled &&
            connector.status === ConnectorStatus.connected &&
            !connector.agentId &&
            (isGitHubMcpConnector(connector) ||
              (connector.mcpConnectionType !== ConnectorMcpConnectionType.stdio &&
                connector.mcpServerUrl &&
                !isLocalOrPrivateUrl(connector.mcpServerUrl))),
        )
        .map(({ id, name }) => ({ id, name })),
      success: true as const,
    };
  }),

  githubWebhookConfiguration: eventWriteProcedure
    .input(taskInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspaceId) throw new TRPCError({ code: 'PRECONDITION_FAILED' });
      const task = await ctx.eventTaskModel.resolve(input.taskId);
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' });
      assertWorkspaceRowManageable(ctx, task.createdByUserId, 'task');
      const [trigger] = await ctx.eventTriggers.list(
        { tenantId: ctx.workspaceId, workspaceId: ctx.workspaceId, userId: ctx.userId },
        task.id,
      );
      if (!trigger) throw new TRPCError({ code: 'NOT_FOUND' });
      const binding = await ctx.eventBindings.get(
        { tenantId: trigger.tenantId, connectorId: trigger.sourceId },
        trigger.subscriptionId,
      );
      if (binding?.sourceType !== 'github' || !binding.github || binding.state === 'revoked')
        throw new TRPCError({ code: 'NOT_FOUND' });
      const connector = await ctx.connectorModel.findPublicById(trigger.sourceId);
      if (!connector || !isGitHubMcpConnector(connector))
        throw new TRPCError({ code: 'NOT_FOUND' });
      assertWorkspaceRowManageable(ctx, connector.userId, 'connector');
      const secret = await ctx.eventGateKeeper.decrypt(binding.github.encryptedSecret);
      if (!secret.wasAuthentic || !secret.plaintext)
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Webhook credential unavailable',
        });
      return {
        data: {
          callbackUrl: binding.callbackUrl,
          contentType: 'application/json',
          event: binding.eventName.slice('github.'.length),
          repository: binding.github.repositoryFullName,
          secret: secret.plaintext,
        },
        success: true as const,
      };
    }),
});
