import { TRPCError } from '@trpc/server';

/**
 * Historical Goal graphs remain readable; Issue plans own new orchestration.
 * Declared `void`, like the retired Verify guard: a `never` return marks every
 * following statement unreachable and the historical implementation stops
 * typechecking.
 */
export function assertGoalExecutionAvailable(): void {
  throw new TRPCError({
    code: 'METHOD_NOT_SUPPORTED',
    message: 'Standalone Goal execution is unavailable; use an Issue plan and Checklist',
  });
}
