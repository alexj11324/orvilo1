/**
 * Why a relation write was refused. Clients pick their copy from this, so the
 * values are a wire contract: add new ones, never rename.
 */
export type TaskRelationRejectionReason =
  | 'ALREADY_BLOCKING'
  | 'BROKEN_PARENT_CHAIN'
  | 'CROSS_PROJECT'
  | 'CYCLE'
  | 'SELF'
  | 'UNAVAILABLE'
  | 'UNFINISHED_PREREQUISITE';

/** A dependency rejection is actionable, not an internal server failure. */
export class TaskDependencyError extends Error {
  readonly code: 'BAD_REQUEST' | 'PRECONDITION_FAILED';
  /**
   * Present only with a `reason`. The tRPC error formatter forwards a cause's
   * `data` to the client as `errorData`, so every router that already rethrows
   * with `cause: error` carries the reason without naming it.
   */
  readonly data?: { code: TaskRelationRejectionReason };
  readonly reason?: TaskRelationRejectionReason;

  constructor(
    message: string,
    code: 'BAD_REQUEST' | 'PRECONDITION_FAILED' = 'BAD_REQUEST',
    reason?: TaskRelationRejectionReason,
  ) {
    super(message);
    this.name = 'TaskDependencyError';
    this.code = code;
    if (reason) {
      this.reason = reason;
      this.data = { code: reason };
    }
  }
}

/** Preserve the domain distinction through a tRPC Error.cause wrapper. */
export const isTaskDependencyBlocked = (error: unknown): boolean =>
  (error instanceof TaskDependencyError && error.code === 'PRECONDITION_FAILED') ||
  (error instanceof Error &&
    error.cause instanceof TaskDependencyError &&
    error.cause.code === 'PRECONDITION_FAILED');
