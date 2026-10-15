import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAgentStore } from '@/store/agent';

import { useEffectiveAgencyConfig } from './useEffectiveAgencyConfig';

vi.mock('@/store/agent', () => ({ useAgentStore: vi.fn() }));
vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {
    getAgencyConfigById: (id: string) => (s: any) => s.agentMap[id]?.agencyConfig,
    getAgentById: (id: string) => (s: any) => s.agentMap[id],
  },
}));
describe('saved Agent runtime', () => {
  it('shows the same saved device without waiting for member preferences', () => {
    const agencyConfig = { executionTarget: 'device', boundDeviceId: 'saved-device' };
    const state = { agentMap: { agent: { agencyConfig, workspaceId: 'workspace' } } };
    vi.mocked(useAgentStore).mockImplementation((selector: any) => selector(state));
    const { result } = renderHook(() => useEffectiveAgencyConfig('agent'));
    expect(result.current.agencyConfig).toEqual(agencyConfig);
    expect(result.current).toMatchObject({
      canDisplayExecutionTarget: true,
      canSelectExecutionTarget: false,
      canSelectPersonalDevice: false,
      isPreferenceLoading: false,
      workspaceScoped: true,
    });
  });
  it('has no runtime summary before an Agent is selected', () => {
    vi.mocked(useAgentStore).mockImplementation((selector: any) => selector({ agentMap: {} }));
    const { result } = renderHook(() => useEffectiveAgencyConfig());
    expect(result.current.agencyConfig).toBeUndefined();
    expect(result.current.canDisplayExecutionTarget).toBe(false);
  });
});
