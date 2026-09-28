import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { TaskLabelModel, toTaskLabelSummary } from '@/database/models/taskLabel';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

/**
 * `color` is rendered straight into an inline `background` on label chips, so
 * an arbitrary string is a CSS injection point — `url(https://…)` alone would
 * make every member who can see the shared label fetch an attacker-controlled
 * resource. Constrain it to a hex literal at the only place it can be written.
 */
const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'INVALID_LABEL_COLOR');

/** Both partial unique indexes that guard label names, per scope. */
const LABEL_NAME_CONSTRAINTS = new Set([
  'task_labels_user_id_name_unique',
  'task_labels_workspace_id_name_unique',
]);

/** Postgres surfaces the driver error somewhere down the `cause` chain. */
const getPostgresErrorField = (error: unknown, field: string): string | undefined => {
  let current: unknown = error;

  while (current && typeof current === 'object') {
    const value = (current as Record<string, unknown>)[field];
    if (typeof value === 'string') return value;

    current = (current as { cause?: unknown }).cause;
  }
};

/**
 * A name collision is a normal outcome the UI recovers from (the picker's
 * create box can just select the existing label), so it must arrive as
 * CONFLICT rather than a generic 500 the client can only show as
 * "operation failed".
 */
const rethrowDuplicateLabelName = (error: unknown): never => {
  if (
    getPostgresErrorField(error, 'code') === '23505' &&
    LABEL_NAME_CONSTRAINTS.has(getPostgresErrorField(error, 'constraint') ?? '')
  ) {
    throw new TRPCError({ cause: error, code: 'CONFLICT', message: 'DUPLICATE_LABEL_NAME' });
  }

  throw error;
};

const taskLabelProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const wsId = ctx.workspaceId ?? undefined;

  return opts.next({
    ctx: {
      taskLabelModel: new TaskLabelModel(ctx.serverDB, ctx.userId, wsId),
    },
  });
});

// Mutations gate on `agent:update` — the same scope `taskProcedureWrite` uses
// for every task mutation — so a member who can edit tasks can label them and
// a viewer can do neither. The label registry itself is workspace-shared and
// readable by anyone who can read tasks, so `list` stays on the plain
// procedure (mirroring how `taskProcedure` leaves reads ungated).
export const taskLabelRouter = router({
  assignLabel: taskLabelProcedure
    .use(withScopedPermission('agent:update'))
    .input(z.object({ labelId: z.string(), taskId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const labels = await ctx.taskLabelModel.assign(input.taskId, input.labelId);
      return labels.map(toTaskLabelSummary);
    }),

  createLabel: taskLabelProcedure
    .use(withScopedPermission('agent:update'))
    .input(
      z.object({
        color: hexColor.optional(),
        name: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return ctx.taskLabelModel.create(input).catch(rethrowDuplicateLabelName);
    }),

  getLabels: taskLabelProcedure.query(async ({ ctx }) => {
    return ctx.taskLabelModel.list();
  }),

  unassignLabel: taskLabelProcedure
    .use(withScopedPermission('agent:update'))
    .input(z.object({ labelId: z.string(), taskId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const labels = await ctx.taskLabelModel.unassign(input.taskId, input.labelId);
      return labels.map(toTaskLabelSummary);
    }),
});

export type TaskLabelRouter = typeof taskLabelRouter;
