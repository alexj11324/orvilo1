import { asyncRouter as router, publicProcedure } from '@/libs/trpc/async';

import { documentRouter } from './document';
import { fileRouter } from './file';
import { ragEvalRouter } from './ragEval';

export const asyncRouter = router({
  document: documentRouter,
  file: fileRouter,
  healthcheck: publicProcedure.query(() => "i'm live!"),
  ragEval: ragEvalRouter,
});

export type AsyncRouter = typeof asyncRouter;

export type { UnifiedAsyncCaller } from './caller';
export { createAsyncCaller, createAsyncServerClient } from './caller';
