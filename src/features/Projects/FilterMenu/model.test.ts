import { describe, expect, it } from 'vitest';

import type { FilterMenuGroup } from './model';
import { buildMenuEntries, filterOptions, toggleListValue, toMemberOptions } from './model';

const group = (id: string, label: string, supported = true): FilterMenuGroup => ({
  getPicker: () => ({ kind: 'options', options: [] }),
  icon: (() => null) as unknown as FilterMenuGroup['icon'],
  id,
  label,
  supported,
});

const topEntries = [
  { icon: (() => null) as never, key: 'ai' as const, label: 'AI filter' },
  { icon: (() => null) as never, key: 'advanced' as const, label: 'Advanced filter' },
];

describe('buildMenuEntries', () => {
  const groups = [group('status', 'Status'), group('lead', 'Lead', false)];

  it('lists AI / Advanced first, then every group when the keyword is empty', () => {
    const keys = buildMenuEntries({ groups, keyword: '  ', topEntries }).map((e) => e.key);
    expect(keys).toEqual(['ai', 'advanced', 'status', 'lead']);
  });

  it('matches case-insensitively across top entries and groups', () => {
    const keys = buildMenuEntries({ groups, keyword: 'ADV', topEntries }).map((e) => e.key);
    expect(keys).toEqual(['advanced']);
    expect(buildMenuEntries({ groups, keyword: 'LEA', topEntries }).map((e) => e.key)).toEqual([
      'lead',
    ]);
  });

  it('keeps unsupported groups so the host can render them disabled', () => {
    const entries = buildMenuEntries({ groups, keyword: 'lead', topEntries });
    expect(entries).toHaveLength(1);
    expect('group' in entries[0] && entries[0].group.supported).toBe(false);
  });

  it('returns nothing when no entry matches', () => {
    expect(buildMenuEntries({ groups, keyword: 'zzz', topEntries })).toEqual([]);
  });
});

describe('filterOptions', () => {
  const options = [{ label: 'No assignee', pinned: true }, { label: 'Alice' }, { label: 'Bob' }];

  it('keeps pinned rows regardless of the keyword', () => {
    expect(filterOptions(options, 'ali').map((o) => o.label)).toEqual(['No assignee', 'Alice']);
  });

  it('returns everything for a blank keyword', () => {
    expect(filterOptions(options, ' ')).toHaveLength(3);
  });
});

describe('toggleListValue', () => {
  it('adds a missing value and removes a present one, including null', () => {
    expect(toggleListValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleListValue(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleListValue<string | null>([], null)).toEqual([null]);
    expect(toggleListValue<string | null>([null, 'a'], null)).toEqual(['a']);
  });

  it('does not mutate the input', () => {
    const current = ['a'];
    toggleListValue(current, 'b');
    expect(current).toEqual(['a']);
  });
});

describe('toMemberOptions', () => {
  it('drops deleted / suspended members, falls back to username then id, and sorts by name', () => {
    const result = toMemberOptions([
      { userId: 'u3', user: { fullName: 'Zed' } },
      { userId: 'u1', user: { fullName: '', username: 'amy', avatar: 'a.png' } },
      { userId: 'u2', deletedAt: '2026-01-01', user: { fullName: 'Gone' } },
      { userId: 'u4', suspendedAt: new Date(), user: { fullName: 'Paused' } },
      { userId: 'u0' },
    ]);
    expect(result).toEqual([
      { avatar: 'a.png', name: 'amy', userId: 'u1' },
      { avatar: undefined, name: 'u0', userId: 'u0' },
      { avatar: undefined, name: 'Zed', userId: 'u3' },
    ]);
  });

  it('handles an undefined roster', () => {
    expect(toMemberOptions(undefined)).toEqual([]);
  });
});
