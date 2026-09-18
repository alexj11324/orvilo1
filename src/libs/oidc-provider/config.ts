import { type ClientMetadata } from 'oidc-provider';
import urlJoin from 'url-join';

import { appEnv } from '@/envs/app';

const cloudAppOrigins = ['https://orvilo.aspectlylabs.com'];
const appUrl = appEnv.APP_URL!;
const desktopAppOrigins = cloudAppOrigins.includes(new URL(appUrl).origin)
  ? cloudAppOrigins
  : [appUrl];
const marketBaseUrl = new URL(appEnv.MARKET_BASE_URL ?? 'https://market.aspectlylabs.com').origin;

/**
 * Default OIDC client configuration
 */
export const defaultClients: ClientMetadata[] = [
  {
    application_type: 'web',
    client_id: 'orvilo-desktop',
    client_name: 'Orvilo Desktop',
    // Only supports authorization code flow
    grant_types: ['authorization_code', 'refresh_token'],

    logo_uri: 'https://hub-apac-1.objects.aspectlylabs.com/orvilo-desktop-icon.png',

    post_logout_redirect_uris: [
      // Keep the legacy subdomain working while Cloud moves to the apex domain.
      ...desktopAppOrigins.map((origin) => urlJoin(origin, '/oauth/logout')),
      'http://localhost:3210/oauth/logout',
    ],

    // Desktop authorization callback - changed to web page path
    redirect_uris: [
      ...desktopAppOrigins.map((origin) => urlJoin(origin, '/oidc/callback/desktop')),
      'http://localhost:3210/oidc/callback/desktop',
    ],

    // Supports authorization code for obtaining tokens and refresh tokens
    response_types: ['code'],

    // Marked as public client with no secret
    token_endpoint_auth_method: 'none',
  },

  {
    application_type: 'native', // Mobile uses native type
    client_id: 'orvilo-mobile',
    client_name: 'Orvilo Mobile',
    // Supports authorization code flow and refresh token
    grant_types: ['authorization_code', 'refresh_token'],
    logo_uri: 'https://hub-apac-1.objects.aspectlylabs.com/docs/73f69adfa1b802a0e250f6ff9d62f70b.png',
    // Mobile does not need post_logout_redirect_uris as logout is typically handled within the app
    post_logout_redirect_uris: [],
    // Mobile uses custom URL Scheme
    redirect_uris: ['com.orvilo.app://auth/callback'],
    response_types: ['code'],
    // Public client with no secret
    token_endpoint_auth_method: 'none',
  },
  {
    application_type: 'native',
    client_id: 'orvilo-cli',
    client_name: 'Orvilo CLI',
    grant_types: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
    logo_uri: 'https://hub-apac-1.objects.aspectlylabs.com/orvilo-desktop-icon.png',
    response_types: [],
    token_endpoint_auth_method: 'none',
  },
  {
    application_type: 'web',
    client_id: 'orvilo-market',
    client_name: 'Orvilo Marketplace',
    grant_types: ['authorization_code', 'refresh_token'],
    logo_uri: 'https://hub-apac-1.objects.aspectlylabs.com/orvilo-desktop-icon.png',
    post_logout_redirect_uris: [
      urlJoin(marketBaseUrl!, '/orvilo-oidc/logout'),
      'http://localhost:8787/orvilo-oidc/logout',
    ],
    redirect_uris: [
      urlJoin(marketBaseUrl!, '/orvilo-oidc/consent/callback'),
      'http://localhost:8787/orvilo-oidc/consent/callback',
    ],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  },
];

/**
 * OIDC Scopes definition
 */
export const defaultScopes = [
  'openid',
  'profile',
  'email',
  'offline_access', // Allows obtaining refresh_token
];

/**
 * OIDC Claims definition
 */
export const defaultClaims = {
  email: ['email', 'email_verified'],
  openid: ['sub'],
  // subject (unique user identifier)
  profile: ['name', 'picture'],
};
