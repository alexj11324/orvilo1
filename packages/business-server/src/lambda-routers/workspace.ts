import { isWorkspaceSlugFormatValid, WORKSPACE_SLUG_MAX, WORKSPACE_SLUG_MIN } from '@orvilo/const';
import type { WorkspaceItem } from '@orvilo/database/schemas';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  cancelOwnershipTransfer,
  getOwnershipTransferState,
  requestOwnershipTransfer,
  respondOwnershipTransfer,
} from '@/business/server/membershipLifecycle/ownershipTransfer';
import {
  wsAdminProcedure,
  wsCompatProcedure,
  wsOwnerProcedure,
  wsProcedure,
} from '@/business/server/trpc-middlewares/workspaceAuth';
import { WorkspaceModel } from '@/database/models/workspace';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

/**
 * A workspace row as the workspace picker sees it: the stored record plus the
 * caller's membership role and the plan tag cloud derives from subscriptions.
 */
export interface WorkspaceMembershipSummary extends WorkspaceItem {
  lockedOut?: boolean;
  plan?: string;
  role: string | null;
}

export interface WorkspaceStatistics {
  agents: number;
  messages: number;
  messagesToday: number;
  topics: number;
}

// Same shape cloud enforces, so a slug the CLI or UI gets past this stub is
// only ever rejected for the reservations cloud adds on top.
const workspaceSlugSchema = z
  .string()
  .min(WORKSPACE_SLUG_MIN)
  .max(WORKSPACE_SLUG_MAX)
  .refine(isWorkspaceSlugFormatValid, { message: 'invalid-slug' });

const workspaceStatisticsInput = z
  .object({ todayStartAt: z.string().datetime().optional() })
  .optional();

const cloudOnly = (feature: string): never => {
  throw new TRPCError({
    code: 'NOT_IMPLEMENTED',
    message: `${feature} is a cloud-only feature.`,
  });
};

const isUniqueViolation = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: string }).code;
  if (code === '23505') return true;
  const message = error instanceof Error ? error.message : '';
  return message.includes('duplicate key value') || message.includes('workspaces_slug');
};

