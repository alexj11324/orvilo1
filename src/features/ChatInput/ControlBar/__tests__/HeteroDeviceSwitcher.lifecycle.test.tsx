import type { DeviceListItem } from '@orvilo/types';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity, useDeferredValue } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TabIdContext } from '@/features/Electron/TabHost/TabIdContext';
import { useElectronStore } from '@/store/electron';

import HeteroDeviceSwitcher from '../HeteroDeviceSwitcher';

const targetFixture = vi.hoisted(() => ({
  executionTarget: 'none' as 'none' | 'local' | 'device',
  devices: [] as DeviceListItem[],
  workspaceId: undefined as string | undefined,
  boundDeviceId: undefined as string | undefined,
  memberSelectedDeviceId: undefined as string | undefined,
  canSelectPersonalDevice: false,
  listeners: new Set<() => void>(),
}));
const buildDevice = (
  deviceId: string,
  overrides: Partial<DeviceListItem> = {},
): DeviceListItem => ({
  deviceId,
  channels: [],
  defaultCwd: null,
  enroller: null,
  friendlyName: deviceId,
  hostname: deviceId,
  identitySource: 'installation',
  lastSeen: '2026-10-04T07:00:00Z',
  online: true,
  platform: null,
  registered: true,
  scope: 'personal',
  visibility: null,
  workingDirs: [],
  ...overrides,
});
const selectTargetMock = vi.hoisted(() => vi.fn());
vi.mock('@orvilo/const', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isDesktop: true,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));
vi.mock('@/features/ChatInput/hooks/useChatInputResourceAccess', () => ({
  useChatInputResourceAccess: () => ({ canUseResource: true }),
}));
vi.mock('@/features/ChatInput/hooks/useSelectExecutionTarget', () => ({
  useSelectExecutionTarget: () => selectTargetMock,
}));
vi.mock('@/features/ChatInput/hooks/useLocalSandboxCapability', () => ({
  useLocalSandboxCapability: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/features/DeviceManager/useDeviceList', () => ({
  useAgentDeviceCandidates: () => ({
    data: undefined,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  }),
  useDeviceList: () => ({ data: targetFixture.devices, isLoading: false, mutate: vi.fn() }),
}));
vi.mock('@/hooks/useTopicAgencyConfig', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useTopicAgencyConfig: () => ({
      agencyConfig: {
        boundDeviceId: targetFixture.boundDeviceId,
        executionTarget: useSyncExternalStore(
          (listener) => {
            targetFixture.listeners.add(listener);
            return () => {
              targetFixture.listeners.delete(listener);
            };
          },
          () => targetFixture.executionTarget,
        ),
      },
      canDisplayExecutionTarget: true,
      canSelectExecutionTarget: true,
      canSelectPersonalDevice: targetFixture.canSelectPersonalDevice,
      isPreferenceLoading: false,
      workspaceScoped: false,
      memberSelectedDeviceId: targetFixture.memberSelectedDeviceId,
    }),
  };
});
vi.mock('@/helpers/gatewayMode', () => ({
  useIsGatewayModeEnabled: () => targetFixture.executionTarget === 'device',
}));
vi.mock('@/hooks/useEffectiveWorkingDirectory', () => ({
  useEffectiveWorkingDirectory: () => '/repo',
}));
vi.mock('../useCommitWorkingDirectory', () => ({
  useCommitWorkingDirectory: () => ({ commit: vi.fn() }),
}));
vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (s: object) => unknown) =>
    selector({ agentMap: { 'agent-1': { workspaceId: targetFixture.workspaceId } } }),
}));
vi.mock('@/store/electron', async () => {
  const { create } = await import('zustand');
  return {
    useElectronStore: create(() => ({
      activeTabId: 'chat',
      gatewayDeviceInfo: { deviceId: 'machine' },
      useFetchGatewayDeviceInfo: vi.fn(),
    })),
  };
});
vi.mock('@/store/serverConfig', () => ({
  featureFlagsSelectors: () => ({ enableCloudSandbox: false }),
  useServerConfigStore: (selector: (s: object) => unknown) => selector({}),
}));

