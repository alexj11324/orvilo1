// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isAgentSignalEnabledForUser,
  isOrviloAiAgentSlug,
  resolveAgentSelfIterationCapability,
} from '../featureGate';

const mocks = vi.hoisted(() => ({
  getServerFeatureFlagsStateFromRuntimeConfig: vi.fn(),
}));

vi.mock('@/server/featureFlags', () => ({
  getServerFeatureFlagsStateFromRuntimeConfig: mocks.getServerFeatureFlagsStateFromRuntimeConfig,
}));

describe('isAgentSignalEnabledForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerFeatureFlagsStateFromRuntimeConfig.mockResolvedValue({
      enableAgentSelfIteration: true,
    });
  });

  /**
   * @example
   * expect(result).toBe(true).
   */
  it('uses the feature flag as the user-level Agent Signal gate', async () => {
    const result = await isAgentSignalEnabledForUser({} as never, 'user-1');

    expect(result).toBe(true);
    expect(mocks.getServerFeatureFlagsStateFromRuntimeConfig).toHaveBeenCalledWith('user-1');
  });
});

describe('agentSignal feature gates', () => {
  it('recognizes only the inbox builtin slug as Orvilo AI', () => {
    expect(isOrviloAiAgentSlug('inbox')).toBe(true);
    expect(isOrviloAiAgentSlug('task-agent')).toBe(false);
    expect(isOrviloAiAgentSlug('page-agent')).toBe(false);
    expect(isOrviloAiAgentSlug(undefined)).toBe(false);
    expect(isOrviloAiAgentSlug(null)).toBe(false);
    expect(isOrviloAiAgentSlug('')).toBe(false);
  });

  it('disables self-iteration when the feature flag is disabled', () => {
    expect(
      resolveAgentSelfIterationCapability({
        agentSelfIterationEnabled: true,
        isAgentSelfIterationFeatureEnabled: false,
        isOrviloAiAgent: true,
      }),
    ).toBe(false);
  });

  it('enables Orvilo AI self-iteration when the feature flag is enabled', () => {
    expect(
      resolveAgentSelfIterationCapability({
        isAgentSelfIterationFeatureEnabled: true,
        isOrviloAiAgent: true,
      }),
    ).toBe(true);
  });

  it('keeps non-Orvilo AI agents behind agentSelfIterationEnabled', () => {
    expect(
      resolveAgentSelfIterationCapability({
        agentSelfIterationEnabled: true,
        isAgentSelfIterationFeatureEnabled: true,
        isOrviloAiAgent: false,
      }),
    ).toBe(true);

    expect(
      resolveAgentSelfIterationCapability({
        agentSelfIterationEnabled: false,
        isAgentSelfIterationFeatureEnabled: true,
        isOrviloAiAgent: false,
      }),
    ).toBe(false);

    expect(
      resolveAgentSelfIterationCapability({
        isAgentSelfIterationFeatureEnabled: true,
        isOrviloAiAgent: false,
      }),
    ).toBe(false);
  });
});
