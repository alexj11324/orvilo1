import { describe, expect, it } from 'vitest';

import { teamTaskDetailPath } from './teamTaskDetailPath';

describe('teamTaskDetailPath', () => {
  it('opens a seeded issue by its identifier when its storage id has another shape', () => {
    expect(
      teamTaskDetailPath({
        assigneeAgentId: null,
        id: 'taskparitymine0004',
        identifier: 'PMI-4',
        name: 'Blocking: verify downstream acceptance',
      }),
    ).toBe('/task/PMI-4/blocking-verify-downstream-acceptance');
  });

  it('keeps the raw id route available for rows without an identifier', () => {
    expect(teamTaskDetailPath({ id: 'task_valid', identifier: null })).toBe('/task/task_valid');
  });
});
