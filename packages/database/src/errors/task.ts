/** Expected task failures, independent of HTTP or RPC transports. */
export class TaskDomainError extends Error {
  readonly code: 'BAD_REQUEST' | 'CONFLICT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PRECONDITION_FAILED';
  constructor(options: { cause?: unknown; code: TaskDomainError['code']; message: string }) {
    super(options.message, { cause: options.cause });
    this.name = 'TaskDomainError';
    this.code = options.code;
  }
}
