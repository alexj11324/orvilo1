import { describe, expect, it } from 'vitest';

import { TEAM_TRIAGE_OVERFLOW_I18N, teamTriageOverflowItems } from './teamTriageOverflow';

describe('teamTriageOverflowItems', () => {
  it('hides overflow when duplicate, transfer, and reassign have no targets', () => {
    expect(teamTriageOverflowItems({ canonicals: [], destinations: [], members: [] })).toEqual([]);
  });

  it('collapses a single target to a leaf so triage does not open an empty submenu', () => {
    expect(
      teamTriageOverflowItems({
        canonicals: [{ label: 'Original', value: 'task_a' }],
        destinations: [],
        members: [],
      }),
    ).toEqual([{ kind: 'duplicate', label: 'Original', type: 'leaf', value: 'task_a' }]);
  });

  it('keeps a submenu when the operator still has to pick among targets', () => {
    expect(
      teamTriageOverflowItems({
        canonicals: [],
        destinations: [
          { label: 'Design', value: 'team_d' },
          { label: 'Ops', value: 'team_o' },
        ],
        members: [{ label: 'user_b', value: 'user_b' }],
      }),
    ).toEqual([
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
