import { describe, expect, it } from 'vitest';

import { workspaceMemberTabKeys } from './workspaceMemberTabs';

describe('workspaceMemberTabKeys', () => {
  it('offers the invitations tab to callers who can invite', () => {
    expect(workspaceMemberTabKeys(true)).toEqual(['members', 'invitations', 'agents']);
  });

  it('withholds the invitations tab from members/viewers', () => {
    // Mounting the invitations panel fires an owner/admin-only endpoint —
    // the tab must not exist for roles the server would reject.
    expect(workspaceMemberTabKeys(false)).toEqual(['members', 'agents']);
    expect(workspaceMemberTabKeys(false)).not.toContain('invitations');
  });
});
