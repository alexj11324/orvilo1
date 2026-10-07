import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { TaskModel, TaskRevisionConflictError } from '@/database/models/task';
import { TaskDependencyError } from '@/database/models/taskDependency';
import { TaskDescriptionHistoryModel } from '@/database/models/taskDescriptionHistory';
import { TaskIssueRecurrenceModel } from '@/database/models/taskIssueRecurrence';
import { TaskResourceModel } from '@/database/models/taskResource';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { EditLockService } from '@/server/services/editLock';
import { TaskIssueDefinitionService } from '@/server/services/taskIssueDefinition';
import { TaskIssueRecurrenceService } from '@/server/services/taskIssueRecurrence';

const taskMenuProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const workspaceId = ctx.workspaceId ?? undefined;
  return opts.next({
    ctx: {
      taskModel: new TaskModel(ctx.serverDB, ctx.userId, workspaceId),
      issueDefinitions: new TaskIssueDefinitionService(ctx.serverDB, ctx.userId, workspaceId),
      issueRecurrences: new TaskIssueRecurrenceModel(ctx.serverDB, ctx.userId, workspaceId),
      issueRecurrenceService: new TaskIssueRecurrenceService(ctx.serverDB, ctx.userId, workspaceId),
      taskHistory: new TaskDescriptionHistoryModel(ctx.serverDB, ctx.userId, workspaceId),
      taskResources: new TaskResourceModel(ctx.serverDB, ctx.userId, workspaceId),
      editLockService: new EditLockService(ctx.userId),
    },
  });
});
const writeProcedure = taskMenuProcedure.use(withScopedPermission('agent:update'));
const idInput = z.object({ id: z.string().min(1) });

const failure = (error: unknown): never => {
  if (error instanceof TRPCError) throw error;
  if (error instanceof TaskDependencyError)
    throw new TRPCError({ code: error.code, message: error.message, cause: error });
  if (error instanceof TaskRevisionConflictError)
    throw new TRPCError({ code: 'CONFLICT', message: error.message });
  if (
    error instanceof Error &&
    ['Task not found', 'Description version not found', 'Recurring issue not found'].includes(
      error.message,
    )
  ) {
    throw new TRPCError({ code: 'NOT_FOUND', message: error.message });
  }
  if (
    error instanceof Error &&
    (error.message.startsWith('Use an HTTP') || error.message.startsWith('Use a GitHub'))
  ) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
  }
  if (error instanceof Error && error.message === 'This is the current description version') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
  }
  console.error('[taskMenu]', error);
  throw new TRPCError({
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Issue update failed',
  });
};

