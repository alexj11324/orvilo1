import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LIST_WORKSPACE_MEMBERS_LIMIT,
  matchesMemberQuery,
  normalizeListWorkspaceMembersParams,
  normalizeMemberQuery,
  selectAssignableMembers,
} from './listWorkspaceMembers';

const alice = {
  email: 'alice@orvilo.aspectlylabs.com',
  id: 'usr_2',
  name: 'Alice Chen',
  username: 'alice',
};
const bob = { id: 'usr_4', name: 'Bob Li', username: 'bob' };

describe('normalizeListWorkspaceMembersParams', () => {
  it('defaults the cap, clamps it into range and folds the query', () => {
    expect(normalizeListWorkspaceMembersParams()).toEqual({
      limit: DEFAULT_LIST_WORKSPACE_MEMBERS_LIMIT,
      query: undefined,
    });
    expect(normalizeListWorkspaceMembersParams({ limit: 0, query: '  Neko ' })).toEqual({
      limit: 1,
      query: 'neko',
    });
    expect(normalizeListWorkspaceMembersParams({ limit: 10_000, query: '' }).limit).toBe(100);
  });
});

describe('normalizeMemberQuery', () => {
  it('unwraps native Slack / Discord mentions and a leading @ into the bare needle', () => {
    expect(normalizeMemberQuery('  @Neko ')).toBe('neko');
    expect(normalizeMemberQuery('alice@orvilo.aspectlylabs.com')).toBe(
      'alice@orvilo.aspectlylabs.com',
    );
    // Nothing usable left: blank, or a bare "@".
    expect(normalizeMemberQuery('')).toBeUndefined();
    expect(normalizeMemberQuery('@')).toBeUndefined();
  });
});

describe('matchesMemberQuery', () => {
  it('matches an exact id, or a case-insensitive part of name, handle or email', () => {
    expect(matchesMemberQuery(alice, 'usr_2')).toBe(true);
    expect(matchesMemberQuery(alice, 'chen')).toBe(true);
    expect(matchesMemberQuery(alice, 'alice')).toBe(true);
    expect(matchesMemberQuery(alice, 'alice@orvilo.aspectlylabs.com')).toBe(true);
    expect(matchesMemberQuery(bob, 'alice')).toBe(false);
    expect(matchesMemberQuery(alice, '')).toBe(false);
  });
});

describe('selectAssignableMembers', () => {
  it('narrows by query and reports the pre-cap total', () => {
    expect(selectAssignableMembers([alice, bob], { query: 'chen' })).toEqual({
      members: [alice],
      query: 'chen',
      total: 1,
    });
    expect(selectAssignableMembers([alice, bob], { limit: 1 })).toEqual({
      members: [alice],
      query: undefined,
      total: 2,
    });
    expect(selectAssignableMembers([alice, bob])).toEqual({
      members: [alice, bob],
      query: undefined,
      total: 2,
    });
  });
});
