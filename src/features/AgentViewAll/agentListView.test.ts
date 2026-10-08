import { describe, expect, it } from 'vitest';

import { resolveAgentListView } from './agentListView';

describe('resolveAgentListView', () => {
  it('shows loading until the first load has finished', () => {
    expect(resolveAgentListView({ isInit: false, itemCount: 0 })).toBe('loading');
  });

  it('shows an error instead of an endless skeleton when the first load failed', () => {
    expect(resolveAgentListView({ error: new Error('boom'), isInit: false, itemCount: 0 })).toBe(
      'error',
    );
  });

  it('keeps showing the list when a background refresh fails after a good load', () => {
    expect(resolveAgentListView({ error: new Error('boom'), isInit: true, itemCount: 3 })).toBe(
      'list',
    );
  });

  it('tells empty from populated once loaded', () => {
    expect(resolveAgentListView({ isInit: true, itemCount: 0 })).toBe('empty');
    expect(resolveAgentListView({ isInit: true, itemCount: 1 })).toBe('list');
  });
});
