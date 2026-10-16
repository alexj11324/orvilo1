import { publicProcedure, router } from '@/libs/trpc/lambda';

import { marketRouter } from './market';
import { searchRouter } from './search';

export const toolsRouter = router({
  healthcheck: publicProcedure.query(() => "i'm live!"),

  market: marketRouter,
  search: searchRouter,
});

export type ToolsRouter = typeof toolsRouter;
