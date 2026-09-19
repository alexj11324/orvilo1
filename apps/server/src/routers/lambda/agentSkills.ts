import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { AgentSkillModel } from '@/database/models/agentSkill';
import { FileModel } from '@/database/models/file';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { FileService } from '@/server/services/file';
import { SkillResourceError, SkillResourceService } from '@/server/services/skill';

// ===== Procedures with Context =====

// Reads: workspace-aware, any member can read. In personal mode the request
// runs without workspace context (legacy behavior preserved).
//
// This router is read-only by design. Creating, importing, updating and
// deleting platform skills was the Skill-management product chain, which is
// retired — see `docs/development/hidden-surface-retirement.md`. The read
// procedures stay because the agent runtime still resolves skills the user
// already has (`skillPreload` / `skillEngineering` / the desktop skill runtime)
// and because builtin skills are injected from those rows.
const skillProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const workspaceId = ctx.workspaceId ?? undefined;
  const skillModel = new AgentSkillModel(ctx.serverDB, ctx.userId, workspaceId);

  return opts.next({
    ctx: {
      fileModel: new FileModel(ctx.serverDB, ctx.userId, workspaceId),
      fileService: new FileService(ctx.serverDB, ctx.userId, workspaceId),
      skillModel,
    },
  });
});

const skillResourceProcedure = skillProcedure.use(async (opts) => {
  const { ctx } = opts;

  return opts.next({
    ctx: {
      // workspace-audit: intentionally personal-scoped (no workspaceId). This service
      // only reads skill resource files by content hash (global, deduplicated files),
      // never runs a per-workspace row query, so workspace scoping is a no-op here.
      skillResourceService: new SkillResourceService(ctx.serverDB, ctx.userId),
    },
  });
});

// ===== Router =====

export const agentSkillsRouter = router({
  // ===== Query =====

  getById: skillProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    return ctx.skillModel.findById(input.id);
  }),

  getByIdWithZipUrl: skillProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const skill = await ctx.skillModel.findById(input.id);
      if (!skill) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Skill not found' });
      }

      if (!skill.zipFileHash) {
        return { name: skill.name, url: null };
      }

      const fileInfo = await ctx.fileModel.checkHash(skill.zipFileHash);
      if (!fileInfo.isExist || !fileInfo.url) {
        return { name: skill.name, url: null };
      }

      const fullUrl = await ctx.fileService.getFullFileUrl(fileInfo.url);
      return { name: skill.name, url: fullUrl || null };
    }),

  getByIdentifier: skillProcedure
    .input(z.object({ identifier: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.skillModel.findByIdentifier(input.identifier);
    }),

  getByName: skillProcedure.input(z.object({ name: z.string() })).query(async ({ ctx, input }) => {
    return ctx.skillModel.findByName(input.name);
  }),

  list: skillProcedure
    .input(
      z
        .object({
          source: z.enum(['builtin', 'market', 'user']).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      if (input?.source) {
        return ctx.skillModel.listBySource(input.source);
      }

      return ctx.skillModel.findAll();
    }),

  listResources: skillResourceProcedure
    .input(z.object({ id: z.string(), includeContent: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const skill = await ctx.skillModel.findById(input.id);
      if (!skill) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Skill not found' });
      }

      if (!skill.resources) {
        return [];
      }

      return ctx.skillResourceService.listResources(skill.resources, input.includeContent);
    }),

  readResource: skillResourceProcedure
    .input(
      z.object({
        id: z.string(),
        path: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const skill = await ctx.skillModel.findById(input.id);
      if (!skill) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Skill not found' });
      }

      if (!skill.resources || Object.keys(skill.resources).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Skill has no resources' });
      }

      try {
        return await ctx.skillResourceService.readResource(skill.resources, input.path);
      } catch (error) {
        if (error instanceof SkillResourceError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: error.message });
        }

        throw error;
      }
    }),

  search: skillProcedure.input(z.object({ query: z.string() })).query(async ({ ctx, input }) => {
    return ctx.skillModel.search(input.query);
  }),
});

export type AgentSkillsRouter = typeof agentSkillsRouter;
