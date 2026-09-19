import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { NotificationBulkError, NotificationModel } from '@/database/models/notification';
import { ProjectModel } from '@/database/models/project';
import { ResourceTransferRequestModel } from '@/database/models/resourceTransferRequest';
import { TaskModel } from '@/database/models/task';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { ActionSourceRegistry, buildInboxFeed } from '@/server/services/workAttention';

const notificationProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;

  return opts.next({
    ctx: {
      actionSources: new ActionSourceRegistry(
        ctx.serverDB,
        ctx.userId,
        ctx.workspaceId ?? undefined,
        ctx.workspaceRole === 'owner' || ctx.workspaceRole === 'admin',
      ),
      // Scope the inbox to the request context: workspace mode only sees that
      // workspace's notifications, personal mode only sees personal ones
      // (`workspace_id IS NULL`) — the two contexts never leak into each other.
      notificationModel: new NotificationModel(ctx.serverDB, ctx.userId, {
        workspaceId: ctx.workspaceId ?? null,
      }),
      projectModel: new ProjectModel(ctx.serverDB, ctx.userId, ctx.workspaceId ?? undefined),
      taskModel: new TaskModel(ctx.serverDB, ctx.userId, ctx.workspaceId ?? undefined),
    },
  });
});
const notificationReadProcedure = notificationProcedure.use(
  withScopedPermission('notification:read'),
);
const notificationWriteProcedure = notificationProcedure.use(
  withScopedPermission('notification:organize'),
);

/**
 * Live transfer requests rendered as inbox cards for this user — incoming
 * (recipient answers) AND outgoing (initiator may withdraw), matching what
 * `Content` renders from `listMine`. Empty in personal mode. Call this BEFORE
 * snapshotting any notification counts: `listPendingForUser` lazily expires
 * overdue transfers (settling their linked rows as read), so counting first
 * would preserve a ghost unread row for a request this very call just expired.
 */
const listLiveTransferCards = async (ctx: {
  serverDB: ConstructorParameters<typeof ResourceTransferRequestModel>[0];
  userId: string;
  workspaceId?: string | null;
}) => {
  if (!ctx.workspaceId) return [];

  const transferModel = new ResourceTransferRequestModel(ctx.serverDB, ctx.workspaceId);
  return transferModel.listPendingForUser(ctx.userId);
};

