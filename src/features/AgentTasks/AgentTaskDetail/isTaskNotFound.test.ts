import { describe, expect, it } from 'vitest';

import { isTaskNotFound } from './isTaskNotFound';

describe('isTaskNotFound', () => {
  it('recognises the store-tagged not-found', () => {
    const tagged = Object.assign(new Error('Task not found: T-1'), { code: 'TASK_NOT_FOUND' });
    expect(isTaskNotFound(tagged)).toBe(true);
  });

  it('recognises the tRPC NOT_FOUND that task.detail throws for a deleted Issue', () => {
    const trpcError = Object.assign(new Error('Task not found'), {
      data: { code: 'NOT_FOUND', httpStatus: 404 },
    });
    expect(isTaskNotFound(trpcError)).toBe(true);
  });

  it('keeps transient and permission failures out', () => {
    expect(isTaskNotFound(undefined)).toBe(false);
    const serverError = Object.assign(new Error('boom'), { data: { httpStatus: 500 } });
    expect(isTaskNotFound(serverError)).toBe(false);
    const forbidden = Object.assign(new Error('no'), {
      data: { code: 'FORBIDDEN', httpStatus: 403 },
    });
    expect(isTaskNotFound(forbidden)).toBe(false);
  });
});
