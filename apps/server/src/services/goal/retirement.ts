import { TRPCError } from '@trpc/server';

/** Historical Goal graphs remain readable; Issue plans own new orchestration. */
export function assertGoalExecutionAvailable(): never {
  throw new TRPCError({
    code: 'METHOD_NOT_SUPPORTED',
    message: 'Standalone Goal execution is unavailable; use an Issue plan and Checklist',
  });
}