const view = (mode: 'visible' | 'hidden') => (
  <Activity mode={mode}>
    <HeteroDeviceSwitcher agentId="agent-1" />
  </Activity>
);

beforeEach(() => {
  targetFixture.executionTarget = 'none';
  targetFixture.devices = [buildDevice('first-personal'), buildDevice('second-personal')];
  targetFixture.workspaceId = undefined;
  targetFixture.boundDeviceId = undefined;
  targetFixture.memberSelectedDeviceId = undefined;
  targetFixture.canSelectPersonalDevice = false;
  selectTargetMock.mockClear();
});

describe('HeteroDeviceSwitcher retained tab lifecycle', () => {
  it.each([0, 1])('keeps the picker read-only with %s legitimate candidates', async (count) => {
    targetFixture.devices = Array.from({ length: count }, (_, index) =>
      buildDevice(`node-${index}`),
    );
    const user = userEvent.setup();
    render(<HeteroDeviceSwitcher agentId="agent-1" />);

    const chip = screen.getByText('heteroAgent.executionTarget.none');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await user.click(chip);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(selectTargetMock).not.toHaveBeenCalled();
  });

  it.each(['machine', 'another-machine'])(
    'identifies %s by ID and separates local and gateway routes',
    async (deviceId) => {
      targetFixture.workspaceId = 'workspace';
      targetFixture.canSelectPersonalDevice = true;
      targetFixture.devices = [
        buildDevice(deviceId, { friendlyName: 'My Mac' }),
        buildDevice('second-personal'),
      ];
      const user = userEvent.setup();
      render(<HeteroDeviceSwitcher agentId="agent-1" />);
      await user.click(screen.getByRole('button', { name: 'heteroAgent.executionTarget.none' }));
      expect(screen.getByText('heteroAgent.executionTarget.personalGroup')).toBeInTheDocument();
      expect(
        screen.queryByText('heteroAgent.executionTarget.externalGroup'),
      ).not.toBeInTheDocument();
      const gatewayRow = screen.getByRole('button', { name: /My Mac/ });
      if (deviceId === 'machine') {
        expect(within(gatewayRow).getByText('connectAgent.create.localDevice')).toBeInTheDocument();
        expect(
          within(gatewayRow).getByText('heteroAgent.executionTarget.gatewayDesc'),
        ).toBeInTheDocument();
      } else {
        expect(
          within(gatewayRow).queryByText('connectAgent.create.localDevice'),
        ).not.toBeInTheDocument();
      }
      const localRow = screen.getByRole('button', {
        name: /heteroAgent.executionTarget.localDesc/,
      });
      await user.click(localRow);
      expect(selectTargetMock).toHaveBeenLastCalledWith('local', undefined, {
        localSandbox: false,
      });
      await user.click(screen.getByRole('button', { name: 'heteroAgent.executionTarget.none' }));
      await user.click(screen.getByRole('button', { name: /My Mac/ }));
      expect(selectTargetMock).toHaveBeenLastCalledWith('device', deviceId, {
        localSandbox: undefined,
      });
    },
  );

  it('lets an authorized caller repair a missing workspace binding with their personal node', async () => {
    targetFixture.workspaceId = 'workspace';
    targetFixture.executionTarget = 'device';
    targetFixture.canSelectPersonalDevice = true;
    targetFixture.devices = [
      buildDevice('personal-node', { friendlyName: 'My Node' }),
      buildDevice('second-personal'),
    ];
    const user = userEvent.setup();
    render(<HeteroDeviceSwitcher agentId="agent-1" />);
    await user.click(
      screen.getByRole('button', { name: 'heteroAgent.executionTarget.unknownDevice' }),
    );
    await user.click(screen.getByRole('button', { name: /My Node/ }));
    expect(selectTargetMock).toHaveBeenCalledWith('device', 'personal-node', {
      localSandbox: undefined,
    });
  });
  it('keeps an explicitly selected authorized personal host valid for a workspace Agent', () => {
    targetFixture.workspaceId = 'workspace';
    targetFixture.executionTarget = 'device';
    targetFixture.boundDeviceId = 'personal-node';
    targetFixture.memberSelectedDeviceId = 'personal-node';
    targetFixture.devices = [
      {
        deviceId: 'personal-node',
        defaultCwd: '/repo',
        enroller: { avatar: null, fullName: 'Test User', userId: 'user-1', username: 'test-user' },
        hostname: 'test-node',
        identitySource: 'installation',
        lastSeen: '2026-10-04T07:00:00Z',
        platform: null,
        visibility: null,
        workingDirs: [],
        scope: 'personal',
        registered: true,
        online: true,
        friendlyName: 'My Node',
        channels: [
          {
            channel: 'cli',
            connectedAt: '2026-10-04T07:00:00Z',
            hostname: 'test-node',
            platform: null,
          },
        ],
      },
    ];
    render(<HeteroDeviceSwitcher agentId="agent-1" />);
    expect(screen.getByText('My Node')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'My Node' })).not.toBeInTheDocument();
    expect(
      screen.queryByText('heteroAgent.executionTarget.bindingInvalid'),
    ).not.toBeInTheDocument();
  });
  it('does not authorize a personal host from the shared Agent default alone', () => {
    targetFixture.workspaceId = 'workspace';
    targetFixture.executionTarget = 'device';
    targetFixture.boundDeviceId = 'personal-node';
    targetFixture.devices = [
      {
        deviceId: 'personal-node',
        defaultCwd: '/repo',
        enroller: { avatar: null, fullName: 'Test User', userId: 'user-1', username: 'test-user' },
        hostname: 'test-node',
        identitySource: 'installation',
        lastSeen: '2026-10-04T07:00:00Z',
        platform: null,
        visibility: null,
        workingDirs: [],
        scope: 'personal',
        registered: true,
        online: true,
        friendlyName: 'My Node',
        channels: [],
      },
    ];
    render(<HeteroDeviceSwitcher agentId="agent-1" />);
    expect(screen.getByText('heteroAgent.executionTarget.bindingInvalid')).toBeInTheDocument();
  });
  it('leaves an unconfigured target closed until the user opens the picker', async () => {
    const user = userEvent.setup();
    render(<HeteroDeviceSwitcher agentId="agent-1" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'heteroAgent.executionTarget.none' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
  it('closes its saved open state before the desktop tab hides its retained Activity', async () => {
    const user = userEvent.setup();
    useElectronStore.setState({ activeTabId: 'chat' });
    const DesktopPane = () => {
      const activeTabId = useDeferredValue(useElectronStore((state) => state.activeTabId));
      return (
        <Activity mode={activeTabId === 'chat' ? 'visible' : 'hidden'}>
          <TabIdContext value="chat">
            <HeteroDeviceSwitcher agentId="agent-1" />
          </TabIdContext>
        </Activity>
      );
    };
    render(<DesktopPane />);
    await user.click(screen.getByRole('button', { name: 'heteroAgent.executionTarget.none' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    act(() => useElectronStore.setState({ activeTabId: 'agent' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    targetFixture.executionTarget = 'none';
    act(() => useElectronStore.setState({ activeTabId: 'chat' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      targetFixture.executionTarget = 'local';
      targetFixture.listeners.forEach((listener) => listener());
    });
    expect(
      screen.getByRole('button', { name: 'heteroAgent.executionTarget.local' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('dismisses its portal when its tab becomes hidden and does not reopen on return', async () => {
    const user = userEvent.setup();
    const { rerender } = render(view('visible'));
    await user.click(screen.getByRole('button', { name: 'heteroAgent.executionTarget.none' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await act(async () => rerender(view('hidden')));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => rerender(view('visible')));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
