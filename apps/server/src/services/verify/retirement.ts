import { TRPCError } from '@trpc/server';

/** The Issue Checklist writes shared ledger models directly; only the old engine is retired. */
export const assertLegacyVerificationWritable = (): void => {
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: 'Standalone Acceptance/Verify is retired. Use the Issue Checklist.',
  });
};
