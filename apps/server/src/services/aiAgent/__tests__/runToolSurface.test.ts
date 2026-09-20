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

  describe('outcomes', () => {
    const outcomeFor = (surface: ReturnType<typeof resolveRunToolSurface>, id: string) =>
      surface.outcomes.find((o) => o.identifier === id);

    it('records a mounted outcome for every resolved tool and skill', () => {
      const surface = resolveRunToolSurface({
        additionalPluginIds: ['orvilo-task', 'task'],
      });

      expect(outcomeFor(surface, 'orvilo-task')).toEqual({
        identifier: 'orvilo-task',
        kind: 'tool',
        reason: '',
        status: 'mounted',
      });
      expect(outcomeFor(surface, 'task')).toEqual({
        identifier: 'task',
        kind: 'skill',
        reason: '',
        status: 'mounted',
      });
    });

    it('records unsupported with a reason for non-builtin plugins', () => {
      const surface = resolveRunToolSurface({
        additionalPluginIds: ['custom-plugin-xyz'],
      });

      // Non-builtin ids that resolved to no connector/plugin row are absent
      // from the external map — the reason names the resolution outcome, not
      // the executor capability.
      expect(outcomeFor(surface, 'custom-plugin-xyz')).toEqual({
        identifier: 'custom-plugin-xyz',
        kind: 'tool',
        reason: 'plugin-not-installed',
        status: 'unsupported',
      });
    });

    it('records unauthorized for a selected tool denied by the disabled set', () => {
      const surface = resolveRunToolSurface({
        agentPlugins: [{ identifier: 'orvilo-task', mode: 'disabled' }],
        selectedToolIds: ['orvilo-task'],
      });
      expect(outcomeFor(surface, 'orvilo-task')?.status).toBe('unauthorized');
      expect(outcomeFor(surface, 'orvilo-task')?.reason).toBe('disabled-by-agent-config');
    });

    it('records unsupported when the harness cannot mount MCP', () => {
      const surface = resolveRunToolSurface({
        additionalPluginIds: ['orvilo-task'],
        supportsBuiltinToolMount: false,
      });
      expect(outcomeFor(surface, 'orvilo-task')).toEqual({
        identifier: 'orvilo-task',
        kind: 'tool',
        reason: 'harness-cannot-mount-mcp',
        status: 'unsupported',
      });
    });

    it('emits no outcomes when tools are disabled wholesale', () => {
      const surface = resolveRunToolSurface({
        additionalPluginIds: ['orvilo-task'],
        disableTools: true,
      });
      expect(surface.outcomes).toEqual([]);
    });

    it('treats exclusive as a ceiling, not a must-have list (F05)', () => {
      // Old semantics folded exclusive ids into `required`, so an exclusive
      // surface resolving nothing threw. A ceiling cannot fail a run — the
      // ids are a cap on what MAY mount; `requiredToolIds` owns must-mount.
      const surface = resolveRunToolSurface({
        exclusivePluginIds: ['orvilo-task'],
        supportsBuiltinToolMount: false,
      });
      expect(surface.builtinToolSpecs).toHaveLength(0);
      expect(surface.outcomes.find((o) => o.identifier === 'orvilo-task')?.status).toBe(
        'unsupported',
      );
    });

    it('throws when an exclusive surface that IS required resolves nothing', () => {
      expect(() =>
        resolveRunToolSurface({
          exclusivePluginIds: ['orvilo-task'],
          requiredToolIds: ['orvilo-task'],
          supportsBuiltinToolMount: false,
        }),
      ).toThrow('Required tools failed to mount');
    });

    it('does not throw when the exclusive set mounts at least one tool', () => {
      const surface = resolveRunToolSurface({ exclusivePluginIds: ['orvilo-task'] });
      expect(surface.builtinToolSpecs).toHaveLength(1);
    });
  });

  describe('required tool admission (F05)', () => {
    it('throws when a required tool partially fails to mount', () => {
      // orvilo-task mounts; custom-plugin-xyz resolves to unsupported — a
      // partial failure must block dispatch, not run degraded.
      expect(() =>
        resolveRunToolSurface({
          additionalPluginIds: ['orvilo-task', 'custom-plugin-xyz'],
          requiredToolIds: ['orvilo-task', 'custom-plugin-xyz'],
        }),
      ).toThrow(/Required tools failed to mount:.*custom-plugin-xyz/);
    });

    it('accepts a required surface only when every id mounts', () => {
      const surface = resolveRunToolSurface({
        requiredToolIds: ['orvilo-task', 'task'],
      });
      expect(surface.builtinToolSpecs.map((s) => s.identifier)).toContain('orvilo-task');
      expect(surface.capabilityContext).toContain('<skill identifier="task">');
    });

    it('rejects disableTools combined with required ids before dispatch', () => {
      expect(() =>
        resolveRunToolSurface({
          disableTools: true,
          requiredToolIds: ['orvilo-task'],
        }),
      ).toThrow('Required tools cannot mount');
    });

    it('fails a required id that was disabled by agent config', () => {
      expect(() =>
        resolveRunToolSurface({
          agentPlugins: [{ identifier: 'orvilo-task', mode: 'disabled' }],
          requiredToolIds: ['orvilo-task'],
        }),
      ).toThrow(/orvilo-task \(unauthorized: disabled-by-agent-config\)/);
    });

    it('passes when required ids are all mounted alongside optional ones', () => {
      const surface = resolveRunToolSurface({
        additionalPluginIds: ['orvilo-task', 'custom-plugin-xyz'],
        requiredToolIds: ['orvilo-task'],
      });
      expect(surface.outcomes.find((o) => o.identifier === 'custom-plugin-xyz')?.status).toBe(
        'unsupported',
      );
    });

    it('rejects a required tool outside the exclusive ceiling (C04)', () => {
      // exclusive=[read] + required=[write] must NOT mount write — the old
      // union widened `requested` to fit required. Now it is a contract
      // conflict that throws before anything is dispatched.
      expect(() =>
        resolveRunToolSurface({
          exclusivePluginIds: ['orvilo-task'],
          requiredToolIds: ['orvilo-agent'],
        }),
      ).toThrow(/Required tools conflict with the exclusive surface: orvilo-agent/);
    });

    it('never widens the exclusive surface to fit required ids', () => {
      expect(() =>
        resolveRunToolSurface({
          additionalPluginIds: ['orvilo-task'],
          exclusivePluginIds: ['orvilo-task'],
          requiredToolIds: ['orvilo-agent'],
        }),
      ).toThrow('Required tools conflict with the exclusive surface');
    });

    it('blocks dispatch when a required tool mounts partially (C05)', () => {
      // supportsBuiltinToolMount=false stands in for a host that cannot
      // confirm the mount — specPrepared ≠ hostConfirmed, so the task must
      // never reach executable state.
      expect(() =>
        resolveRunToolSurface({
          additionalPluginIds: ['orvilo-task'],
          requiredToolIds: ['orvilo-task'],
          supportsBuiltinToolMount: false,
        }),
      ).toThrow(/orvilo-task \(unsupported: harness-cannot-mount-mcp\)/);
    });
  });

  describe('external tool surface (F04)', () => {
    const connectorEntry = {
      apis: [{ description: 'Do a thing', name: 'do_thing' }],
      callable: true,
      source: 'connector' as const,
    };

    it('mounts a resolved connector tool onto the per-run spec surface', () => {
      const surface = resolveRunToolSurface({
        externalTools: { 'my-conn': connectorEntry },
        selectedToolIds: ['my-conn'],
      });

      const spec = surface.builtinToolSpecs.find((s) => s.identifier === 'my-conn');
      expect(spec?.apis.map((a) => a.name)).toEqual(['do_thing']);
      expect(surface.externalTools?.['my-conn']).toEqual(connectorEntry);
      expect(surface.outcomes.find((o) => o.identifier === 'my-conn')?.status).toBe('mounted');
    });

    it('marks a callable:false external entry as no-server-executor', () => {
      const surface = resolveRunToolSurface({
        externalTools: { 'my-conn': { ...connectorEntry, callable: false } },
        selectedToolIds: ['my-conn'],
      });
      expect(surface.outcomes.find((o) => o.identifier === 'my-conn')).toEqual({
        identifier: 'my-conn',
        kind: 'tool',
        reason: 'no-server-executor',
        status: 'unsupported',
      });
      expect(surface.externalTools).toBeUndefined();
    });

    it('marks a non-resolvable id as plugin-not-installed', () => {
      const surface = resolveRunToolSurface({ selectedToolIds: ['unknown-tool'] });
      expect(surface.outcomes.find((o) => o.identifier === 'unknown-tool')).toEqual({
        identifier: 'unknown-tool',
        kind: 'tool',
        reason: 'plugin-not-installed',
        status: 'unsupported',
      });
    });

    it('does not mount external tools on a harness that cannot mount MCP', () => {
      const surface = resolveRunToolSurface({
        externalTools: { 'my-conn': connectorEntry },
        selectedToolIds: ['my-conn'],
        supportsBuiltinToolMount: false,
      });
      expect(surface.outcomes.find((o) => o.identifier === 'my-conn')?.reason).toBe(
        'harness-cannot-mount-mcp',
      );
      expect(surface.builtinToolSpecs).toHaveLength(0);
    });

    it('blocks the run when a required external tool fails to mount', () => {
      expect(() =>
        resolveRunToolSurface({
          externalTools: { 'my-conn': connectorEntry },
          requiredToolIds: ['my-conn', 'missing-conn'],
        }),
      ).toThrow(/missing-conn \(unsupported: plugin-not-installed\)/);
    });
  });
});
