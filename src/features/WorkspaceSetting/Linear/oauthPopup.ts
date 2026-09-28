export type LinearOAuthPopupResult =
  | { kind: 'cancelled' }
  | { error?: string; kind: 'error' }
  | { installationId: string; kind: 'success' };

type LinearOAuthMessage = {
  error?: unknown;
  installationId?: unknown;
  success?: unknown;
  type?: unknown;
};

const isLinearOAuthMessage = (value: unknown): value is LinearOAuthMessage =>
  typeof value === 'object' &&
  value !== null &&
  (value as LinearOAuthMessage).type === 'orvilo-linear-oauth';

/** Wait for the callback result, keeping popup ownership and origin checks explicit. */
export const waitForLinearOAuthPopup = (
  popup: Window,
  expectedOrigin: string,
): Promise<LinearOAuthPopupResult> =>
  new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      window.clearInterval(timer);
      window.removeEventListener('message', onMessage);
    };

    const finish = (result: LinearOAuthPopupResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== expectedOrigin || event.source !== popup) return;
      if (!isLinearOAuthMessage(event.data)) return;

      if (event.data.success === true && typeof event.data.installationId === 'string') {
        finish({ installationId: event.data.installationId, kind: 'success' });
        return;
      }

      finish({
        error: typeof event.data.error === 'string' ? event.data.error : undefined,
        kind: 'error',
      });
    };

    window.addEventListener('message', onMessage);
    const timer = window.setInterval(() => {
      if (popup.closed) finish({ kind: 'cancelled' });
    }, 500);
  });
