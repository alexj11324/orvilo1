import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { createFtsSearchRepo } from '@/server/services/ftsSearch';

import { getRestrictedKnowledgeBaseIds } from './_helpers/knowledgeBaseAccess';

const searchProcedure = wsCompatProcedure.use(serverDatabase);

/**
 * The unified search router for all entities in the database.
 *
 * Can specify the type of entity to search for.
 */
export const searchRouter = router({
  query: searchProcedure
    .input(
      z.object({
        agentId: z.string().optional(),
        limitPerType: z.number().optional(),
        offset: z.number().optional(),
        query: z.string(),
        type: z
          .enum([
            'agent',
            'chatGroup',
            'topic',
            'file',
            'folder',
            'message',
            'page',
            'memory',
            'knowledgeBase',
          ])
          .optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { query, type } = input;

      if (!query || query.trim() === '') return [];

      // Restricted KBs and their linked files/folders/pages must not be
      // discoverable through unified search. Other types skip these lookups.
      const needsKbExclusion = !type || ['file', 'folder', 'knowledgeBase', 'page'].includes(type);
      const [excludeKnowledgeBaseIds, ftsSearchRepo] = await Promise.all([
        needsKbExclusion ? getRestrictedKnowledgeBaseIds(ctx) : [],
        createFtsSearchRepo({
          db: ctx.serverDB,
          userId: ctx.userId,
          usage: 'unified_search',
          workspaceId: ctx.workspaceId ?? undefined,
        }),
      ]);

      return ftsSearchRepo.search({ ...input, excludeKnowledgeBaseIds });
    }),
});
