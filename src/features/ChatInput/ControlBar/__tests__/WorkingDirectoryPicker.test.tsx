import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WorkingDirectoryPicker from '../WorkingDirectoryPicker';

const mocks = vi.hoisted(() => ({
  addFolder: vi.fn(),
  isLocked: false,
  clear: vi.fn().mockResolvedValue(undefined),
  commit: vi.fn().mockResolvedValue(undefined),
  updateDeviceCwd: vi.fn().mockResolvedValue(undefined),
}));
const recents = vi.hoisted(() => [{ path: '/repo/active' }, { path: '/repo/other' }]);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/features/Conversation/store', () => ({
  useConversationStore: (selector: (s: object) => unknown) => selector({ context: {} }),
}));
vi.mock('@/hooks/useTopicAgencyConfig', () => ({
  useTopicAgencyConfig: () => ({
    agencyConfig: {
      boundDeviceId: 'remote',
      executionTarget: 'device',
      workingDirByDevice: { remote: '/repo/active' },
    },
    workspaceScoped: false,
  }),
}));
vi.mock('@/store/user', () => ({ useUserStore: () => true }));
vi.mock('@/store/user/selectors', () => ({ authSelectors: { isLogin: () => true } }));
vi.mock('@/store/electron', () => ({
  useElectronStore: (selector: (s: object) => unknown) => selector({}),
}));
vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (s: object) => unknown) =>
    selector({ localAgentWorkingDirectoryMap: {} }),
}));
vi.mock('@/store/chat', () => ({ useChatStore: () => undefined }));
vi.mock('@/store/chat/selectors', () => ({
  topicSelectors: { getTopicWorkingDirectory: () => () => undefined },
}));
vi.mock('@/store/device', () => ({
  deviceSelectors: {
    getDeviceWorkingDirs: () => () => recents,
    getDeviceDefaultCwd: () => () => undefined,
  },
  useDeviceStore: (selector: (s: object) => unknown) =>
    selector({
      clearDeviceDefaultCwd: vi.fn(),
      removeDeviceWorkingDir: vi.fn(),
      updateDeviceCwd: mocks.updateDeviceCwd,
      useFetchDevices: vi.fn(),
    }),
}));
vi.mock('../useCommitWorkingDirectory', () => ({
  useCommitWorkingDirectory: () => ({
    clear: mocks.clear,
    commit: mocks.commit,
    isLocked: mocks.isLocked,
  }),
}));
vi.mock('../useMigrateDeviceRecents', () => ({ useMigrateDeviceRecents: vi.fn() }));
vi.mock('@/features/WorkingDirectory', () => ({ openAddWorkingDirModal: mocks.addFolder }));
vi.mock('@/services/device', () => ({ deviceService: { statPath: vi.fn() } }));
vi.mock('@/components/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/platform', () => ({ getHostPort: vi.fn(), hostResultOr: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isLocked = false;
});

const openPicker = async () => {
  const user = userEvent.setup();
  render(<WorkingDirectoryPicker agentId="agent-1" />);
  await user.click(screen.getByRole('button', { name: 'active' }));
  return user;
};

describe('WorkingDirectoryPicker keyboard controls', () => {
  it('selects a recent directory with Enter', async () => {
    const user = await openPicker();
    const row = screen.getByText('/repo/other').closest('[role="button"]') as HTMLElement;
    expect(row).toHaveAttribute('tabindex', '0');
    row.focus();
    await user.keyboard('{Enter}');
    expect(mocks.commit).toHaveBeenCalledWith({ path: '/repo/other' });
  });

  it('keeps nested default actions independent from directory selection', async () => {
    const user = await openPicker();
    const defaultButton = screen.getAllByLabelText('workingDirectory.setDefault')[1];
    defaultButton.focus();
    await user.keyboard(' ');
    expect(mocks.updateDeviceCwd).toHaveBeenCalledWith(
      'remote',
      { path: '/repo/other' },
      { setDefault: true },
    );
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('opens the remote add-folder dialog with Enter', async () => {
    const user = await openPicker();
    const add = screen.getByRole('button', { name: 'workingDirectory.addFolder' });
    add.focus();
    await user.keyboard('{Enter}');
    expect(mocks.addFolder).toHaveBeenCalledOnce();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('resets the directory with Space', async () => {
    const user = await openPicker();
    const reset = screen.getByRole('button', { name: 'workingDirectory.clear' });
    reset.focus();
    await user.keyboard(' ');
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
});

it('keeps the directory trigger disabled during an active run', async () => {
  mocks.isLocked = true;
  const user = userEvent.setup();
  render(<WorkingDirectoryPicker agentId="agent-1" />);
  const trigger = screen.getByRole('button', { name: 'active' });
  expect(trigger).toBeDisabled();
  await user.click(trigger);
  expect(
    screen.queryByRole('button', { name: 'workingDirectory.addFolder' }),
  ).not.toBeInTheDocument();
  expect(mocks.commit).not.toHaveBeenCalled();
});
