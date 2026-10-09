import { describe, expect, it } from 'vitest';

import { issueResourceRef } from './issueResourceRef';

describe('issueResourceRef', () => {
  it('addresses the Issue by its database id when the server can resolve it', () => {
    // Identifiers can be shared by two rows; the id cannot.
    expect(issueResourceRef({ id: 'task_abc123', identifier: 'PARITY-8' })).toBe('task_abc123');
  });

  it('addresses legacy rows by exact id even when their identifier is shared', () => {
    expect(issueResourceRef({ id: 'taskparitymine0002', identifier: 'PMI-2' })).toBe(
      'taskparitymine0002',
    );
  });

  it('uses the database id when no identifier is loaded', () => {
    expect(issueResourceRef({ id: 'task_abc123', identifier: '' })).toBe('task_abc123');
    expect(issueResourceRef({ id: 'taskparitymine0002', identifier: '' })).toBe(
      'taskparitymine0002',
    );
  });

  it('is undefined until the detail has loaded, so no request is sent early', () => {
    expect(issueResourceRef(undefined)).toBeUndefined();
    expect(issueResourceRef(null)).toBeUndefined();
    expect(issueResourceRef({ id: undefined, identifier: '' })).toBeUndefined();
  });
});
