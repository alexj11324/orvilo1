/** A dependency rejection is actionable, not an internal server failure. */
export class TaskDependencyError extends Error {
  readonly code: 'BAD_REQUEST' | 'PRECONDITION_FAILED';

  constructor(message: string, code: 'BAD_REQUEST' | 'PRECONDITION_FAILED' = 'BAD_REQUEST') {
    super(message);
    this.name = 'TaskDependencyError';
    this.code = code;
  }
}
