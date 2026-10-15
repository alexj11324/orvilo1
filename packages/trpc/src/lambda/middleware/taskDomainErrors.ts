import { TaskDomainError } from '@orvilo/database/errors/task';
import { TRPCError } from '@trpc/server';

import { trpc } from '../init';

/** Preserve task domain failures across RPC entrypoints, including indirect service calls. */
export const taskDomainErrors = trpc.middleware(async ({ next }) => {
  const result = await next();
  if (result.ok || result.error.code !== 'INTERNAL_SERVER_ERROR') return result;

  let cause: unknown = result.error.cause;
  const seen = new Set<unknown>();
  while (cause instanceof Error && !seen.has(cause)) {
    seen.add(cause);
    if (cause instanceof TaskDomainError) {
      return {
        ...result,
        error: new TRPCError({
          cause: cause.cause ?? cause,
          code: cause.code,
          message: cause.message,
        }),
      };
    }
    // An explicit transport decision must not be replaced by a nested domain error.
    if (cause instanceof TRPCError && cause.code !== 'INTERNAL_SERVER_ERROR') break;
    cause = cause.cause;
  }
  return result;
});
