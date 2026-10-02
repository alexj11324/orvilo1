import { describe, expect, it } from 'vitest';

import { isDueDateOverdue } from './isDueDateOverdue';

describe('isDueDateOverdue', () => {
  const now = new Date(2026, 9, 1, 15, 0, 0);

  it('is overdue only after the due calendar day', () => {
    expect(isDueDateOverdue('2026-09-30', now)).toBe(true);
    expect(isDueDateOverdue('2026-10-01', now)).toBe(false);
    expect(isDueDateOverdue('2026-10-02', now)).toBe(false);
  });

  it('ignores values that are not calendar dates', () => {
    expect(isDueDateOverdue('tomorrow', now)).toBe(false);
  });
});
