import { describe, expect, it } from 'vitest';

import { createVercelBranchEnvPayload } from './createVercelBranchEnvPayload';

describe('createVercelBranchEnvPayload', () => {
  it('creates a new sensitive branch variable with its key', () => {
    expect(createVercelBranchEnvPayload('postgres://app', 'feat/preview', 'POST')).toEqual({
      gitBranch: 'feat/preview',
      key: 'DATABASE_URL',
      target: ['preview'],
      type: 'sensitive',
      value: 'postgres://app',
    });
  });

  it('updates a sensitive branch variable without trying to edit its key or type', () => {
    expect(createVercelBranchEnvPayload('postgres://app', 'feat/preview', 'PATCH')).toEqual({
      gitBranch: 'feat/preview',
      target: ['preview'],
      value: 'postgres://app',
    });
  });
});
