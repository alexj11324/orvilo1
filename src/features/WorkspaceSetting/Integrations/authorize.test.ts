import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { electronSystemService } from '@/services/electron/system';
import { slackIntegrationService } from '@/services/slackIntegration';

import { authorizeSlack } from './authorize';

const mode = vi.hoisted(() => ({ desktop: false }));
vi.mock('@/platform', () => ({
  getHostContext: () => ({ kind: mode.desktop ? 'desktop' : 'web' }),
}));
vi.mock('@/services/slackIntegration', () => ({
  slackIntegrationService: { startOAuth: vi.fn(), oauthResult: vi.fn() },
}));
vi.mock('@/services/electron/system', () => ({
  electronSystemService: { openExternalLink: vi.fn() },
}));
vi.mock('@/store/electron', () => ({ useElectronStore: { getState: () => ({}) } }));
vi.mock('@/store/electron/selectors', () => ({
  electronSyncSelectors: { remoteServerUrl: () => 'https://orvilo.aspectlylabs.com' },
}));

const popup = () => ({ close: vi.fn(), closed: false, location: { href: '' } });
beforeEach(() => {
  vi.useFakeTimers();
  mode.desktop = false;
  vi.mocked(slackIntegrationService.startOAuth).mockResolvedValue({
    authorizationUrl: 'https://slack.com/oauth/v2/authorize?state=server-state',
  });
  vi.mocked(slackIntegrationService.oauthResult).mockResolvedValue(null);
  vi.mocked(electronSystemService.openExternalLink).mockResolvedValue();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('Slack OAuth authorization', () => {
  it('does not start OAuth when the browser blocks the popup', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(await authorizeSlack('workspace-1', 'workspace', new AbortController().signal)).toEqual({
      status: 'error',
      error: 'popup_blocked',
    });
    expect(slackIntegrationService.startOAuth).not.toHaveBeenCalled();
  });
  it('accepts only the correlated callback from the authorization window', async () => {
    const child = popup();
    vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
    const controller = new AbortController();
    const operation = authorizeSlack('workspace-1', 'workspace', controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    const attempt = vi.mocked(slackIntegrationService.startOAuth).mock.calls[0][2];
    let settled = false;
    void operation.then(() => {
      settled = true;
    });
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: location.origin,
        source: child as unknown as Window,
        data: { type: 'orvilo-slack-oauth', attempt: 'other', success: true },
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: location.origin,
        source: child as unknown as Window,
        data: { type: 'orvilo-slack-oauth', attempt, success: true },
      }),
    );
    expect((await operation).status).toBe('success');
    expect(child.close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('opens Electron OAuth externally and polls the exact server attempt', async () => {
    mode.desktop = true;
    const open = vi.spyOn(window, 'open');
    vi.mocked(slackIntegrationService.oauthResult).mockResolvedValue({ success: true });
    const operation = authorizeSlack('workspace-1', 'personal', new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1500);
    expect((await operation).status).toBe('success');
    expect(open).not.toHaveBeenCalled();
    expect(electronSystemService.openExternalLink).toHaveBeenCalled();
    expect(slackIntegrationService.oauthResult).toHaveBeenCalledWith(
      'workspace-1',
      vi.mocked(slackIntegrationService.startOAuth).mock.calls[0][2],
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not turn denied or cancelled authorization into success', async () => {
    mode.desktop = true;
    vi.mocked(slackIntegrationService.oauthResult).mockResolvedValue({
      success: false,
      error: 'access_denied',
    });
    const denied = authorizeSlack('workspace-1', 'personal', new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1500);
    expect((await denied).status).toBe('error');
    const controller = new AbortController();
    vi.mocked(slackIntegrationService.oauthResult).mockResolvedValue(null);
    const cancelled = authorizeSlack('workspace-1', 'workspace', controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect((await cancelled).status).toBe('cancelled');
    expect(vi.getTimerCount()).toBe(0);
  });
});
