// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { agentCanMountBuiltinToolSurface } from '../pipeline/resolveExecutionBinding';

describe('agentCanMountBuiltinToolSurface', () => {
  it('treats the builtin orvilo binding as mount-incapable — Prime mounts no tools', () => {
    // The synthesized/default binding is 'orvilo', which runs on the embedded
    // Prime harness (`noTools: 'all'`) — the builtin tool surface cannot mount.
    expect(agentCanMountBuiltinToolSurface({ agencyConfig: null })).toBe(false);
    expect(agentCanMountBuiltinToolSurface(undefined)).toBe(false);
  });

  it('rejects heterogeneous agents whose engine cannot mount MCP', () => {
    for (const type of ['cursor', 'devin', 'droid', 'grok-build', 'pi', 'trae'] as const) {
      expect(
        agentCanMountBuiltinToolSurface({ agencyConfig: { heterogeneousProvider: { type } } }),
        `type=${type}`,
      ).toBe(false);
    }
  });

  it('lets a heterogeneous model id retype the binding — the supervisor-model path', () => {
    // Only legacy hetero model ids retype the binding; 'pi' is one and its
    // bridge cannot mount MCP, while 'devin' is not a model id at all.
    expect(agentCanMountBuiltinToolSurface({ agencyConfig: null }, 'pi')).toBe(false);
    expect(agentCanMountBuiltinToolSurface({ agencyConfig: null }, 'cursor')).toBe(false);
    expect(agentCanMountBuiltinToolSurface({ agencyConfig: null }, 'claude-code')).toBe(true);
    // 'devin' is not a legacy hetero model id, so the binding stays on the
    // synthesized builtin 'orvilo' runtime — which cannot mount the surface.
    expect(agentCanMountBuiltinToolSurface({ agencyConfig: null }, 'devin')).toBe(false);
  });

  it('an explicit provider beats a model override', () => {
    expect(
      agentCanMountBuiltinToolSurface(
        { agencyConfig: { heterogeneousProvider: { type: 'pi' } } },
        'claude-code',
      ),
    ).toBe(false);
  });
});
