import { describe, expect, it } from 'vitest';

import { COMMAND_MENU_GROUP_ORDER, groupSearchResults } from './groupResults';

const make = (type: string, id: string) => ({ id, type });

describe('groupSearchResults', () => {
  it('returns no groups for empty or unlisted-only input', () => {
    expect(groupSearchResults([])).toEqual([]);
    expect(groupSearchResults([make('mcp', 'a'), make('plugin', 'b')])).toEqual([]);
  });

  it('drops types that have no renderable group', () => {
    const groups = groupSearchResults([
      make('communityAgent', 'c1'),
      make('task', 't1'),
      make('somethingNew', 'x1'),
    ]);

    expect(groups).toEqual([{ items: [make('task', 't1')], type: 'task' }]);
  });

  it('orders groups by COMMAND_MENU_GROUP_ORDER regardless of input order', () => {
    const groups = groupSearchResults([
      make('file', 'f1'),
      make('project', 'p1'),
      make('task', 't1'),
      make('savedView', 'v1'),
    ]);

    expect(groups.map((g) => g.type)).toEqual(['task', 'project', 'savedView', 'file']);
  });

  it('keeps server order within each group', () => {
    const groups = groupSearchResults([make('task', 't2'), make('task', 't1'), make('task', 't3')]);

    expect(groups[0].items.map((i) => i.id)).toEqual(['t2', 't1', 't3']);
  });

  it('covers every type the renderer can produce', () => {
    // A group missing from the order list would silently swallow results.
    for (const type of COMMAND_MENU_GROUP_ORDER) {
      const groups = groupSearchResults([make(type, 'x')]);
      expect(groups).toEqual([{ items: [make(type, 'x')], type }]);
    }
  });
});
