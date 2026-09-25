import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import {
  requireWorkspaceRoleWhenScoped,
  wsCompatProcedure,
} from '@/business/server/trpc-middlewares/workspaceAuth';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { LINEAR_IMPORT_CATEGORIES, LinearImportService } from '@/server/services/linearImport';
import { LinearImportWorkflow } from '@/server/workflows/linearImport';

const procedure = wsCompatProcedure
  .use(serverDatabase)
  .use(withScopedPermission('workspace:settings_update'))
  .use(requireWorkspaceRoleWhenScoped('admin'))
  .use(async (opts) => {
    if (!opts.ctx.workspaceId)
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Workspace is required' });
    return opts.next({
      ctx: { importService: new LinearImportService(opts.ctx.serverDB, opts.ctx.workspaceId) },
    });
  });

const sourceSchema = z.object({ installationId: z.string().uuid(), teamId: z.string().min(1) });
const jobSchema = z.object({ jobId: z.string().uuid() });
const mapError = (error: unknown): never => {
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: error instanceof Error ? error.message : 'Linear import failed',
  });
};

export const linearImportRouter = router({
  destinations: procedure
    .input(
      z
        .object({
          search: z.string().max(100).optional(),
          offset: z.number().int().min(0).default(0),
          limit: z.number().int().min(1).max(50).default(30),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      try {
        return { data: await ctx.importService.destinations(input), success: true };
      } catch (error) {
        mapError(error);
      }
    }),
  preview: procedure.input(sourceSchema).query(async ({ ctx, input }) => {
    try {
      return {
        data: await ctx.importService.preview(input.installationId, input.teamId),
        success: true,
      };
    } catch (error) {
      mapError(error);
    }
  }),
  resume: procedure.input(jobSchema).mutation(async ({ ctx, input }) => {
    try {
      const job = await ctx.importService.resume(input.jobId);
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear import job not found' });
      if (job.status === 'queued')
        await LinearImportWorkflow.trigger({ workspaceId: ctx.workspaceId!, jobId: job.id });
      return { data: job, success: true };
    } catch (error) {
      mapError(error);
    }
  }),
  start: procedure
    .input(
      sourceSchema.extend({
        projectId: z.string().min(1),
        stateMappings: z
          .array(
            z.object({
              linearStateId: z.string().min(1),
              workflowCategory: z.enum(LINEAR_IMPORT_CATEGORIES),
            }),
          )
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const job = await ctx.importService.start({ ...input, requestedByUserId: ctx.userId });
        if (job.status === 'queued')
          await LinearImportWorkflow.trigger({ workspaceId: ctx.workspaceId!, jobId: job.id });
        return { data: job, success: true };
      } catch (error) {
        mapError(error);
      }
    }),
  status: procedure.input(jobSchema).query(async ({ ctx, input }) => {
    try {
      const job = await ctx.importService.status(input.jobId);
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Linear import job not found' });
      return { data: job, success: true };
    } catch (error) {
      mapError(error);
    }
  }),
});
