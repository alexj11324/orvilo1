import { describe, expect, it } from 'vitest';

import { isTaskDetailResolving } from './taskDetailReadiness';

describe('isTaskDetailResolving', () => {
  it('is resolving until the task detail exists', () => {
    expect(isTaskDetailResolving({ hasTaskDetail: false, settledWithoutDetail: false })).toBe(true);
  });

  it('is ready as soon as the task detail exists, regardless of any assignee config', () => {
    expect(isTaskDetailResolving({ hasTaskDetail: true, settledWithoutDetail: false })).toBe(false);
  });

  it('stops resolving once the fetch settled without a detail (not-found / error surfaces)', () => {
    expect(isTaskDetailResolving({ hasTaskDetail: false, settledWithoutDetail: true })).toBe(false);
  });
});
