import { describe, expect, it } from 'vitest';

import { shouldShowHeterogeneousCloudConfig, shouldShowPersonaEditor } from './orviloProfilePolicy';

describe('Orvilo profile policy', () => {
  it('exposes cloud credentials when the builtin harness uses the Claude engine', () => {
    expect(shouldShowHeterogeneousCloudConfig({ type: 'orvilo', engine: 'claude-sdk' })).toBe(true);
    expect(shouldShowHeterogeneousCloudConfig({ type: 'orvilo', engine: 'codex-app-server' })).toBe(false);
    expect(shouldShowHeterogeneousCloudConfig({ type: 'claude-code' })).toBe(true);
  });

  it('keeps the persona editor for builtin Orvilo but not external heterogeneous agents', () => {
    expect(shouldShowPersonaEditor(true, true)).toBe(true);
    expect(shouldShowPersonaEditor(true, false)).toBe(false);
    expect(shouldShowPersonaEditor(false, false)).toBe(true);
  });
});
