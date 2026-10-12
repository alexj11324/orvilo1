import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEffectiveAgencyConfig } from './useEffectiveAgencyConfig';

const fixture = vi.hoisted(() => ({
  canManageAgent: false,
  isAccessLoading: false,
  agent: {
    agencyConfig: { boundDeviceId: 'saved', executionTarget: 'device' },
    visibility: 'public',
    workspaceId: 'ws',
  } as any,
}));
vi.mock('@/features/ResourcePermission/useAgentManagementAccess', () => ({
  useAgentManagementAccess: () => fixture,
}));
vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: any) => selector({ agentMap: { agent: fixture.agent } }),
}));
vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {
    getAgencyConfigById: (id: string) => (s: any) => s.agentMap[id]?.agencyConfig,
    getAgentById: (id: string) => (s: any) => s.agentMap[id],
  },
}));

describe('saved Agent device', () => {
  beforeEach(() => {
    fixture.canManageAgent = false;
    fixture.isAccessLoading = false;
    fixture.agent.visibility = 'public';
  });
  it('gives members the saved device without an editable selector', () => {
    const { result } = renderHook(() => useEffectiveAgencyConfig('agent'));
    expect(result.current.agencyConfig).toEqual({
      boundDeviceId: 'saved',
      executionTarget: 'device',
    });
    expect(result.current.canSelectExecutionTarget).toBe(false);
    expect(result.current.workspaceScoped).toBe(true);
  });
  it('allows managers to edit the saved device, with the same effective config', () => {
    fixture.canManageAgent = true;
    const { result } = renderHook(() => useEffectiveAgencyConfig('agent'));
    expect(result.current.agencyConfig?.boundDeviceId).toBe('saved');
    expect(result.current.canSelectExecutionTarget).toBe(true);
    expect(result.current.canSelectPersonalDevice).toBe(false);
  });
  it('allows a private Agent manager to use their own device', () => {
    fixture.canManageAgent = true;
    fixture.agent.visibility = 'private';
    const { result } = renderHook(() => useEffectiveAgencyConfig('agent'));
    expect(result.current.canSelectPersonalDevice).toBe(true);
    expect(result.current.workspaceScoped).toBe(false);
  });
});
