// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { canMountBuiltinToolSurface, canRunGroupSupervisorRuntime } from './builtinToolMount';

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

  it('keeps native Prime outside the ACP mount family', () => {
    // Prime's native per-run MCP bridge does not use ACP session/new.
    const preCutoverRow = { engine: 'claude-sdk', type: 'orvilo' };
    expect(canMountBuiltinToolSurface(preCutoverRow)).toBe(false);
    expect(canMountBuiltinToolSurface({ type: 'orvilo' })).toBe(false);
  });

  it('rejects a binding with no type to resolve', () => {
    expect(canMountBuiltinToolSurface(undefined)).toBe(false);
    expect(canMountBuiltinToolSurface({})).toBe(false);
  });
});

describe('canRunGroupSupervisorRuntime', () => {
  it('accepts Prime native MCP and the mounted ACP runtimes', () => {
    expect(canRunGroupSupervisorRuntime({ type: 'orvilo' })).toBe(true);
    expect(canRunGroupSupervisorRuntime({ type: 'opencode' })).toBe(true);
    expect(canRunGroupSupervisorRuntime({ type: 'codex' })).toBe(true);
    expect(canRunGroupSupervisorRuntime({ type: 'pi' })).toBe(false);
    expect(canRunGroupSupervisorRuntime({ type: 'cursor' })).toBe(false);
    expect(canRunGroupSupervisorRuntime(undefined)).toBe(false);
  });
});
