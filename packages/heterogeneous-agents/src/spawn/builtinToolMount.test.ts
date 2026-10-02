// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { canMountBuiltinToolSurface } from './builtinToolMount';

describe('canMountBuiltinToolSurface', () => {
  it('accepts the runtimes that deliver session/new mcpServers to the agent', () => {
    for (const type of [
      'amp',
      'claude-code',
      'codebuddy',
      'codex',
      'kimi-code',
      'opencode',
      'qoder',
    ]) {
      expect(canMountBuiltinToolSurface({ type }), `type=${type}`).toBe(true);
    }
  });

  it('rejects pi — pi-acp@0.0.33 stores mcpServers and silently drops them', () => {
    expect(canMountBuiltinToolSurface({ type: 'pi' })).toBe(false);
  });

  it('rejects runtimes without ACP transport at all', () => {
    for (const type of ['cursor', 'devin', 'droid', 'grok', 'trae']) {
      expect(canMountBuiltinToolSurface({ type }), `type=${type}`).toBe(false);
    }
  });

  it('resolves the builtin orvilo family through its engine', () => {
    expect(canMountBuiltinToolSurface({ engine: 'claude-sdk', type: 'orvilo' })).toBe(true);
    expect(canMountBuiltinToolSurface({ type: 'orvilo' })).toBe(true);
  });

  it('rejects a binding with no type to resolve', () => {
    expect(canMountBuiltinToolSurface(undefined)).toBe(false);
    expect(canMountBuiltinToolSurface({})).toBe(false);
  });
});
