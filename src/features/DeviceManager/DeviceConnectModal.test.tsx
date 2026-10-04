/** @vitest-environment happy-dom */
import { fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliReleaseInfo } from '@/services/cliRelease';

import DeviceConnectModal from './DeviceConnectModal';

const query = vi.hoisted(() => ({
  data: undefined as CliReleaseInfo | null | undefined,
  error: undefined as Error | undefined,
  isLoading: false,
  mutate: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'workspace-one',
}));
vi.mock('@/libs/swr', () => ({ useClientDataSWR: () => query }));
vi.mock('@/components/ImperativeModal', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/NeuralNetworkLoading', () => ({
  default: () => <div role="status">Loading</div>,
}));

const renderGuide = () => render(<DeviceConnectModal open scope="workspace" onClose={vi.fn()} />);

describe('Device CLI installation guide', () => {
  beforeEach(() => {
    query.data = undefined;
    query.error = undefined;
    query.isLoading = false;
    query.mutate.mockReset();
  });

  it('never offers the unavailable npm registry package when a release has no CLI asset', () => {
    query.data = null;
    const view = renderGuide();
    expect(view.getByText('devices.connectWizard.cli.unavailable')).toBeTruthy();
    expect(view.getByRole('link', { name: 'devices.connectWizard.cli.viewReleases' })).toBeTruthy();
    expect(view.queryByText(/npm install -g/)).toBeNull();
  });

  it('waits for release information and provides retry on a failed lookup', () => {
    query.isLoading = true;
    const view = renderGuide();
    expect(view.getByRole('status')).toBeTruthy();
    expect(view.queryByText('devices.connectWizard.cli.unavailable')).toBeNull();
    query.isLoading = false;
    query.error = new Error('offline');
    view.rerender(
      <DeviceConnectModal open scope="workspace" visibility="public" onClose={vi.fn()} />,
    );
    fireEvent.click(view.getByRole('button', { name: 'error.retry' }));
    expect(query.mutate).toHaveBeenCalledOnce();
    expect(view.queryByText(/npm install -g/)).toBeNull();
  });

  it('offers installation only from a returned release asset', () => {
    query.data = {
      assetName: 'orvilo-cli-0.0.54.tgz',
      tag: 'v2.6.1',
      url: 'https://github.com/alexj11324/orvilo1/releases/download/v2.6.1/orvilo-cli-0.0.54.tgz',
      version: '2.6.1',
    };
    const view = renderGuide();
    expect(view.getByText(`npm install -g '${query.data.url}'`)).toBeTruthy();
    expect(view.queryByText('devices.connectWizard.cli.unavailable')).toBeNull();
  });
});
