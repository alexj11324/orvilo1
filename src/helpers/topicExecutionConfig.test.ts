import { applyTopicExecutionConfig, snapshotTopicExecutionConfig } from '@orvilo/types';
import { describe, expect, it, vi } from 'vitest';

import { createServerConfigStore } from '@/store/serverConfig/store';

import { resolveExecutionTarget } from './executionTarget';
import { getTopicAgencyConfig, resolveTopicAgencyConfig } from './topicExecutionConfig';

describe('Topic uses saved Agent routing', () => {
  it('ignores recorded topic device fields and follows changes to Agent settings', () => {
    const oldTopic = { boundDeviceId: 'old', executionTarget: 'local' as const };
    const saved = {
      boundDeviceId: 'saved',
      executionTarget: 'device' as const,
      localSandbox: true,
    };
    expect(applyTopicExecutionConfig(saved, oldTopic)).toEqual(saved);
    expect(resolveTopicAgencyConfig(saved, oldTopic, true)).toEqual({
      agencyConfig: saved,
      workspaceScoped: true,
    });
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
    resolveTopicAgencyConfig(defaults, { executionTarget: 'local' }, false, false).agencyConfig
      ?.executionTarget,
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
