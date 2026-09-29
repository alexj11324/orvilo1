import { CUSTOM_DOCUMENT_FILE_TYPE } from '@orvilo/const';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { DocumentModel } from '@/database/models/document';
import { TeamModel } from '@/database/models/team';
import {
  TEAM_RESOURCE_DOCUMENT_ALREADY_ATTACHED,
  TEAM_RESOURCE_DOCUMENT_NOT_ATTACHABLE,
  TEAM_RESOURCE_NOT_FOUND,
  TEAM_RESOURCE_OWNED_DOCUMENT,
  TEAM_RESOURCE_SECTION_NOT_FOUND,
  TEAM_RESOURCE_TEAM_NOT_FOUND,
  TeamResourceModel,
} from '@/database/models/teamResource';
import type { OrviloDatabase } from '@/database/type';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { canViewDocumentContent } from '@/server/services/documentAccess';
import { getResourceMeta } from '@/server/services/resourcePermission';
import { hasWorkspaceScopedPermission } from '@/server/services/workspacePermission';

const teamResourceProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const workspaceId = ctx.workspaceId;
  if (!workspaceId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspaceId is required' });
  }
  return opts.next({
    ctx: {
      documentModel: new DocumentModel(ctx.serverDB, ctx.userId, workspaceId),
      teamModel: new TeamModel(ctx.serverDB, ctx.userId, workspaceId),
      teamResourceModel: new TeamResourceModel(ctx.serverDB, ctx.userId, workspaceId),
      workspaceId,
    },
  });
});

const teamResourceReadProcedure = teamResourceProcedure.use(withScopedPermission('document:read'));
const teamResourceWriteProcedure = teamResourceProcedure.use(withScopedPermission('agent:update'));
const teamDocumentCreateProcedure = teamResourceProcedure
  .use(withScopedPermission('agent:update'))
  .use(withScopedPermission('document:create'));

const teamInput = z.object({ teamId: z.string().min(1) });
const sectionInput = teamInput.extend({ sectionId: z.uuid() });
const resourceInput = teamInput.extend({ resourceId: z.uuid() });
const position = z.number().int().min(0).max(1_000_000_000);

const assertTeamReadable = async (ctx: { teamModel: TeamModel }, teamId: string): Promise<void> => {
  if (!(await ctx.teamModel.hasReadAccess(teamId))) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
  }
};

const assertTeamWritable = async (ctx: { teamModel: TeamModel }, teamId: string): Promise<void> => {
  const team = await ctx.teamModel.findById(teamId);
  if (!team) throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
  if (!(await ctx.teamModel.hasWriteAccess(teamId))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Team write access required' });
  }
};

const mapTeamResourceError = (error: unknown, procedure: string): never => {
  if (error instanceof TRPCError) throw error;
  if (error instanceof Error) {
    if (
      error.message === TEAM_RESOURCE_SECTION_NOT_FOUND ||
      error.message === TEAM_RESOURCE_TEAM_NOT_FOUND ||
      error.message === TEAM_RESOURCE_NOT_FOUND ||
      error.message === TEAM_RESOURCE_DOCUMENT_NOT_ATTACHABLE
    ) {
      throw new TRPCError({ code: 'NOT_FOUND', message: error.message });
    }
    if (error.message === TEAM_RESOURCE_DOCUMENT_ALREADY_ATTACHED) {
      throw new TRPCError({ code: 'CONFLICT', message: error.message });
    }
    if (error.message === TEAM_RESOURCE_OWNED_DOCUMENT) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error.message });
    }
    if (error.message.startsWith('Team resource link')) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
    }
  }
  console.error(`[teamResource:${procedure}]`, error);
  throw new TRPCError({
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Failed to update team resources',
  });
};

