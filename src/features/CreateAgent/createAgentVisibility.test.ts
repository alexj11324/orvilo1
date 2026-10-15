import { describe, expect, it } from 'vitest';

import { resolveCreateAgentVisibility } from './createAgentVisibility';

describe('resolveCreateAgentVisibility', () => {
  it('creates a public agent in a workspace even when the caller asked for private', () => {
    expect(
      resolveCreateAgentVisibility({
        requested: 'private',
        workspaceId: 'ws_1',
      }),
    ).toBe('public');
  });

  it('keeps a personal-space request private', () => {
    expect(resolveCreateAgentVisibility({ requested: 'private' })).toBe('private');
    expect(resolveCreateAgentVisibility({})).toBe('private');
  });

  it('keeps an explicit personal-space public request', () => {
    expect(resolveCreateAgentVisibility({ requested: 'public' })).toBe('public');
  });

  it('stays private when the caller locks visibility', () => {
    expect(
      resolveCreateAgentVisibility({
        lockVisibility: true,
        workspaceId: 'ws_1',
      }),
    ).toBe('private');
  });
});
