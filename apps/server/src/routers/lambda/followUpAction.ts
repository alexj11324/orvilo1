import { FollowUpExtractInputSchema } from '@orvilo/types';
import { TRPCError } from '@trpc/server';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { router } from '@/libs/trpc/lambda';

// Keep the released route recognizable to older clients, without invoking a model.
export const followUpActionRouter = router({
  extract: wsCompatProcedure
    .use(withScopedPermission('message:create'))
    .input(FollowUpExtractInputSchema)
    .mutation(() => {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'FEATURE_RETIRED' });
    }),
});
