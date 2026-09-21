import { describe, expect, it } from 'vitest';

import { reassignMemberOptions } from './reassignMemberOptions';

describe('reassignMemberOptions', () => {
  it('omits the current assignee so triage cannot no-op reassign', () => {
    expect(reassignMemberOptions([{ userId: 'user_a' }, { userId: 'user_b' }], 'user_a')).toEqual([
      { label: 'user_b', value: 'user_b' },
    ]);
  });

  it('keeps every member when the task has no assignee', () => {
    expect(reassignMemberOptions([{ userId: 'user_a' }], null)).toEqual([
      { label: 'user_a', value: 'user_a' },
    ]);
  });
});
