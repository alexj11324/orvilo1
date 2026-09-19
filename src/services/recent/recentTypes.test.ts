import { describe, expect, it } from 'vitest';

import { RECENT_SIDEBAR_TYPES, recentTypesForWorkspace } from './recentTypes';

describe('recentTypesForWorkspace', () => {
  it('includes teams when a workspace is active', () => {
    expect(recentTypesForWorkspace('ws-1')).toEqual([...RECENT_SIDEBAR_TYPES]);
  });

  it('omits teams in personal mode', () => {
    expect(recentTypesForWorkspace(null)).toEqual(['project', 'savedView', 'task']);
    expect(recentTypesForWorkspace(undefined)).toEqual(['project', 'savedView', 'task']);
  });
});
