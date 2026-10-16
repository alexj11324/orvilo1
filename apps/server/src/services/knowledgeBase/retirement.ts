import { TRPCError } from '@trpc/server';

/** Historical libraries remain readable; the platform no longer produces them. */
export const rejectPlatformKnowledgeBaseWrite = (): never => {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Platform knowledge bases are retired',
  });
};
