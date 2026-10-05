import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentAvailability } from './useAgentAvailability';

const mock = vi.hoisted(() => ({
  agents: [] as { id: string; heterogeneousType: string }[],
  agentResponse: {
    data: {} as unknown,
    error: undefined as unknown,
    mutate: vi.fn(),
    isValidating: false,
  },
  providerResponse: {
    data: {} as unknown,
    error: undefined as unknown,
    mutate: vi.fn(),
    isValidating: false,
  },
  resumedResponse: {
    data: undefined as { agent: { id: string; heterogeneousType: string } | null } | undefined,
    error: undefined as unknown,
    mutate: vi.fn(),
  },
  resumed: vi.fn(),
  setup: { firstAgentId: 'first-agent', workspaceId: 'created-workspace' },
}));
vi.mock('@/store/user', () => ({
  useUserStore: (selector: (s: unknown) => unknown) =>
    selector({ isSignedIn: true, onboarding: { setup: mock.setup } }),
}));
vi.mock('@/store/home', () => ({
  useHomeStore: (selector: (s: unknown) => unknown) =>
    selector({ agents: mock.agents, useFetchAgentList: () => mock.agentResponse }),
}));
vi.mock('@/store/home/selectors', () => ({
  homeAgentListSelectors: { allAgents: (s: { agents: unknown[] }) => s.agents },
}));
vi.mock('@/store/providerBinding', () => ({
  useProviderBindingStore: (selector: (s: unknown) => unknown) => selector({ bindings: [] }),
  useFetchProviderBindings: () => mock.providerResponse,
}));
vi.mock('@/store/agent/useFetchOnboardingAgent', () => ({
  useFetchOnboardingAgent: (...args: unknown[]) => {
    mock.resumed(...args);
    return mock.resumedResponse;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.agents = [];
  mock.agentResponse.data = {};
  mock.agentResponse.error = undefined;
  mock.resumedResponse.data = undefined;
  mock.resumedResponse.error = undefined;
});

describe('first agent reload after private workspace transfer', () => {
  it('waits for the checkpointed workspace row, then accepts the same agent instead of asking for another', () => {
    const view = renderHook(useAgentAvailability);
    expect(view.result.current.ready).toBe(false);
    expect(mock.resumed).toHaveBeenCalledWith(true, 'first-agent', 'created-workspace');
    mock.resumedResponse.data = { agent: { id: 'first-agent', heterogeneousType: 'claude-code' } };
    view.rerender();
    expect(view.result.current.ready).toBe(true);
    expect(view.result.current.availability.usable).toBe(true);
  });
  it('surfaces a failed checkpoint load instead of treating it as a missing agent', () => {
    const failure = new Error('workspace load failed');
    mock.resumedResponse.error = failure;
    expect(renderHook(useAgentAvailability).result.current.error).toBe(failure);
  });
  it('does not depend on a workspace checkpoint for an already connected personal agent', () => {
    mock.agents = [{ id: 'existing-agent', heterogeneousType: 'codex' }];
    const gate = renderHook(useAgentAvailability).result.current;
    expect(gate.ready).toBe(true);
    expect(gate.availability.usable).toBe(true);
    expect(mock.resumed).toHaveBeenCalledWith(false, 'first-agent', 'created-workspace');
  });
});
