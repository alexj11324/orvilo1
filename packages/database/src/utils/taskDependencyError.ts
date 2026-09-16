/** Expected domain rejection, distinct from database or infrastructure failure. */
export class TaskDependencyError extends Error {
  constructor(
    public readonly kind: 'blocked' | 'invalid' | 'not-found',
    message: string,
  ) {
    super(message);
    this.name = 'TaskDependencyError';
  }
}
