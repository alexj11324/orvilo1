import { describe, expect, it } from 'vitest';

import { resolveAgentViewMode } from './listViewOptions';

describe('resolveAgentViewMode', () => {
  it('keeps the persisted mode on desktop viewports', () => {
    expect(resolveAgentViewMode('list', false)).toBe('list');
    expect(resolveAgentViewMode('card', false)).toBe('card');
  });

  it('forces the card grid on mobile viewports regardless of preference', () => {
    // The list table's fixed columns overflow a ~390px viewport — mobile
    // always renders cards so rows stay inside the viewport.
    expect(resolveAgentViewMode('list', true)).toBe('card');
    expect(resolveAgentViewMode('card', true)).toBe('card');
  });

  it('falls back to the table on desktop when nothing was persisted', () => {
    expect(resolveAgentViewMode(undefined, false)).toBe('list');
    expect(resolveAgentViewMode(undefined, true)).toBe('card');
  });
});
