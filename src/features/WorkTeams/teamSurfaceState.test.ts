import { describe, expect, it } from 'vitest';

import { teamSurfaceState } from './teamSurfaceState';

describe('teamSurfaceState', () => {
  it('does not treat a failed triage fetch as an empty inbox', () => {
    expect(teamSurfaceState({ error: new Error('offline'), isLoading: false, itemCount: 0 })).toBe(
      'error',
    );
    expect(teamSurfaceState({ error: new Error('offline'), isLoading: true, itemCount: 0 })).toBe(
      'error',
    );
  });

  it('keeps already-loaded rows instead of swapping them for an error or skeleton', () => {
    expect(teamSurfaceState({ error: new Error('offline'), isLoading: false, itemCount: 2 })).toBe(
      'ready',
    );
    expect(teamSurfaceState({ error: undefined, isLoading: true, itemCount: 2 })).toBe('ready');
  });

  it('shows a skeleton only before the first page arrives', () => {
    expect(teamSurfaceState({ error: undefined, isLoading: true, itemCount: 0 })).toBe('loading');
  });

  it('shows empty only after a successful zero-item load', () => {
    expect(teamSurfaceState({ error: undefined, isLoading: false, itemCount: 0 })).toBe('empty');
  });
});
