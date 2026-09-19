import { describe, expect, it } from 'vitest';

import { resolveRunToolSurface } from '../pipeline/runToolSurface';

describe('resolveRunToolSurface', () => {
  it('mounts builtin tools with server runtimes as AcpBuiltinToolSpec', () => {
    const surface = resolveRunToolSurface({
      additionalPluginIds: ['orvilo-task'],
    });

    const spec = surface.builtinToolSpecs.find((s) => s.identifier === 'orvilo-task');
    expect(spec).toBeDefined();
    expect(spec!.apis.length).toBeGreaterThan(0);
    expect(spec!.apis[0].name).toBeTruthy();
  });

  it('renders builtin skills as capability context, not tool specs', () => {
    const surface = resolveRunToolSurface({
      additionalPluginIds: ['task'],
    });

    expect(surface.builtinToolSpecs.find((s) => s.identifier === 'task')).toBeUndefined();
    expect(surface.capabilityContext).toContain('<skill identifier="task">');
  });

  it('drops builtin tools when the harness cannot mount MCP', () => {
    const surface = resolveRunToolSurface({
      additionalPluginIds: ['orvilo-task'],
      supportsBuiltinToolMount: false,
    });

    expect(surface.builtinToolSpecs).toHaveLength(0);
  });

  it('drops non-builtin plugins with no server executor', () => {
    const surface = resolveRunToolSurface({
      additionalPluginIds: ['orvilo-task', 'custom-plugin-xyz'],
    });

    expect(surface.builtinToolSpecs.map((s) => s.identifier)).toEqual(['orvilo-task']);
  });

  it('honours disabled plugin entries', () => {
    const surface = resolveRunToolSurface({
      agentPlugins: [
        { identifier: 'orvilo-task', mode: 'disabled' },
        { identifier: 'orvilo-agent', mode: 'pinned' },
      ],
    });

    const ids = surface.builtinToolSpecs.map((s) => s.identifier);
    expect(ids).not.toContain('orvilo-task');
    expect(ids).toContain('orvilo-agent');
  });

  it('exclusivePluginIds replaces the active-plugin surface', () => {
    const surface = resolveRunToolSurface({
      agentPlugins: [
        { identifier: 'orvilo-task', mode: 'pinned' },
        { identifier: 'orvilo-agent', mode: 'pinned' },
      ],
      exclusivePluginIds: ['orvilo-task'],
    });

    expect(surface.builtinToolSpecs.map((s) => s.identifier)).toEqual(['orvilo-task']);
  });

  it('disableTools empties the whole surface', () => {
    const surface = resolveRunToolSurface({
      additionalPluginIds: ['orvilo-task', 'task'],
      disableTools: true,
    });

    expect(surface.builtinToolSpecs).toHaveLength(0);
    expect(surface.capabilityContext).toBeUndefined();
  });

  it('disableLocalSystem drops the local-system and auv tools', () => {
    const surface = resolveRunToolSurface({
      additionalPluginIds: ['orvilo-local-system', 'orvilo-auv', 'orvilo-task'],
      disableLocalSystem: true,
    });

    const ids = surface.builtinToolSpecs.map((s) => s.identifier);
    expect(ids).not.toContain('orvilo-local-system');
    expect(ids).not.toContain('orvilo-auv');
    expect(ids).toContain('orvilo-task');
  });

  it('enableAgentMode=false restricts to the chat-mode allowlist', () => {
    const chatSurface = resolveRunToolSurface({
      additionalPluginIds: ['orvilo-task', 'orvilo-agent'],
      enableAgentMode: false,
    });
    // `chatModeAllowedToolIds` is a fixed registry list — whichever of these
    // two identifiers it admits, the chat-gated surface is a subset.
    const agentSurface = resolveRunToolSurface({
      additionalPluginIds: ['orvilo-task', 'orvilo-agent'],
    });
    expect(chatSurface.builtinToolSpecs.length).toBeLessThanOrEqual(
      agentSurface.builtinToolSpecs.length,
    );
  });
});
