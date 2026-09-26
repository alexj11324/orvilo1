export interface OAuthPopupResult {
  error?: string;
  status: 'success' | 'error' | 'dismissed';
  synced?: boolean;
}

/** Wait for the connector callback to report the result to an already-opened popup. */
export const waitForOAuthPopup = (popup: Window, connectorId: string): Promise<OAuthPopupResult> =>
  new Promise((resolve) => {
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== 'orvilo-connector-oauth') return;
      if (data.connectorId && data.connectorId !== connectorId) return;
      cleanup();
      resolve(
        data.success
          ? { status: 'success', synced: data.synced }
          : { error: data.error, status: 'error' },
      );
    };

    window.addEventListener('message', onMessage);

    const timer = setInterval(() => {
      if (popup.closed) {
        cleanup();
        resolve({ status: 'dismissed' });
      }
    }, 800);
  });
