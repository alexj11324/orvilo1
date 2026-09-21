import { describe, expect, it } from 'vitest';

import { savedViewVisibilityKey } from './savedViewVisibility';

describe('savedViewVisibilityKey', () => {
  it('maps each stored visibility to its label', () => {
    expect(savedViewVisibilityKey('private')).toBe('savedViews.visibilityPrivate');
    expect(savedViewVisibilityKey('team')).toBe('savedViews.visibilityTeam');
    expect(savedViewVisibilityKey('workspace')).toBe('savedViews.visibilityWorkspace');
  });

  it('never reports an unknown or missing value as a public scope', () => {
    for (const value of [undefined, null, '', 'public', 'PRIVATE']) {
      expect(savedViewVisibilityKey(value)).toBe('savedViews.visibilityUnknown');
    }
  });

  it('does not mistake inherited prototype keys for stored scopes', () => {
    for (const value of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(savedViewVisibilityKey(value)).toBe('savedViews.visibilityUnknown');
    }
  });
});
