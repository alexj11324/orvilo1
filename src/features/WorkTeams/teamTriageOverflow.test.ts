import { describe, expect, it } from 'vitest';

import { TEAM_TRIAGE_OVERFLOW_I18N, teamTriageOverflowItems } from './teamTriageOverflow';

describe('teamTriageOverflowItems', () => {
  it('always offers duplicate — the canonical target is resolved by search, not the loaded list', () => {
    expect(teamTriageOverflowItems({ destinations: [], members: [] })).toEqual([
      { kind: 'duplicate', label: 'search', type: 'leaf', value: 'search' },
    ]);
  });

  it('keeps a submenu when the operator still has to pick among targets', () => {
    expect(
      teamTriageOverflowItems({
        destinations: [
          { label: 'Design', value: 'team_d' },
          { label: 'Ops', value: 'team_o' },
        ],
        members: [{ label: 'user_b', value: 'user_b' }],
      }),
    ).toEqual([
      { kind: 'duplicate', label: 'search', type: 'leaf', value: 'search' },
      {
        kind: 'transfer',
        options: [
          { label: 'Design', value: 'team_d' },
          { label: 'Ops', value: 'team_o' },
        ],
        type: 'submenu',
      },
      { kind: 'reassign', label: 'user_b', type: 'leaf', value: 'user_b' },
    ]);
  });

  it('points overflow labels at the existing triage verbs', () => {
    expect(TEAM_TRIAGE_OVERFLOW_I18N).toEqual({
      duplicate: 'teams.markDuplicate',
      reassign: 'teams.reassign',
      transfer: 'teams.transfer',
    });
  });
});
