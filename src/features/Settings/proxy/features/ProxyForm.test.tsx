/**
 * @vitest-environment happy-dom
 */
import type { NetworkProxySettings } from '@orvilo/electron-client-ipc';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProxyForm from './ProxyForm';

const setProxySettingsMock = vi.hoisted(() => vi.fn());
const testProxyConfigMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());

const defaultProxySettings = {
  enableProxy: false,
  proxyBypass: 'localhost, 127.0.0.1, ::1',
  proxyPort: '',
  proxyRequireAuth: false,
  proxyServer: '',
  proxyType: 'http',
} as const;

let savedSettings: NetworkProxySettings = { ...defaultProxySettings };

vi.mock('@/services/electron/settings', () => ({
  desktopSettingsService: {
    testProxyConfig: testProxyConfigMock,
  },
}));

vi.mock('@/store/electron', () => ({
  useElectronStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setProxySettings: setProxySettingsMock,
      useGetProxySettings: () => ({
        data: savedSettings,
        isLoading: false,
      }),
    }),
}));

vi.mock('./SaveBar', () => ({
  default: ({
    isDirty,
    isSaving,
    onReset,
    onSave,
  }: {
    isDirty: boolean;
    isSaving: boolean;
    onReset: () => void;
    onSave: () => void;
  }) =>
    isDirty ? (
      <div>
        <button disabled={isSaving} onClick={onReset}>
          proxy.resetButton
        </button>
        <button disabled={isSaving} onClick={onSave}>
          proxy.saveButton
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/toast', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

describe('ProxyForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedSettings = { ...defaultProxySettings };
    setProxySettingsMock.mockResolvedValue(undefined);
    testProxyConfigMock.mockResolvedValue({ success: true });
  });

  it('keeps enable toggle as an unsaved state when proxy config is incomplete', async () => {
    const user = userEvent.setup({ delay: null });

    render(<ProxyForm />);

    await user.click(screen.getAllByRole('switch')[0]);

    await waitFor(() => {
      expect(setProxySettingsMock).not.toHaveBeenCalled();
      expect(toastErrorMock).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'proxy.saveButton' })).toBeInTheDocument();
    });
  });

  it('blocks saving when enabled proxy settings are incomplete', async () => {
    const user = userEvent.setup({ delay: null });

    render(<ProxyForm />);

    await user.click(screen.getAllByRole('switch')[0]);
    await user.click(await screen.findByRole('button', { name: 'proxy.saveButton' }));

    await waitFor(() => {
      expect(setProxySettingsMock).not.toHaveBeenCalled();
      expect(screen.getByText('proxy.validation.serverRequired')).toBeInTheDocument();
      expect(screen.getByText('proxy.validation.portRequired')).toBeInTheDocument();
    });
  });

  it('does not convert form validation failures into a generic test toast', async () => {
    const user = userEvent.setup({ delay: null });

    render(<ProxyForm />);

    await user.click(screen.getAllByRole('switch')[0]);
    await user.click(screen.getByRole('button', { name: 'proxy.testButton' }));

    await waitFor(() => {
      expect(testProxyConfigMock).not.toHaveBeenCalled();
      expect(screen.getByText('proxy.validation.serverRequired')).toBeInTheDocument();
      expect(screen.getByText('proxy.validation.portRequired')).toBeInTheDocument();
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('resets unsaved proxy changes back to persisted settings', async () => {
    const user = userEvent.setup({ delay: null });

    render(<ProxyForm />);

    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), '127.0.0.1');
    await user.type(screen.getByPlaceholderText('7890'), '7890');
    await user.click(screen.getByRole('button', { name: 'proxy.resetButton' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'proxy.resetButton' })).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('127.0.0.1')).toHaveValue('');
      expect(screen.getByPlaceholderText('7890')).toHaveValue('');
    });
  });

  it('renders auth fields and blocks saving when proxy credentials are missing', async () => {
    const user = userEvent.setup({ delay: null });

    render(<ProxyForm />);

    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), '127.0.0.1');
    await user.type(screen.getByPlaceholderText('7890'), '7890');
    await user.click(screen.getAllByRole('switch')[1]);

    expect(screen.getByPlaceholderText('proxy.username_placeholder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('proxy.password_placeholder')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'proxy.saveButton' }));

    await waitFor(() => {
      expect(setProxySettingsMock).not.toHaveBeenCalled();
      expect(screen.getByText('proxy.validation.usernameRequired')).toBeInTheDocument();
      expect(screen.getByText('proxy.validation.passwordRequired')).toBeInTheDocument();
    });
  });

  it('blocks saving when the proxy port is outside the valid range', async () => {
    const user = userEvent.setup({ delay: null });

    render(<ProxyForm />);

    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), '127.0.0.1');
    await user.type(screen.getByPlaceholderText('7890'), '70000');
    await user.click(screen.getByRole('button', { name: 'proxy.saveButton' }));

    await waitFor(() => {
      expect(setProxySettingsMock).not.toHaveBeenCalled();
      expect(screen.getByText('proxy.validation.portInvalid')).toBeInTheDocument();
    });
  });

  it('saves a valid proxy configuration from the save bar', async () => {
    const user = userEvent.setup({ delay: null });

    render(<ProxyForm />);

    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), '127.0.0.1');
    await user.type(screen.getByPlaceholderText('7890'), '7890');
    await user.click(screen.getByRole('button', { name: 'proxy.saveButton' }));

    await waitFor(() => {
      expect(setProxySettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          enableProxy: true,
          proxyPort: '7890',
          proxyServer: '127.0.0.1',
          proxyType: 'http',
        }),
      );
    });
  });

  it('reverts the enable switch and shows an error when auto-saving fails', async () => {
    const user = userEvent.setup({ delay: null });

    render(<ProxyForm />);

    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), '127.0.0.1');
    await user.type(screen.getByPlaceholderText('7890'), '7890');

    setProxySettingsMock.mockRejectedValueOnce(new Error('boom'));

    await user.click(screen.getAllByRole('switch')[0]);

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('proxy.saveFailed');
      expect(screen.getAllByRole('switch')[0]).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('tests a valid proxy configuration successfully', async () => {
    const user = userEvent.setup({ delay: null });

    testProxyConfigMock.mockResolvedValue({ responseTime: 42, success: true });

    render(<ProxyForm />);

    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), '127.0.0.1');
    await user.type(screen.getByPlaceholderText('7890'), '7890');
    await user.click(screen.getByRole('button', { name: 'proxy.testButton' }));

    await waitFor(() => {
      expect(testProxyConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({
          enableProxy: true,
          proxyPort: '7890',
          proxyServer: '127.0.0.1',
          proxyType: 'http',
        }),
        'https://www.google.com',
      );
      expect(toastSuccessMock).toHaveBeenCalledWith('proxy.testSuccessWithTime');
    });
  });

  it('surfaces proxy connectivity failures from the test action', async () => {
    const user = userEvent.setup({ delay: null });

    testProxyConfigMock.mockResolvedValue({ message: 'connect ECONNREFUSED', success: false });

    render(<ProxyForm />);

    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), '127.0.0.1');
    await user.type(screen.getByPlaceholderText('7890'), '7890');
    await user.click(screen.getByRole('button', { name: 'proxy.testButton' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('proxy.testFailed: connect ECONNREFUSED');
    });
  });
  it('keeps hidden credentials locally but omits them from the explicit save payload', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProxyForm />);
    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), '127.0.0.1');
    await user.type(screen.getByPlaceholderText('7890'), '7890');
    await user.click(screen.getAllByRole('switch')[1]);
    await user.type(screen.getByPlaceholderText('proxy.username_placeholder'), 'local-user');
    await user.type(screen.getByPlaceholderText('proxy.password_placeholder'), 'local-password');
    await user.click(screen.getAllByRole('switch')[1]);
    await user.click(screen.getByRole('button', { name: 'proxy.saveButton' }));
    await waitFor(() => expect(setProxySettingsMock).toHaveBeenCalledOnce());
    expect(setProxySettingsMock.mock.calls[0][0]).toEqual({
      enableProxy: true,
      proxyType: 'http',
      proxyServer: '127.0.0.1',
      proxyPort: '7890',
      proxyRequireAuth: false,
    });
    await user.click(screen.getAllByRole('switch')[1]);
    expect(screen.getByPlaceholderText('proxy.username_placeholder')).toHaveValue('local-user');
    expect(screen.getByPlaceholderText('proxy.password_placeholder')).toHaveValue('local-password');
  });

  it('auto-saves only the disabled flag when switching off', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProxyForm />);
    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), '127.0.0.1');
    await user.type(screen.getByPlaceholderText('7890'), '7890');
    await user.click(screen.getAllByRole('switch')[0]);
    await waitFor(() => expect(setProxySettingsMock).toHaveBeenCalledWith({ enableProxy: false }));
    await user.click(screen.getAllByRole('switch')[0]);
    await waitFor(() =>
      expect(setProxySettingsMock).toHaveBeenLastCalledWith({
        enableProxy: true,
        proxyType: 'http',
        proxyServer: '127.0.0.1',
        proxyPort: '7890',
        proxyRequireAuth: false,
      }),
    );
  });

  it('does not normalize accepted server and port strings in a saved payload', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProxyForm />);
    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), ' 999.999.999.999 ');
    await user.type(screen.getByPlaceholderText('7890'), ' 80abc ');
    await user.click(screen.getByRole('button', { name: 'proxy.saveButton' }));
    await waitFor(() =>
      expect(setProxySettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          proxyServer: ' 999.999.999.999 ',
          proxyPort: ' 80abc ',
        }),
      ),
    );
  });
  it('submits a password committed on blur and retains accessible field errors', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProxyForm />);
    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), 'localhost');
    await user.type(screen.getByPlaceholderText('7890'), '7890');
    await user.click(screen.getAllByRole('switch')[1]);
    await user.click(screen.getByRole('button', { name: 'proxy.saveButton' }));
    const password = screen.getByPlaceholderText('proxy.password_placeholder');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    const errorId = password.getAttribute('aria-describedby');
    expect(document.getElementById(errorId!)).toHaveTextContent(
      'proxy.validation.passwordRequired',
    );
    await user.type(screen.getByPlaceholderText('proxy.username_placeholder'), 'local-user');
    await user.type(password, 'local-password');
    await user.click(screen.getByRole('button', { name: 'proxy.saveButton' }));
    await waitFor(() =>
      expect(setProxySettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          proxyUsername: 'local-user',
          proxyPassword: 'local-password',
        }),
      ),
    );
  });

  it('does not submit while the password visibility button or Enter commits an edit', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProxyForm />);
    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), 'localhost');
    await user.type(screen.getByPlaceholderText('7890'), '7890');
    await user.click(screen.getAllByRole('switch')[1]);
    await user.type(screen.getByPlaceholderText('proxy.username_placeholder'), 'local-user');
    const password = screen.getByPlaceholderText('proxy.password_placeholder');
    await user.type(password, 'local-password');
    fireEvent.keyDown(password, { key: 'Enter' });
    expect(setProxySettingsMock).not.toHaveBeenCalled();
    const eye = password.parentElement!.querySelector('button')!;
    await user.click(eye);
    expect(password).toHaveAttribute('type', 'text');
    expect(setProxySettingsMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'proxy.saveButton' }));
    await waitFor(() =>
      expect(setProxySettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          proxyPassword: 'local-password',
        }),
      ),
    );
  });

  it('releases saving state and retains edits after a failed explicit save', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProxyForm />);
    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), 'localhost');
    await user.type(screen.getByPlaceholderText('7890'), '7890');
    setProxySettingsMock.mockRejectedValueOnce(new Error('save failed'));
    await user.click(screen.getByRole('button', { name: 'proxy.saveButton' }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('proxy.saveFailed'));
    expect(screen.getByRole('button', { name: 'proxy.saveButton' })).toBeEnabled();
    expect(screen.getByPlaceholderText('127.0.0.1')).toHaveValue('localhost');
  });

  it('retains bypass and test URL while keeping the test action outside the saved fields', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProxyForm />);
    const testUrl = screen.getByPlaceholderText('proxy.testUrlPlaceholder');
    await user.clear(testUrl);
    await user.type(testUrl, 'https://example.invalid/local-test');
    expect(screen.queryByRole('button', { name: 'proxy.saveButton' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'proxy.testButton' }));
    await waitFor(() =>
      expect(testProxyConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({
          proxyBypass: 'localhost, 127.0.0.1, ::1',
        }),
        'https://example.invalid/local-test',
      ),
    );
    expect(setProxySettingsMock).not.toHaveBeenCalled();
  });

  it('preserves edits across saved-settings refreshes and resets to the latest saved values', async () => {
    const user = userEvent.setup({ delay: null });
    const { rerender } = render(<ProxyForm />);
    await user.click(screen.getAllByRole('switch')[0]);
    await user.type(screen.getByPlaceholderText('127.0.0.1'), 'draft-host');
    savedSettings = { ...savedSettings, proxyServer: 'persisted-host', proxyPort: '8080' };
    rerender(<ProxyForm />);
    expect(screen.getByPlaceholderText('127.0.0.1')).toHaveValue('draft-host');
    await user.click(screen.getByRole('button', { name: 'proxy.resetButton' }));
    expect(screen.getByPlaceholderText('127.0.0.1')).toHaveValue('persisted-host');
    expect(screen.getByPlaceholderText('7890')).toHaveValue('8080');
    expect(screen.queryByRole('button', { name: 'proxy.saveButton' })).not.toBeInTheDocument();
    expect(setProxySettingsMock).not.toHaveBeenCalled();
  });
  it('validates a native form submission without saving settings', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProxyForm />);
    await user.click(screen.getAllByRole('switch')[0]);
    fireEvent.submit(screen.getByPlaceholderText('127.0.0.1').closest('form')!);
    expect(screen.getByPlaceholderText('127.0.0.1')).toHaveAttribute('aria-invalid', 'true');
    expect(setProxySettingsMock).not.toHaveBeenCalled();
  });
}, 10000);
