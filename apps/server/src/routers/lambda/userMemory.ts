import {
  AsyncTaskError,
  AsyncTaskErrorType,
  AsyncTaskStatus,
  AsyncTaskType,
  CreateUserMemoryIdentitySchema,
  UpdateUserMemoryIdentitySchema,
  type UserMemoryExtractionMetadata,
} from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { AsyncTaskModel, initUserMemoryExtractionMetadata } from '@/database/models/asyncTask';
import {
  UserMemoryActivityModel,
  UserMemoryContextModel,
  UserMemoryExperienceModel,
  UserMemoryIdentityModel,
  UserMemoryModel,
  UserMemoryPreferenceModel,
} from '@/database/models/userMemory';
import {
  UserPersonaModel,
  UserPersonaVersionNotFoundError,
  UserPersonaVersionSnapshotMissingError,
} from '@/database/models/userMemory/persona';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { cancelHatchetWorkflow } from '@/server/services/hatchet/workflows';

const userMemoryProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const wsId = ctx.workspaceId ?? undefined;

  return opts.next({
    ctx: {
      activityModel: new UserMemoryActivityModel(ctx.serverDB, ctx.userId),
      asyncTaskModel: new AsyncTaskModel(ctx.serverDB, ctx.userId, wsId),
      contextModel: new UserMemoryContextModel(ctx.serverDB, ctx.userId),
      experienceModel: new UserMemoryExperienceModel(ctx.serverDB, ctx.userId),
      identityModel: new UserMemoryIdentityModel(ctx.serverDB, ctx.userId),
      personaModel: new UserPersonaModel(ctx.serverDB, ctx.userId),
      preferenceModel: new UserMemoryPreferenceModel(ctx.serverDB, ctx.userId),
      userMemoryModel: new UserMemoryModel(ctx.serverDB, ctx.userId),
    },
  });
});
const userMemoryWriteProcedure = userMemoryProcedure.use(withScopedPermission('message:create'));
const personalUserMemoryProcedure = userMemoryProcedure.use(async ({ ctx, next }) => {
  if (ctx.workspaceId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Persona versions are available only in personal scope',
    });
  }
  return next();
});
const personalUserMemoryWriteProcedure = personalUserMemoryProcedure.use(
  withScopedPermission('message:create'),
);

