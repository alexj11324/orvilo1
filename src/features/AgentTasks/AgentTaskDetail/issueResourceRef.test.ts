import { describe, expect, it } from 'vitest';

import { issueResourceRef } from './issueResourceRef';

describe('issueResourceRef', () => {
  it('addresses the Issue by its public identifier, which TaskModel.resolve always accepts', () => {
    expect(issueResourceRef({ id: 'taskparitymine0002', identifier: 'PMI-2' })).toBe('PMI-2');
    expect(issueResourceRef({ id: 'task_abc123', identifier: 'PARITY-8' })).toBe('PARITY-8');
  });

  it('falls back to the database id when no identifier is loaded', () => {
    expect(issueResourceRef({ id: 'task_abc123', identifier: '' })).toBe('task_abc123');
  });

  it('is undefined until the detail has loaded, so no request is sent early', () => {
    expect(issueResourceRef(undefined)).toBeUndefined();
    expect(issueResourceRef(null)).toBeUndefined();
    expect(issueResourceRef({ id: undefined, identifier: '' })).toBeUndefined();
  });
});
