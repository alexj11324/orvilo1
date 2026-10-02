import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { ExperienceMemoryModel } from '@/database/models/experienceMemory';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { primeLexicalSearch } from '@/server/services/memory/experience/primeLexical';

const personal = wsCompatProcedure.use(serverDatabase).use(({ ctx, next }) => {
  if (ctx.workspaceId)
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Experiences require personal scope' });
  return next({ ctx: { experienceMemory: new ExperienceMemoryModel(ctx.serverDB, ctx.userId) } });
});
const write = personal.use(withScopedPermission('message:create'));
const content = z
  .string()
  .trim()
  .min(1)
  .max(16384)
  .refine((value) => Buffer.byteLength(value) <= 16384);
const version = { id: z.string().uuid(), revision: z.number().int().positive() };
const changed = <T>(row: T | undefined): T => {
  if (!row)
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Experience unavailable or changed; reload and retry',
    });
  return row;
};
export const experienceMemoryRouter = router({
  list: personal
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          offset: z.number().int().min(0).max(10000).default(0),
        })
        .strict(),
    )
    .query(({ ctx, input }) => ctx.experienceMemory.list(input.limit, input.offset)),
  search: personal
    .input(
      z
        .object({
          query: z.string().trim().min(1).max(512),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const corpus = await ctx.experienceMemory.list(500);
      try {
        const ids = await primeLexicalSearch(corpus.items, input.query, input.limit);
        // Re-read live SQL after the subprocess: deleted/edited rows must not escape a stale snapshot.
        const fresh = await ctx.experienceMemory.list(500);
        const items = ids.flatMap((id) => {
          const old = corpus.items.find((row) => row.id === id);
          const row = fresh.items.find((candidate) => candidate.id === id);
          return row && old && row.content === old.content && row.revision === old.revision
            ? [row]
            : [];
        });
        return { items, truncated: corpus.hasMore || fresh.hasMore };
      } catch {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'Pinned Prime lexical search is unavailable; saved experiences remain accessible',
        });
      }
    }),
  create: write
    .input(z.object({ kind: z.literal('experience'), content }).strict())
    .mutation(({ ctx, input }) => ctx.experienceMemory.create(input)),
  update: write
    .input(z.object({ ...version, content }).strict())
    .mutation(async ({ ctx, input }) =>
      changed(await ctx.experienceMemory.update(input.id, input.revision, input.content)),
    ),
  delete: write.input(z.object(version).strict()).mutation(async ({ ctx, input }) => {
    changed(await ctx.experienceMemory.delete(input.id, input.revision));
    return { success: true };
  }),
});
