import { describe, expect, it } from 'vitest';

import { groupUserMenuItems } from './userMenuGroups';

const item = (key: string) => ({ key, label: key });
const keys = (items: unknown[]) => items.map((entry) => (entry as { key: string }).key);

describe('groupUserMenuItems', () => {
  it('routes known keys to their group and keeps source order', () => {
    const groups = groupUserMenuItems([
      { type: 'divider' },
      item('setting'),
      item('import'),
      { type: 'divider' },
      item('cloud'),
      item('get-app'),
    ]);

    expect(keys(groups.workspace)).toEqual(['setting']);
    expect(keys(groups.personal)).toEqual(['import']);
    expect(keys(groups.help)).toEqual(['cloud', 'get-app']);
  });

  it('puts unknown business items in the personal group and drops dividers and empties', () => {
    const groups = groupUserMenuItems([null, undefined, { type: 'divider' }, item('billing')]);

    expect(keys(groups.personal)).toEqual(['billing']);
    expect(groups.workspace).toEqual([]);
    expect(groups.help).toEqual([]);
  });

  it('returns empty groups for no items', () => {
    expect(groupUserMenuItems()).toEqual({ help: [], personal: [], workspace: [] });
  });
});