export const userMemoryRouter = router({
  // ============ Identity CRUD ============
  createIdentity: userMemoryWriteProcedure
    .input(CreateUserMemoryIdentitySchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.userMemoryModel.addIdentityEntry({
        base: {},
        identity: {
          description: input.description,
          episodicDate: input.episodicDate,
          relationship: input.relationship,
          role: input.role,
          tags: input.extractedLabels,
          type: input.type,
        },
      });
    }),

  // ============ Activity CRUD ============
  deleteActivity: userMemoryWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.activityModel.delete(input.id);
    }),

  deleteAll: userMemoryWriteProcedure.mutation(async ({ ctx }) => {
    await ctx.userMemoryModel.deleteAll();
    await ctx.personaModel.deletePersona();

    // NOTICE: Do NOT reset topic extraction markers here. Re-opening every
    // historical chat for re-extraction would silently rebuild the profile the
    // user just purged (the former resetMemoryExtractStatus loophole). Topics
    // keep their 'completed' markers, so only genuinely new conversations are
    // extracted going forward — and only while the user keeps memory enabled.
    //
    // An in-flight user-initiated extraction task must not keep writing after
    // the purge either, so request its cooperative cancellation and cancel the
    // recorded workflow runs — the same teardown as the cancel webhook.
    const activeTask = await ctx.asyncTaskModel.findActiveByType(
      AsyncTaskType.UserMemoryExtractionWithChatTopic,
    );
    if (activeTask) {
      const metadata = initUserMemoryExtractionMetadata(
        activeTask.metadata as UserMemoryExtractionMetadata | undefined,
      );
      const nextMetadata: UserMemoryExtractionMetadata = {
        ...metadata,
        control: {
          ...metadata.control,
          cancelRequestedAt: metadata.control?.cancelRequestedAt || new Date().toISOString(),
          cancelledBy: 'user',
        },
      };

      await ctx.asyncTaskModel.update(activeTask.id, {
        error: new AsyncTaskError(
          AsyncTaskErrorType.TaskCancelled,
          'Memory extraction cancelled because all memories were purged',
        ),
        metadata: nextMetadata,
        status: AsyncTaskStatus.Error,
      });

      const workflowRunIds = metadata.control?.hatchet?.workflowRunIds || [];
      if (workflowRunIds.length > 0) {
        try {
          await Promise.allSettled(
            workflowRunIds.map((workflowRunId) => cancelHatchetWorkflow(workflowRunId)),
          );
        } catch (error) {
          console.error('[userMemory.deleteAll] failed to cancel extraction workflow runs', error);
        }
      }
    }

    return { success: true };
  }),

  // ============ Context CRUD ============
  deleteContext: userMemoryWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.contextModel.delete(input.id);
    }),

  // ============ Experience CRUD ============
  deleteExperience: userMemoryWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.experienceModel.delete(input.id);
    }),

  deleteIdentity: userMemoryWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.userMemoryModel.removeIdentityEntry(input.id);
    }),

  // ============ Preference CRUD ============
  deletePreference: userMemoryWriteProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.preferenceModel.delete(input.id);
    }),

  getActivities: userMemoryProcedure.query(async ({ ctx }) => {
    return ctx.userMemoryModel.searchActivities({});
  }),

  getContexts: userMemoryProcedure.query(async ({ ctx }) => {
    return ctx.userMemoryModel.searchContexts({});
  }),

  getExperiences: userMemoryProcedure.query(async ({ ctx }) => {
    return ctx.userMemoryModel.searchExperiences({});
  }),

  getIdentities: userMemoryProcedure.query(async ({ ctx }) => {
    return ctx.userMemoryModel.getAllIdentities();
  }),

  // ============ Persona ============
  getPersona: userMemoryProcedure.query(async ({ ctx }) => {
    const latest = await ctx.personaModel.getLatestPersonaDocument();

    if (!latest) return null;

    return {
      content: latest.persona ?? '',
      summary: latest.tagline ?? '',
    };
  }),

  listPersonaVersions: personalUserMemoryProcedure.query(async ({ ctx }) => {
    return ctx.personaModel.listVersions();
  }),

  getPreferences: userMemoryProcedure.query(async ({ ctx }) => {
    return ctx.userMemoryModel.searchPreferences({});
  }),

  restorePersonaVersion: personalUserMemoryWriteProcedure
    .input(z.object({ historyId: z.string().trim().min(1).max(255) }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        const { document } = await ctx.personaModel.restoreVersion(input.historyId);
        return { historyId: input.historyId, personaVersion: document.version };
      } catch (error) {
        if (error instanceof UserPersonaVersionNotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Persona version was not found' });
        }
        if (error instanceof UserPersonaVersionSnapshotMissingError) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Persona version snapshot is unavailable',
          });
        }
        throw error;
      }
    }),

  updateActivity: userMemoryWriteProcedure
    .input(
      z.object({
        data: z.object({
          narrative: z.string().optional(),
          notes: z.string().optional(),
          status: z.string().optional(),
        }),
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.activityModel.update(input.id, input.data);
    }),

  updateContext: userMemoryWriteProcedure
    .input(
      z.object({
        data: z.object({
          currentStatus: z.string().optional(),
          description: z.string().optional(),
          title: z.string().optional(),
        }),
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.contextModel.update(input.id, input.data);
    }),

  updateExperience: userMemoryWriteProcedure
    .input(
      z.object({
        data: z.object({
          action: z.string().optional(),
          keyLearning: z.string().optional(),
          situation: z.string().optional(),
        }),
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.experienceModel.update(input.id, input.data);
    }),

  updateIdentity: userMemoryWriteProcedure
    .input(
      z.object({
        data: UpdateUserMemoryIdentitySchema,
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.userMemoryModel.updateIdentityEntry({
        identity: {
          description: input.data.description,
          episodicDate: input.data.episodicDate,
          relationship: input.data.relationship,
          role: input.data.role,
          tags: input.data.extractedLabels,
          type: input.data.type,
        },
        identityId: input.id,
      });
    }),

  updatePreference: userMemoryWriteProcedure
    .input(
      z.object({
        data: z.object({
          conclusionDirectives: z.string().optional(),
          suggestions: z.string().optional(),
        }),
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.preferenceModel.update(input.id, input.data);
    }),
});

export type UserMemoryRouter = typeof userMemoryRouter;
