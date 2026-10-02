// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { agentCanMountBuiltinToolSurface } from '../pipeline/resolveExecutionBinding';

describe('agentCanMountBuiltinToolSurface', () => {
  it('treats the builtin orvilo binding as mount-capable', () => {
    expect(agentCanMountBuiltinToolSurface({ agencyConfig: null })).toBe(true);
    expect(agentCanMountBuiltinToolSurface(undefined)).toBe(true);
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
    expect(agentCanMountBuiltinToolSurface({ agencyConfig: null }, 'devin')).toBe(true);
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
