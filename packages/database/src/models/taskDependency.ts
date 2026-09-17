/** A dependency rejection is actionable, not an internal server failure. */
export class TaskDependencyError extends Error {
  readonly code: 'BAD_REQUEST' | 'PRECONDITION_FAILED';

  constructor(message: string, code: 'BAD_REQUEST' | 'PRECONDITION_FAILED' = 'BAD_REQUEST') {
    super(message);
    this.name = 'TaskDependencyError';
    this.code = code;
  }
}

/** Preserve the domain distinction through a tRPC Error.cause wrapper. */
export const isTaskDependencyBlocked = (error: unknown): boolean =>
  (error instanceof TaskDependencyError && error.code === 'PRECONDITION_FAILED') ||
  (error instanceof Error &&
    error.cause instanceof TaskDependencyError &&
    error.cause.code === 'PRECONDITION_FAILED');