export const taskMenuRouter = router({
  clearDuplicate: writeProcedure
    .input(idInput.extend({ expectedDomainRevision: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return { data: await ctx.issueDefinitions.clearDuplicate(input), success: true };
      } catch (error) {
        return failure(error);
      }
    }),
  addLink: writeProcedure
    .input(
      idInput.extend({
        kind: z.enum(['link', 'pull_request']),
        title: z.string().trim().max(255).optional(),
        url: z.url().max(2048),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return { data: await ctx.taskResources.add(input.id, input), success: true };
      } catch (error) {
        return failure(error);
      }
    }),
  convertToProject: writeProcedure
    .input(
      idInput.extend({
        expectedDomainRevision: z.number().int().positive(),
        identifier: z
          .string()
          .trim()
          .min(3)
          .max(6)
          .regex(/^[A-Z0-9]+$/i),
        issueName: z.string().trim().min(1).max(255),
        name: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return { data: await ctx.issueDefinitions.convertToProject(input), success: true };
      } catch (error) {
        return failure(error);
      }
    }),
  convertToRecurring: writeProcedure
    .input(
      idInput.extend({
        expectedDomainRevision: z.number().int().positive(),
        firstDueDate: z.iso.date(),
        cadence: z.enum(['day', 'week', 'month', 'year']),
        interval: z.number().int().positive().optional(),
        timezone: z.string().trim().min(1).max(100),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return { data: await ctx.issueRecurrenceService.convert(input), success: true };
      } catch (error) {
        return failure(error);
      }
    }),
  convertToTemplate: writeProcedure
    .input(
      idInput.extend({
        expectedDomainRevision: z.number().int().positive(),
        name: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return { data: await ctx.issueDefinitions.convertToTemplate(input), success: true };
      } catch (error) {
        return failure(error);
      }
    }),
  copyIssue: writeProcedure
    .input(
      idInput.extend({
        expectedDomainRevision: z.number().int().positive(),
        name: z.string().trim().min(1).max(255).optional(),
        includeSubIssues: z.boolean().optional(),
        copyLabels: z.boolean().optional(),
        copyAssignees: z.boolean().optional(),
        copyDueDate: z.boolean().optional(),
        copyProject: z.boolean().optional(),
        copyTeam: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return { data: await ctx.issueDefinitions.copyIssue(input), success: true };
      } catch (error) {
        return failure(error);
      }
    }),
  createFromTemplate: writeProcedure
    .input(z.object({ templateId: z.uuid(), name: z.string().trim().min(1).max(255).optional() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return { data: await ctx.issueDefinitions.createFromTemplate(input), success: true };
      } catch (error) {
        return failure(error);
      }
    }),
  createRelated: writeProcedure
    .input(
      idInput.extend({
        expectedDomainRevision: z.number().int().positive(),
        kind: z.enum(['related', 'sub_issue', 'parent', 'blocked', 'blocking']),
        name: z.string().trim().min(1).max(255),
        instruction: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return { data: await ctx.issueDefinitions.createRelated(input), success: true };
      } catch (error) {
        return failure(error);
      }
    }),
  descriptionHistory: taskMenuProcedure
    .input(
      idInput.extend({
        beforeRevision: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        return { data: await ctx.taskHistory.list(input.id, input), success: true };
      } catch (error) {
        return failure(error);
      }
    }),
  links: taskMenuProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      return { data: await ctx.taskResources.list(input.id), success: true };
    } catch (error) {
      return failure(error);
    }
  }),
  markDuplicate: writeProcedure
    .input(
      idInput.extend({
        expectedDomainRevision: z.number().int().positive(),
        targetId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return { data: await ctx.issueDefinitions.markDuplicate(input), success: true };
      } catch (error) {
        return failure(error);
      }
    }),
  recurrence: taskMenuProcedure.input(idInput).query(async ({ input, ctx }) => {
    try {
      return { data: await ctx.issueRecurrences.findForTask(input.id), success: true };
    } catch (error) {
      return failure(error);
    }
  }),
  removeLink: writeProcedure
    .input(idInput.extend({ linkId: z.uuid() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return { data: await ctx.taskResources.remove(input.id, input.linkId), success: true };
      } catch (error) {
        return failure(error);
      }
    }),
  removeRecurrence: writeProcedure.input(idInput).mutation(async ({ input, ctx }) => {
    try {
      return { data: await ctx.issueRecurrences.remove(input.id), success: true };
    } catch (error) {
      return failure(error);
    }
  }),
  restoreDescription: writeProcedure
    .input(
      idInput.extend({ expectedDomainRevision: z.number().int().positive(), historyId: z.uuid() }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const task = await ctx.taskModel.resolve(input.id);
        if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
        if (ctx.workspaceId && (await ctx.editLockService.getBlockingHolder('task', task.id))) {
          throw new TRPCError({
            cause: { data: { code: 'DocumentLocked' } },
            code: 'CONFLICT',
            message: 'Task is being edited by another user',
          });
        }
        const updated = await ctx.taskHistory.restore(
          task.id,
          input.historyId,
          input.expectedDomainRevision,
        );

        return { data: updated, success: true };
      } catch (error) {
        return failure(error);
      }
    }),
  setRecurrenceEnabled: writeProcedure
    .input(idInput.extend({ enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return {
          data: await ctx.issueRecurrences.setEnabled(input.id, input.enabled),
          success: true,
        };
      } catch (error) {
        return failure(error);
      }
    }),
  templates: taskMenuProcedure.query(async ({ ctx }) => {
    try {
      return { data: await ctx.issueDefinitions.templates(), success: true };
    } catch (error) {
      return failure(error);
    }
  }),
});
