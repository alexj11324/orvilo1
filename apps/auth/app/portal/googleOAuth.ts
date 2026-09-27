export type GoogleSsoParams = {
  oidcPrompt: 'select_account';
  redirectCallbackUrl: string;
  redirectUrl: string;
  strategy: 'oauth_google';
};

type Attempt = {
  existingSession?: { sessionId?: string } | null;
  isTransferable?: boolean;
  status?: string | null;
};

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

export const readGoogleSso = (
  signIn: unknown,
): ((params: GoogleSsoParams) => Promise<{ error: unknown }>) | null => {
  const value = record(signIn);
  if (!value) return null;
  if (typeof value.sso === 'function')
    return value.sso.bind(value) as (params: GoogleSsoParams) => Promise<{ error: unknown }>;
  const future = record(value.__internal_future);
  return future && typeof future.sso === 'function'
    ? (future.sso.bind(future) as (params: GoogleSsoParams) => Promise<{ error: unknown }>)
    : null;
};

export const startGoogleOAuth = async (signIn: unknown, origin: string, query: string) => {
  const sso = readGoogleSso(signIn);
  if (!sso) throw new Error('Google sign-in is unavailable');
  return sso({
    oidcPrompt: 'select_account',
    redirectCallbackUrl: new URL(`/oauth/google/callback?${query}`, origin).href,
    redirectUrl: new URL(`/login?${query}`, origin).href,
    strategy: 'oauth_google',
  });
};

export const hasClerkOAuthReturn = (
  params: { has: (name: string) => boolean },
  hash: string,
): boolean =>
  params.has('rotating_token_nonce') ||
  params.has('__clerk_status') ||
  params.has('__clerk_ticket') ||
  /__clerk/i.test(hash);

export const googleOAuthAttemptIsReady = (
  signIn: Attempt | null | undefined,
  signUp: Attempt | null | undefined,
): boolean =>
  Boolean(
    signIn &&
    signUp &&
    (signIn.status === 'complete' ||
      signUp.status === 'complete' ||
      signIn.isTransferable ||
      signUp.isTransferable ||
      signIn.existingSession?.sessionId ||
      signUp.existingSession?.sessionId ||
      signIn.status),
  );

export const consumeGoogleOAuthNonce = async (
  signIn: unknown,
  nonce: string | null,
): Promise<boolean> => {
  if (!nonce) return true;
  const value = record(signIn);
  const future = value ? record(value.__internal_future) : null;
  const reload =
    typeof value?.reload === 'function'
      ? value.reload.bind(value)
      : typeof future?.reload === 'function'
        ? future.reload.bind(future)
        : null;
  if (!reload) return false;
  await (reload as (input: { rotatingTokenNonce: string }) => Promise<unknown>)({
    rotatingTokenNonce: nonce,
  });
  return true;
};
