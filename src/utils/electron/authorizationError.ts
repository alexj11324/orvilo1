import type { AuthorizationErrorCode } from '@orvilo/electron-client-ipc';

/**
 * Copy for each desktop authorization failure, in the `desktop-onboarding`
 * namespace. Failures are classified by the code the main process sends, never
 * by the text of its message.
 */
export const AUTHORIZATION_ERROR_I18N_KEY = {
  denied: 'screen5.errors.denied',
  invalid_url: 'screen5.errors.invalidUrl',
  network: 'screen5.errors.network',
  server_error: 'screen5.errors.serverError',
  timeout: 'screen5.errors.timedOut',
} as const satisfies Record<AuthorizationErrorCode, string>;

/**
 * The authorization code carried by an `authorizationFailed` payload, a failed
 * `requestAuthorization` result, or the Error `connectRemoteServer` rejects
 * with. `undefined` when the value carries no known code.
 */
export const readAuthorizationErrorCode = (source: unknown): AuthorizationErrorCode | undefined => {
  if (typeof source !== 'object' || source === null) return undefined;
  const { code } = source as { code?: unknown };
  return typeof code === 'string' && Object.hasOwn(AUTHORIZATION_ERROR_I18N_KEY, code)
    ? (code as AuthorizationErrorCode)
    : undefined;
};
