import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MobileSettings from '@/routes/(mobile)/chat/settings';
import { ChatSettingsTabs } from '@/store/global/initialState';
import { useUserStore } from '@/store/user';

import Content from './Content';

const mocks = vi.hoisted(() => ({
  onMetaChange: undefined as undefined | ((meta: object) => Promise<void>),
  agentState: {
    activeAgentId: 'inbox-agent',
    config: {},
    isCurrentAgentHeterogeneous: false,
    isInbox: true,
    meta: {},
    optimisticUpdateAgentConfig: vi.fn(),
    optimisticUpdateAgentMeta: vi.fn(),
    updateAgentMeta: vi.fn(),
  },
  serverState: {
    featureFlags: {
      enableAgentSelfIteration: true,
    },
  },
}));

vi.mock('@/features/AgentSetting', () => ({
  AgentSettings: ({
    tab,
    onMetaChange,
  }: {
    tab: ChatSettingsTabs;
    onMetaChange: (meta: object) => Promise<void>;
  }) => {
    mocks.onMetaChange = onMetaChange;
    return <div data-tab={tab} data-testid="agent-settings-content" />;
  },
  SettingsModalLayout: ({
    activeTab,
    tabs = [],
    children,
  }: {
    activeTab?: string;
    children?: ReactNode;
    tabs?: { key: string }[];
  }) => (
    <div
      data-active={activeTab}
      data-tabs={tabs.map((tab) => tab.key).join(',')}
      data-testid="layout"
    >
      {children}
    </div>
  ),
}));

vi.mock('@/features/AgentSetting/AgentSettings', () => ({
  default: ({ onMetaChange }: { onMetaChange: (meta: object) => Promise<void> }) => {
    mocks.onMetaChange = onMetaChange;
    return null;
  },
}));
vi.mock('@/features/AgentSetting/AgentCategory/useCategory', () => ({ useCategory: () => [] }));
vi.mock('@/routes/(mobile)/chat/settings/_layout/Header', () => ({ default: () => null }));
vi.mock('@/features/Setting/Footer', () => ({ default: () => null }));
vi.mock('@/components/server/MobileNavLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: true }) }));
vi.mock('@/store/session', () => ({
  useSessionStore: (selector: (state: object) => unknown) => selector({ activeId: 'inbox-agent' }),
}));

vi.mock('@/store/agent', () => {
  const useAgentStore = (selector: (state: typeof mocks.agentState) => unknown) =>
    selector(mocks.agentState);
  useAgentStore.getState = () => mocks.agentState;

  return { useAgentStore };
});

vi.mock('@/store/agent/selectors', () => ({
  agentSelectors: {
    currentAgentConfig: (state: typeof mocks.agentState) => state.config,
    currentAgentMeta: (state: typeof mocks.agentState) => state.meta,
    isCurrentAgentHeterogeneous: (state: typeof mocks.agentState) =>
      state.isCurrentAgentHeterogeneous,
  },
  builtinAgentSelectors: {
    isInboxAgent: (state: typeof mocks.agentState) => state.isInbox,
  },
}));

vi.mock('@/store/serverConfig', () => ({
  featureFlagsSelectors: (state: typeof mocks.serverState) => state.featureFlags,
  useServerConfigStore: (selector: (state: typeof mocks.serverState) => unknown) =>
    selector(mocks.serverState),
}));

describe('AgentSettings Content', () => {
  beforeEach(() => {
    useUserStore.setState({
      preference: { lab: { enableAgentGraphConfig: false, enableSelfLearning: false } },
    });
    mocks.agentState.isInbox = true;
    mocks.serverState.featureFlags.enableAgentSelfIteration = true;
  });

  it('exposes both tabs for inbox when feature is on', () => {
    render(<Content />);

    const layout = screen.getByTestId('layout');
    expect(layout).toHaveAttribute('data-active', ChatSettingsTabs.Opening);
    expect(layout).toHaveAttribute(
      'data-tabs',
      `${ChatSettingsTabs.Opening},${ChatSettingsTabs.SelfIteration}`,
    );
    expect(screen.getByTestId('agent-settings-content')).toHaveAttribute(
      'data-tab',
      ChatSettingsTabs.Opening,
    );
  });

  it('exposes both tabs when not inbox and feature is on', () => {
    mocks.agentState.isInbox = false;

    render(<Content />);

    const layout = screen.getByTestId('layout');
    expect(layout).toHaveAttribute('data-active', ChatSettingsTabs.Opening);
    expect(layout).toHaveAttribute(
      'data-tabs',
      `${ChatSettingsTabs.Opening},${ChatSettingsTabs.SelfIteration}`,
    );
  });

  it('falls back to opening when feature flag is off (inbox)', () => {
    mocks.serverState.featureFlags.enableAgentSelfIteration = false;

    render(<Content />);

    const layout = screen.getByTestId('layout');
    expect(layout).toHaveAttribute('data-active', ChatSettingsTabs.Opening);
    expect(layout).toHaveAttribute('data-tabs', ChatSettingsTabs.Opening);
  });

  it('exposes only opening when feature flag is off', () => {
    mocks.agentState.isInbox = false;
    mocks.serverState.featureFlags.enableAgentSelfIteration = false;

    render(<Content />);

    const layout = screen.getByTestId('layout');
    expect(layout).toHaveAttribute('data-tabs', ChatSettingsTabs.Opening);
  });
});

it('propagates metadata persistence failure from the production callback', async () => {
  const failure = new Error('write rejected');
  mocks.agentState.optimisticUpdateAgentMeta.mockImplementation(
    async (_id, _meta, _extra, options) => {
      if (options?.rethrow) throw failure;
    },
  );
  render(<Content />);
  await expect(mocks.onMetaChange!({ title: 'new title' })).rejects.toBe(failure);
  expect(mocks.agentState.optimisticUpdateAgentMeta).toHaveBeenCalledWith(
    'inbox-agent',
    { title: 'new title' },
    undefined,
    { rethrow: true },
  );
});

it('propagates metadata persistence failure from the mobile callback', async () => {
  const failure = new Error('mobile write rejected');
  mocks.agentState.updateAgentMeta.mockImplementation(async (_meta, options) => {
    if (options?.rethrow) throw failure;
  });
  render(<MobileSettings />);
  await expect(mocks.onMetaChange!({ title: 'mobile title' })).rejects.toBe(failure);
  expect(mocks.agentState.updateAgentMeta).toHaveBeenCalledWith(
    { title: 'mobile title' },
    { rethrow: true },
  );
});
