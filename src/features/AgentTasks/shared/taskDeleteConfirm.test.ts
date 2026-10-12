import { describe, expect, it } from 'vitest';

import { taskDeleteConfirmCopy } from './taskDeleteConfirm';

describe('taskDeleteConfirmCopy', () => {
  it('states how many sub-issues become top-level when the issue has some', () => {
    expect(taskDeleteConfirmCopy(3)).toEqual({
      count: 3,
      key: 'taskDetail.deleteConfirm.contentWithSubIssues',
    });
    expect(taskDeleteConfirmCopy(1)).toMatchObject({ count: 1 });
  });

  it('keeps the plain warning for an issue with no sub-issues', () => {
    expect(taskDeleteConfirmCopy(0)).toEqual({ key: 'taskDetail.deleteConfirm.content' });
  });

  it('never reads an unknown count as "no sub-issues"', () => {
    expect(taskDeleteConfirmCopy(undefined)).toEqual({
      key: 'taskDetail.deleteConfirm.contentUnknownSubIssues',
    });
  });
});
