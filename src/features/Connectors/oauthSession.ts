/**
 * Unified OAuth authorization-session helper.
 *
 * One attempt = one terminal outcome. The helper correlates the popup's
 * postMessage back to the attempt that opened it (attempt nonce echoed by the
 * server callback), enforces a hard deadline, supports cancellation via
 * AbortSignal, and settles exactly once while releasing every listener/timer
 * it installed.
 */
export type OAuthSessionStatus = 'cancelled' | 'dismissed' | 'error' | 'success' | 'timed-out';

export interface OAuthSessionResult {
  /** Provider/exchange error reason when status === 'error'. */
  error?: string;
  /** Provider-returned installation id (Linear workspace install flow). */
  installationId?: string;
  status: OAuthSessionStatus;
  /** Whether the tool list synced. `false` = authorized but tools unavailable. */
  synced?: boolean;
}

export interface OAuthSessionOptions {
  /** Per-attempt nonce minted by the caller and echoed by the server callback. */
  attempt: string;
  /**
   * Re-check the authoritative server state when the result message is lost
   * (deadline hit or popup closed early). Return true when the authorization
   * actually completed — the session then settles as 'success' instead of
   * failing on a dropped postMessage.
   */
  checkStatus?: () => Promise<boolean>;
  /** Expected connectorId; a message carrying a different id is ignored. */
  connectorId?: string;
  /**
   * Origin the result page posts from. Defaults to this window's origin; pass
   * the callback's origin when the authorization completes on a different
   * app origin (e.g. the remote server a desktop window opened).
   */
  expectedOrigin?: string;
  /** Message discriminator posted by the callback page. */
  messageType: string;
  /**
   * The authorization window. When provided, only messages whose
   * `event.source` is this window are considered, and its `closed` flag feeds
   * the dismissed check. Omit when the provider opened in an external browser
   * we cannot reference.
   */
  popup?: Window | null;
  /** Cancel the session: closes the popup and settles 'cancelled'. */
  signal?: AbortSignal;
  /** Hard deadline in ms before the session converges to 'timed-out'. */
  timeoutMs?: number;
}

export const OAUTH_SESSION_TIMEOUT_MS = 120_000;

export const newOAuthAttempt = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `oauth-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const waitForOAuthSession = (options: OAuthSessionOptions): Promise<OAuthSessionResult> =>
  new Promise((resolve) => {
    const { popup } = options;
    let settled = false;
    let closeTimer: number | undefined;
    let deadlineTimer: number | undefined;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (closeTimer !== undefined) window.clearInterval(closeTimer);
      if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer);
      options.signal?.removeEventListener('abort', onAbort);
    };

    const finish = (result: OAuthSessionResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    // Message loss is recoverable: ask the server before declaring failure.
    const settleViaCheckStatus = async (status: 'dismissed' | 'timed-out') => {
      if (settled) return;
      if (options.checkStatus) {
        try {
          if (await options.checkStatus()) {
            finish({ status: 'success' });
            return;
          }
        } catch {
          // checkStatus errors must not mask the terminal state.
        }
      }
      finish({ status });
    };

    const onMessage = (event: MessageEvent) => {
      if (settled) return;
      if (event.origin !== (options.expectedOrigin ?? window.location.origin)) return;
      // When we hold the popup reference, only its own postMessage counts.
      if (popup && event.source !== popup) return;
      const data = event.data;
      if (!data || data.type !== options.messageType) return;
      // Attempt correlation is mandatory — a result that cannot be tied back
      // to this attempt (stale attempt, or a message with no attempt at all)
      // must never settle the session.
      if (data.attempt !== options.attempt) return;
      if (options.connectorId && data.connectorId && data.connectorId !== options.connectorId)
        return;
      if (data.success) {
        finish({
          installationId: typeof data.installationId === 'string' ? data.installationId : undefined,
          status: 'success',
          synced: data.synced === false ? false : true,
        });
      } else {
        finish({
          error: typeof data.error === 'string' ? data.error : 'oauth_failed',
          status: 'error',
        });
      }
    };

    const onAbort = () => {
      try {
        popup?.close();
      } catch {
        // The callback page closes itself; a cross-origin popup may refuse.
      }
      finish({ status: 'cancelled' });
    };

    window.addEventListener('message', onMessage);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (popup) {
      closeTimer = window.setInterval(() => {
        if (popup.closed) void settleViaCheckStatus('dismissed');
      }, 800);
    }
    deadlineTimer = window.setTimeout(() => {
      deadlineTimer = undefined;
      void settleViaCheckStatus('timed-out');
    }, options.timeoutMs ?? OAUTH_SESSION_TIMEOUT_MS);
  });
