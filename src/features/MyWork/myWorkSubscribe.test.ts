import { describe, expect, it } from 'vitest';

import { isTaskFollowed } from './myWorkSubscribe';

describe('isTaskFollowed', () => {
  it('treats the subscribed tab as already followed without a second lookup', () => {
    expect(isTaskFollowed('task_1', 'subscribed', [])).toBe(true);
  });

  it('keeps assigned work followable even when the id is not in the subscribed set', () => {
    expect(isTaskFollowed('task_1', 'assigned', [])).toBe(false);
    expect(isTaskFollowed('task_1', 'assigned', ['task_1'])).toBe(true);
    expect(isTaskFollowed('task_1', 'review', ['task_2'])).toBe(false);
  });
});
