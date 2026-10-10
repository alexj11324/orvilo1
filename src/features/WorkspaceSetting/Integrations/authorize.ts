import type { OAuthSessionResult } from '@/features/Connectors/oauthSession';
import { newOAuthAttempt, waitForOAuthSession } from '@/features/Connectors/oauthSession';
import { getHostContext } from '@/platform';
import { electronSystemService } from '@/services/electron/system';
import type { SlackOAuthMode } from '@/services/slackIntegration';
import { slackIntegrationService } from '@/services/slackIntegration';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';

export const authorizeSlack = async (
  workspaceId: string,
  mode: SlackOAuthMode,
  signal: AbortSignal,
): Promise<OAuthSessionResult> => {
  if (signal.aborted) return { status: 'cancelled' };
  const desktopHost = getHostContext().kind === 'desktop';
  // Reserve the Web popup during the user's click, before any awaited request.
  const popup = desktopHost
    ? undefined
    : window.open('about:blank', 'orvilo-slack-oauth', 'width=600,height=720');
  if (!desktopHost && !popup) return { status: 'error', error: 'popup_blocked' };
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  let pollTimer: number | undefined;
  try {
    const attempt = newOAuthAttempt();
    const { authorizationUrl } = await slackIntegrationService.startOAuth(
      workspaceId,
      mode,
      attempt,
    );
    if (signal.aborted) return { status: 'cancelled' };
    const url = new URL(authorizationUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'slack.com')
      throw new Error('Invalid Slack authorization URL');
    const expectedOrigin = desktopHost
      ? new URL(electronSyncSelectors.remoteServerUrl(useElectronStore.getState())).origin
      : window.location.origin;
    const session = waitForOAuthSession({
      attempt,
      expectedOrigin,
      messageType: 'orvilo-slack-oauth',
      popup,
      signal: controller.signal,
      checkStatus: async () =>
        (await slackIntegrationService.oauthResult(workspaceId, attempt))?.success === true,
    });
    let querying = false;
    const polled = new Promise<OAuthSessionResult>((resolve, reject) => {
      pollTimer = window.setInterval(async () => {
        if (querying || controller.signal.aborted) return;
        querying = true;
        try {
          const result = await slackIntegrationService.oauthResult(workspaceId, attempt);
          if (!controller.signal.aborted && result)
            resolve(
              result.success ? { status: 'success' } : { status: 'error', error: result.error },
            );
        } catch (error) {
          reject(error);
        } finally {
          querying = false;
        }
      }, 1500);
    });
    if (desktopHost) await electronSystemService.openExternalLink(authorizationUrl);
    else if (popup) popup.location.href = authorizationUrl;
    return await Promise.race([session, polled]);
  } finally {
    controller.abort();
    if (pollTimer !== undefined) window.clearInterval(pollTimer);
    signal.removeEventListener('abort', abort);
    popup?.close();
  }
};