// The stub list/create/checkSlugAvailable are now real; cloud-only surfaces
// (market org, statistics, settings) stay declared no-ops so the contract
// type-checks. Keep the procedure builders and input schemas aligned with
// `apps/server/src/routers/lambda/workspace.ts` in the cloud repo.
export const workspaceRouter = router({
  checkSlugAvailable: authedProcedure
    .use(serverDatabase)
    .input(z.object({ slug: workspaceSlugSchema }))
    .query(async ({ input, ctx }): Promise<{ available: boolean }> => {
      const existing = await new WorkspaceModel(ctx.serverDB, ctx.userId).findBySlug(input.slug);
      return { available: !existing };
    }),

  create: authedProcedure
    .use(serverDatabase)
    .input(
      z.object({
        avatar: z.string().optional(),
        description: z.string().max(1000).optional(),
        name: z.string().min(1).max(255),
        slug: workspaceSlugSchema,
      }),
    )
    .mutation(async ({ input, ctx }): Promise<WorkspaceItem> => {
      const model = new WorkspaceModel(ctx.serverDB, ctx.userId);
      try {
        return await model.create(input);
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Idempotent recovery: a retried create (double submit, onboarding
          // replay, a second control client firing the same request) must land
          // on the workspace the first call made — not on a hard failure. Only
          // reuse when the caller actually owns the conflicting row; a slug
          // taken by someone else stays a real CONFLICT.
          const existing = await model.findBySlug(input.slug);
          if (existing?.primaryOwnerId === ctx.userId) return existing;
          throw new TRPCError({ code: 'CONFLICT', message: 'Workspace slug is already taken' });
        }
        console.error('[workspace:create]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create workspace',
        });
      }
    }),

  ensureMarketOrganization: authedProcedure
    .input(z.object({ autoProvision: z.boolean().optional() }).optional())
    .mutation(async (): Promise<{ created: boolean; marketAccountId: number }> => {
      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        message: 'Workspace market organization is a cloud-only feature.',
      });
    }),

  // `wsCompatProcedure` here, unlike cloud's `wsProcedure`, because open-source
  // callers (`buildAppUrl`) reach for it before they know whether a workspace
  // is in scope.
  getById: wsCompatProcedure.query((): WorkspaceItem | null => null),

  getMyStatistics: wsProcedure
    .input(workspaceStatisticsInput)
    .query((): WorkspaceStatistics | null => null),

  getSettings: wsProcedure.query((): Record<string, unknown> => ({})),

  /** Workspace-wide totals across all members — Admin or higher, like cloud. */
  getStatistics: wsAdminProcedure
    .input(workspaceStatisticsInput)
    .query((): WorkspaceStatistics | null => null),

  list: authedProcedure
    .use(serverDatabase)
    .query(async ({ ctx }): Promise<WorkspaceMembershipSummary[]> => {
      try {
        return await new WorkspaceModel(ctx.serverDB, ctx.userId).listUserWorkspaces();
      } catch (error) {
        console.error('[workspace:list]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list workspaces',
        });
      }
    }),

  /**
   * Owner retracts the still-pending hand-off. The invited member never had
   * any rights conferred by the request, so cancellation needs no consent.
   */
  cancelOwnershipTransfer: wsOwnerProcedure.use(serverDatabase).mutation(async ({ ctx }) => {
    try {
      return await cancelOwnershipTransfer(ctx.serverDB, {
        ipAddress: ctx.clientIp ?? undefined,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId!,
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[workspace:cancelOwnershipTransfer]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel ownership transfer',
      });
    }
  }),

  /**
   * The workspace's pending hand-off as seen by its parties (initiator or
   * invited member); everyone else reads `null` so an in-flight transfer
   * doesn't leak into the roster.
   */
  pendingOwnershipTransfer: wsProcedure.use(serverDatabase).query(async ({ ctx }) => {
    try {
      return await getOwnershipTransferState(ctx.serverDB, {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId!,
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error('[workspace:pendingOwnershipTransfer]', error);
      throw new TRPCError({
        cause: error,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to load ownership transfer state',
      });
    }
  }),

  /**
   * Recipient accepts or declines the pending hand-off. Accepting performs
   * the atomic owner swap; declining keeps the current owner.
   */
  respondOwnershipTransfer: wsProcedure
    .use(serverDatabase)
    .input(z.object({ accept: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await respondOwnershipTransfer(ctx.serverDB, {
          accept: input.accept,
          ipAddress: ctx.clientIp ?? undefined,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId!,
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[workspace:respondOwnershipTransfer]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to respond to ownership transfer',
        });
      }
    }),

  /**
   * Ownership moves only with the recipient's explicit consent: this creates
   * a pending request they must accept. The previous immediate-transfer
   * semantics are retired — see `respondOwnershipTransfer`.
   */
  transferOwnership: wsOwnerProcedure
    .use(serverDatabase)
    .input(z.object({ newOwnerUserId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await requestOwnershipTransfer(ctx.serverDB, {
          ipAddress: ctx.clientIp ?? undefined,
          ownerUserId: ctx.userId,
          targetUserId: input.newOwnerUserId,
          workspaceId: ctx.workspaceId!,
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[workspace:transferOwnership]', error);
        throw new TRPCError({
          cause: error,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to request ownership transfer',
        });
      }
    }),

  update: wsAdminProcedure
    .input(
      z.object({
        avatar: z.string().optional(),
        description: z.string().max(1000).optional(),
        name: z.string().min(1).max(255).optional(),
        slug: workspaceSlugSchema.optional(),
      }),
    )
    .mutation(async (): Promise<void> => cloudOnly('Workspace update')),
});
