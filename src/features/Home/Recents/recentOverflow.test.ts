import { describe, expect, it } from 'vitest';

import {
  isRecentItemManageable,
  recentItemHasOverflowMenu,
  recentPinTargetType,
} from './recentOverflow';

describe('recent overflow', () => {
  it('does not leave project/savedView/team recents with an empty ⋯ menu', () => {
    expect(recentItemHasOverflowMenu('project')).toBe(true);
    expect(recentItemHasOverflowMenu('savedView')).toBe(true);
    expect(recentItemHasOverflowMenu('team')).toBe(true);
    expect(recentPinTargetType('project')).toBe('project');
    expect(recentPinTargetType('savedView')).toBe('savedView');
    expect(recentPinTargetType('team')).toBe('team');
    expect(isRecentItemManageable('project')).toBe(false);
  });

  it('keeps rename/delete on document, task, and topic recents', () => {
    expect(isRecentItemManageable('document')).toBe(true);
    expect(isRecentItemManageable('task')).toBe(true);
    expect(isRecentItemManageable('topic')).toBe(true);
    expect(recentPinTargetType('document')).toBeUndefined();
    expect(recentPinTargetType('topic')).toBeUndefined();
    expect(recentItemHasOverflowMenu('document')).toBe(true);
    expect(recentItemHasOverflowMenu('topic')).toBe(true);
  });
});
