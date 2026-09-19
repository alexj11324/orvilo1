import { describe, expect, it } from 'vitest';

import {
  isWorkspaceTeamVisible,
  omitPersonalTeamItems,
  RECENT_SIDEBAR_TYPES,
  recentTypesForWorkspace,
} from './recentTypes';

describe('recentTypesForWorkspace', () => {
  it('includes teams when a workspace is active', () => {
    expect(recentTypesForWorkspace('ws-1')).toEqual([...RECENT_SIDEBAR_TYPES]);
  });

  it('omits teams in personal mode', () => {
    expect(recentTypesForWorkspace(null)).toEqual(['project', 'savedView', 'task']);
    expect(recentTypesForWorkspace(undefined)).toEqual(['project', 'savedView', 'task']);
  });
});

describe('omitPersonalTeamItems', () => {
  const recents = [
    { id: 'p1', type: 'project' },
    { id: 't1', type: 'team' },
    { id: 'task-1', type: 'task' },
  ];

  it('keeps team visits when a workspace is active', () => {
    expect(isWorkspaceTeamVisible('ws-1')).toBe(true);
    expect(omitPersonalTeamItems(recents, 'ws-1')).toEqual(recents);
  });

  it('drops team visits and favorite targets in personal mode', () => {
    expect(isWorkspaceTeamVisible(null)).toBe(false);
    expect(omitPersonalTeamItems(recents, null)).toEqual([
      { id: 'p1', type: 'project' },
      { id: 'task-1', type: 'task' },
    ]);
    expect(
      omitPersonalTeamItems(
        [
          { targetId: 'p1', targetType: 'project' },
          { targetId: 'team-1', targetType: 'team' },
        ],
        undefined,
      ),
    ).toEqual([{ targetId: 'p1', targetType: 'project' }]);
  });
});