export const teamResourceRouter = router({
  attachDocument: teamResourceWriteProcedure
    .input(
      teamInput.extend({
        documentId: z.string().min(1),
        position: position.optional(),
        sectionId: z.uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await assertTeamWritable(ctx, input.teamId);
        const meta = await getResourceMeta(ctx.serverDB, 'document', input.documentId);
        if (
          !meta ||
          meta.workspaceId !== ctx.workspaceId ||
          meta.visibility !== 'public' ||
          !(await canViewDocumentContent({
            db: ctx.serverDB,
            meta,
            resourceId: input.documentId,
            userId: ctx.userId,
            workspaceId: ctx.workspaceId,
          }))
        ) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' });
        }
        const resource = await ctx.teamResourceModel.attachDocument(input);
        return { data: resource, message: 'Document attached', success: true };
      } catch (error) {
        return mapTeamResourceError(error, 'attachDocument');
      }
    }),

  createDocument: teamDocumentCreateProcedure
    .input(
      teamInput.extend({
        position: position.optional(),
        sectionId: z.uuid().nullable().optional(),
        title: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await assertTeamWritable(ctx, input.teamId);
        const { document, resource } = await ctx.serverDB.transaction(async (tx) => {
          const db = tx as OrviloDatabase;
          const documentModel = new DocumentModel(db, ctx.userId, ctx.workspaceId);
          const teamResourceModel = new TeamResourceModel(db, ctx.userId, ctx.workspaceId);
          const document = await documentModel.create({
            content: '',
            editorData: {},
            fileType: CUSTOM_DOCUMENT_FILE_TYPE,
            filename: input.title,
            source: 'document',
            sourceType: 'api',
            teamId: input.teamId,
            title: input.title,
            totalCharCount: 0,
            totalLineCount: 0,
            visibility: 'team',
            workspaceId: ctx.workspaceId,
          });
          const resource = await teamResourceModel.placeTeamDocument({
            documentId: document.id,
            position: input.position,
            sectionId: input.sectionId,
            teamId: input.teamId,
          });
          return { document, resource };
        });
        return {
          data: {
            document: { id: document.id, slug: document.slug, title: document.title },
            resource,
          },
          message: 'Team document created',
          success: true,
        };
      } catch (error) {
        return mapTeamResourceError(error, 'createDocument');
      }
    }),

  createLink: teamResourceWriteProcedure
    .input(
      teamInput.extend({
        position: position.optional(),
        sectionId: z.uuid().nullable().optional(),
        title: z.string().max(255).optional(),
        url: z.string().min(1).max(8192),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await assertTeamWritable(ctx, input.teamId);
        const resource = await ctx.teamResourceModel.createLink(input);
        return { data: resource, message: 'Link created', success: true };
      } catch (error) {
        return mapTeamResourceError(error, 'createLink');
      }
    }),

  createSection: teamResourceWriteProcedure
    .input(
      teamInput.extend({
        name: z.string().trim().min(1).max(255),
        position: position.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await assertTeamWritable(ctx, input.teamId);
        const section = await ctx.teamResourceModel.createSection(input);
        return { data: section, message: 'Section created', success: true };
      } catch (error) {
        return mapTeamResourceError(error, 'createSection');
      }
    }),

  deleteSection: teamResourceWriteProcedure.input(sectionInput).mutation(async ({ ctx, input }) => {
    try {
      await assertTeamWritable(ctx, input.teamId);
      const section = await ctx.teamResourceModel.deleteSection(input.teamId, input.sectionId);
      if (!section) throw new Error(TEAM_RESOURCE_SECTION_NOT_FOUND);
      return { data: section, message: 'Section deleted', success: true };
    } catch (error) {
      return mapTeamResourceError(error, 'deleteSection');
    }
  }),

  detachDocument: teamResourceWriteProcedure
    .input(resourceInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await assertTeamWritable(ctx, input.teamId);
        const resource = await ctx.teamResourceModel.detachDocument(input.teamId, input.resourceId);
        if (!resource) throw new Error(TEAM_RESOURCE_NOT_FOUND);
        return { data: resource, message: 'Document detached', success: true };
      } catch (error) {
        return mapTeamResourceError(error, 'detachDocument');
      }
    }),

  list: teamResourceReadProcedure.input(teamInput).query(async ({ ctx, input }) => {
    await assertTeamReadable(ctx, input.teamId);
    const canWrite =
      (await ctx.teamModel.hasWriteAccess(input.teamId)) &&
      (await hasWorkspaceScopedPermission({
        action: 'AGENT_UPDATE',
        db: ctx.serverDB,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      }));
    const canCreateDocument =
      canWrite &&
      (await hasWorkspaceScopedPermission({
        action: 'DOCUMENT_CREATE',
        db: ctx.serverDB,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      }));
    const result = await ctx.teamResourceModel.list(input.teamId);
    const resources = (
      await Promise.all(
        result.resources.map(async (resource) => {
          if (!resource.documentId) return { ...resource, kind: 'link' as const };

          const meta = await getResourceMeta(ctx.serverDB, 'document', resource.documentId);
          if (
            !meta ||
            meta.workspaceId !== ctx.workspaceId ||
            !(await canViewDocumentContent({
              db: ctx.serverDB,
              meta,
              resourceId: resource.documentId,
              userId: ctx.userId,
              workspaceId: ctx.workspaceId,
            }))
          ) {
            return null;
          }
          const document = await ctx.documentModel.findById(resource.documentId);
          if (!document || (document.visibility === 'team' && document.teamId !== input.teamId)) {
            return null;
          }
          return {
            ...resource,
            document: {
              id: document.id,
              slug: document.slug,
              teamId: document.teamId,
              title: document.title,
              visibility: document.visibility,
            },
            kind: 'document' as const,
            ownedByTeam: document.visibility === 'team' && document.teamId === input.teamId,
          };
        }),
      )
    ).filter((resource) => resource !== null);

    return {
      data: { canCreateDocument, canWrite, resources, sections: result.sections },
      success: true,
    };
  }),

  moveResource: teamResourceWriteProcedure
    .input(
      resourceInput.extend({
        position,
        sectionId: z.uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await assertTeamWritable(ctx, input.teamId);
        const resource = await ctx.teamResourceModel.moveResource(input);
        if (!resource) throw new Error(TEAM_RESOURCE_NOT_FOUND);
        return { data: resource, message: 'Resource moved', success: true };
      } catch (error) {
        return mapTeamResourceError(error, 'moveResource');
      }
    }),

  removeLink: teamResourceWriteProcedure.input(resourceInput).mutation(async ({ ctx, input }) => {
    try {
      await assertTeamWritable(ctx, input.teamId);
      const resource = await ctx.teamResourceModel.removeLink(input.teamId, input.resourceId);
      if (!resource) throw new Error(TEAM_RESOURCE_NOT_FOUND);
      return { data: resource, message: 'Link removed', success: true };
    } catch (error) {
      return mapTeamResourceError(error, 'removeLink');
    }
  }),

  renameSection: teamResourceWriteProcedure
    .input(sectionInput.extend({ name: z.string().trim().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await assertTeamWritable(ctx, input.teamId);
        const section = await ctx.teamResourceModel.renameSection(
          input.teamId,
          input.sectionId,
          input.name,
        );
        if (!section) throw new Error(TEAM_RESOURCE_SECTION_NOT_FOUND);
        return { data: section, message: 'Section renamed', success: true };
      } catch (error) {
        return mapTeamResourceError(error, 'renameSection');
      }
    }),

  reorderSection: teamResourceWriteProcedure
    .input(sectionInput.extend({ position }))
    .mutation(async ({ ctx, input }) => {
      try {
        await assertTeamWritable(ctx, input.teamId);
        const section = await ctx.teamResourceModel.reorderSection(
          input.teamId,
          input.sectionId,
          input.position,
        );
        if (!section) throw new Error(TEAM_RESOURCE_SECTION_NOT_FOUND);
        return { data: section, message: 'Section reordered', success: true };
      } catch (error) {
        return mapTeamResourceError(error, 'reorderSection');
      }
    }),

  updateLink: teamResourceWriteProcedure
    .input(
      resourceInput.extend({
        title: z.string().max(255).optional(),
        url: z.string().min(1).max(8192),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await assertTeamWritable(ctx, input.teamId);
        const resource = await ctx.teamResourceModel.updateLink(input.teamId, input.resourceId, {
          title: input.title,
          url: input.url,
        });
        if (!resource) throw new Error(TEAM_RESOURCE_NOT_FOUND);
        return { data: resource, message: 'Link updated', success: true };
      } catch (error) {
        return mapTeamResourceError(error, 'updateLink');
      }
    }),
});
