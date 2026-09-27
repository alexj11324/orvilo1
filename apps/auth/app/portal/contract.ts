export const AUTH_CONTRACT = {
  authority: {
    brokerPersistence: 'none',
    identity: 'clerk',
    oneTimeGrant: 'go-api',
    orviloSession: 'go-api',
  },
  broker: {
    contractPath: '/v1/contract',
    desktopAttemptPath: '/v1/desktop/google/attempt',
    desktopCompletePath: '/v1/desktop/google/complete',
    desktopCompletionPath: '/login',
    googleCallbackPath: '/oauth/google/callback',
    googleStartPath: '/oauth/google',
  },
  client: {
    clerkExchangePath: '/auth/clerk',
    guestPath: '/auth/guest',
    guestTokenPrefix: 'ovg_',
    guestWebsocketAccess: false,
    guestWorkspaceAccess: false,
    logoutPath: '/auth/logout',
    mePath: '/api/me',
    websocketPath: '/ws',
  },
  desktop: {
    bearerAllowedInCallback: false,
    callbackUrl: 'orvilo://auth/callback',
    pkceMethod: 'S256',
    queryParameters: ['code', 'state'],
  },
  goApi: {
    desktopAttemptPath: '/api/desktop-google/attempt',
    desktopCompletePath: '/api/desktop-google/complete',
    desktopIdentityRedeemPath: '/api/desktop-identity/redeem',
    desktopRedeemPath: '/api/desktop-handoff/redeem',
  },
  name: 'orvilo-auth-broker',
  origins: {
    api: 'https://api.aspectlylabs.com',
    broker: 'https://accounts.aspectlylabs.com',
    product: 'https://orvilo.aspectlylabs.com',
  },
  version: 1,
} as const;

export const AUTH_CONTRACT_VERSION = AUTH_CONTRACT.version;
export const AUTH_CONTRACT_HEADER = 'x-orvilo-auth-contract-version';

export const authContractResponseHeaders = (): HeadersInit => ({
  [AUTH_CONTRACT_HEADER]: String(AUTH_CONTRACT_VERSION),
  'cache-control': 'no-store',
});