export const notificationRouter = router({
  archive: notificationWriteProcedure
    .input(
      z.object({
        expectedVersion: z.number().int().min(0).optional(),
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.expectedVersion === undefined) {
        return ctx.notificationModel.archive(input.id);
      }
      return ctx.notificationModel.archiveObserved(input.id, input.expectedVersion);
    }),

  archiveAll: notificationWriteProcedure.mutation(async ({ ctx }) => {
    return ctx.notificationModel.archiveAll();
  }),

  prepareBulk: notificationWriteProcedure
    .input(
      z.object({
        action: z.enum(['archive', 'mark_read']),
        queryFingerprint: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await ctx.notificationModel.prepareBulk(input);
        return { data, success: true };
      } catch (error) {
        if (error instanceof NotificationBulkError) {
          throw new TRPCError({
            code: error.code === 'RATE_LIMITED' ? 'TOO_MANY_REQUESTS' : 'BAD_REQUEST',
            message: error.code,
          });
        }
        throw error;
      }
    }),

  applyBulk: notificationWriteProcedure
    .input(z.object({ token: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const data = await ctx.notificationModel.applyBulk(input.token);
        return { data, success: true };
      } catch (error) {
        if (error instanceof NotificationBulkError) {
          throw new TRPCError({
            code:
              error.code === 'NOT_FOUND'
                ? 'NOT_FOUND'
                : error.code === 'FORBIDDEN_ACTION'
                  ? 'BAD_REQUEST'
                  : 'CONFLICT',
            message: error.code,
          });
        }
        throw error;
      }
    }),

  feed: notificationReadProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        filter: z.enum(['all', 'archived', 'mentions', 'snoozed', 'unread']).optional(),
        kind: z.enum(['action', 'update']).optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      return buildInboxFeed({
        actionSources: ctx.actionSources,
        input,
        notificationModel: ctx.notificationModel,
        projectModel: ctx.projectModel,
        taskModel: ctx.taskModel,
      });
    }),

  feedSummary: notificationReadProcedure.query(async ({ ctx }) => {
    return ctx.actionSources.summarizeFeed(ctx.notificationModel);
  }),

  list: notificationReadProcedure
    .input(
      z.object({
        category: z.string().optional(),
        cursor: z.string().optional(),
        isRead: z.boolean().optional(),
        limit: z.number().min(1).max(50).default(20),
        unreadOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.notificationModel.list(input);
    }),

  markAllAsRead: notificationWriteProcedure.mutation(async ({ ctx }) => {
    return ctx.notificationModel.markAllAsRead();
  }),

  markAsRead: notificationWriteProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.notificationModel.markAsRead(input.ids);
    }),

  markReadObserved: notificationWriteProcedure
    .input(z.object({ id: z.string(), observedVersion: z.number().int().min(0) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.notificationModel.markReadObserved(input.id, input.observedVersion);
    }),

  markUnread: notificationWriteProcedure
    .input(z.object({ expectedVersion: z.number().int().min(0), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.notificationModel.markUnreadObserved(input.id, input.expectedVersion);
    }),

  navigationCounts: notificationReadProcedure.query(async ({ ctx }) => {
    // The pending category is action-driven, not read-driven: while a
    // transfer request awaits the user, its count must keep prompting even
    // after the linked inbox row was read. Swap the linked rows out of the
    // row-based counts and count the live request cards themselves —
    // outgoing (withdrawable) cards render in the unread view too, so they
    // count the same as incoming ones.
    const cards = await listLiveTransferCards(ctx);
    const counts = await ctx.notificationModel.getNavigationCounts();
    if (cards.length === 0) return counts;

    const linked = await ctx.notificationModel.countLinkedToTransfers(
      cards.map((request) => request.id),
    );
    // Each live request renders exactly one UNREAD card, replacing
    // its linked row (when one exists) in every tally — a request whose
    // linked row is missing or archived still shows a card, so it must still
    // count, while a linked row that was read is suppressed by the card and
    // must leave the read tally it would otherwise inflate.
    const linkedRead = linked.total - linked.unread;
    const unreadDelta = cards.length - linked.unread;
    const totalDelta = cards.length - linked.total;
    const pending = counts.find((item) => item.category === 'pending');
    if (pending) {
      pending.unreadCount = Math.max(0, pending.unreadCount + unreadDelta);
      pending.readCount = Math.max(0, pending.readCount - linkedRead);
      pending.totalCount = Math.max(0, pending.totalCount + totalDelta);
    } else if (unreadDelta > 0 || totalDelta > 0) {
      counts.push({
        category: 'pending',
        readCount: 0,
        totalCount: Math.max(0, totalDelta),
        unreadCount: Math.max(0, unreadDelta),
      });
    }

    return counts;
  }),

  snooze: notificationWriteProcedure
    .input(
      z.object({
        expectedVersion: z.number().int().min(0),
        id: z.string(),
        until: z.string().datetime(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.notificationModel.snooze(input.id, new Date(input.until), input.expectedVersion);
    }),

  unreadCount: notificationReadProcedure.query(async ({ ctx }) => {
    // Same union as the sidebar badge / Inbox header after source repair:
    // unread updates plus unresolved actions, including live transfers that
    // never got a projection row.
    await ctx.actionSources.ensurePendingSourceCards(ctx.notificationModel);
    const summary = await ctx.notificationModel.getFeedSummary();
    return summary.unreadBadgeCount;
  }),
});

export type NotificationRouter = typeof notificationRouter;
