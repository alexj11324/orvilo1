import { applyTopicExecutionConfig, snapshotTopicExecutionConfig } from '@orvilo/types';
import { describe, expect, it, vi } from 'vitest';

import { createServerConfigStore } from '@/store/serverConfig/store';

import { resolveExecutionTarget } from './executionTarget';
import { getTopicAgencyConfig, resolveTopicAgencyConfig } from './topicExecutionConfig';

describe('Agent owns topic execution identity', () => {
  it('uses saved routing after the Agent configuration changes', () => {
    const previous = snapshotTopicExecutionConfig({
      executionTarget: 'device',
      boundDeviceId: 'previous',
    });
    const saved = { executionTarget: 'device' as const, boundDeviceId: 'saved' };
    expect(applyTopicExecutionConfig(saved, previous)).toEqual(saved);
    expect(
      applyTopicExecutionConfig(saved, {
        executionTarget: 'sandbox',
        boundDeviceId: 'stale',
      } as any),
    ).toEqual(saved);
  });
  it('uses the saved Agent permission regardless of legacy conversation state', () => {
    const saved = {
      heterogeneousProvider: {
        type: 'codex' as const,
        permission: { configId: 'permission', value: 'ask' },
      },
    };
    expect(
      applyTopicExecutionConfig(saved, {
        permission: { provider: 'codex', configId: 'permission', value: 'bypass' },
      } as never),
    ).toEqual(saved);
  });
});

vi.mock('@/store/chat', () => ({ useChatStore: { getState: () => ({}) } }));

it.each([undefined, 'local'] as const)(
  'keeps an inherited %s workspace target from becoming local execution',
  (executionTarget) => {
    const defaults = { executionTarget };
    const selection = resolveTopicAgencyConfig(
      defaults,
      snapshotTopicExecutionConfig(defaults),
      true,
    );
    expect(selection.workspaceScoped).toBe(true);
    // pending `none` — the member's client never executes a shared local/unset
    // target, and the cloud sandbox is never an implicit substitute
    expect(
      resolveExecutionTarget(selection.agencyConfig, {
        clientExecutionAvailable: true,
        isHetero: true,
        workspaceScoped: selection.workspaceScoped,
      }),
    ).toBe('none');
  },
);

it('keeps a stored cloud sandbox selection pending while its flag is disabled', () => {
  const defaults = { executionTarget: 'sandbox' as const };
  expect(
    resolveTopicAgencyConfig(defaults, undefined, false, false).agencyConfig?.executionTarget,
  ).toBe('none');
  expect(
    resolveTopicAgencyConfig(defaults, undefined, false, true).agencyConfig?.executionTarget,
  ).toBe('sandbox');
  expect(defaults.executionTarget).toBe('sandbox');
  expect(
    resolveTopicAgencyConfig(defaults, { executionTarget: 'local' } as any, false, false)
      .agencyConfig?.executionTarget,
  ).toBe('none');
});

it('reads cloud availability through the real imperative server config API during dispatch', () => {
  const store = createServerConfigStore();
  const previous = store.getState().featureFlags;
  try {
    store.setState({ featureFlags: { ...previous, enableCloudSandbox: false } });
    expect(getTopicAgencyConfig({ executionTarget: 'sandbox' })).toMatchObject({
      executionTarget: 'none',
    });
    store.setState({ featureFlags: { ...previous, enableCloudSandbox: true } });
    expect(getTopicAgencyConfig({ executionTarget: 'sandbox' })).toMatchObject({
      executionTarget: 'sandbox',
    });
  } finally {
    store.setState({ featureFlags: previous });
  }
});
