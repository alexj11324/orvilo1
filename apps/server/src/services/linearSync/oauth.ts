import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { isRecord } from '@orvilo/utils';

import { appEnv } from '@/envs/app';
import { linearEnv } from '@/envs/linear';

export const LINEAR_OAUTH_AUTHORIZE_URL = 'https://linear.app/oauth/authorize';
export const LINEAR_OAUTH_TOKEN_URL = 'https://api.linear.app/oauth/token';
export const LINEAR_OAUTH_REVOKE_URL = 'https://api.linear.app/oauth/revoke';
export const LINEAR_GRAPHQL_URL =
  process.env.LINEAR_GRAPHQL_URL ?? 'https://api.linear.app/graphql';
export const LINEAR_OAUTH_CALLBACK_PATH = '/oauth/linear/callback';

export const LINEAR_OAUTH_DEFAULT_SCOPES = ['read', 'write'] as const;

const ALLOWED_LINEAR_SCOPES = new Set([
  'app:assignable',
  'app:mentionable',
  'customer:read',
  'customer:write',
  'initiative:read',
  'initiative:write',
  'read',
  'write',
]);

export class LinearOAuthError extends Error {
  readonly status?: number;
  readonly errorCode?: string;

  constructor(message: string, options: { errorCode?: string; status?: number } = {}) {
    super(message);
    this.name = 'LinearOAuthError';
    this.errorCode = options.errorCode;
    this.status = options.status;
  }
}

export interface LinearOAuthConfig {
  clientId: string;
  clientSecret?: string;
  scopes: string[];
}

export const getLinearOAuthConfig = (): LinearOAuthConfig => {
  const clientId = linearEnv.LINEAR_OAUTH_CLIENT_ID;
  if (!clientId) throw new LinearOAuthError('Linear OAuth is not configured');

  const configured = linearEnv.LINEAR_OAUTH_SCOPES?.split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const scopes = [...new Set(configured?.length ? configured : LINEAR_OAUTH_DEFAULT_SCOPES)];

  if (scopes.some((scope) => !ALLOWED_LINEAR_SCOPES.has(scope))) {
    throw new LinearOAuthError('Linear OAuth scopes contain an unsupported scope');
  }
  if (scopes.includes('admin')) {
    throw new LinearOAuthError('Linear actor=app installations cannot request admin scope');
  }
  if (!scopes.includes('read') || !scopes.includes('write')) {
    throw new LinearOAuthError('Linear sync requires read and write scopes');
  }

  return { clientId, clientSecret: linearEnv.LINEAR_OAUTH_CLIENT_SECRET, scopes };
};

export const getLinearOAuthRedirectUri = (): string => {
  if (!appEnv.APP_URL) throw new LinearOAuthError('APP_URL is required for Linear OAuth');
  return new URL(LINEAR_OAUTH_CALLBACK_PATH, appEnv.APP_URL).toString();
};

export const generateLinearOAuthState = (): string => randomUUID().replaceAll('-', '');

export const createLinearPkcePair = () => {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { challenge, verifier };
};

export const buildLinearAuthorizationUrl = (input: {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}): string => {
  const url = new URL(LINEAR_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('actor', 'app');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', input.scopes.join(','));
  url.searchParams.set('state', input.state);
  return url.toString();
};

export interface LinearOAuthTokens {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string | string[];
  token_type?: string;
}

const parseScope = (scope: unknown): string[] => {
  if (Array.isArray(scope)) return scope.filter((item): item is string => typeof item === 'string');
  if (typeof scope === 'string') return scope.split(/[\s,]+/).filter(Boolean);
  return [];
};

export const normalizeLinearScopes = (scope: unknown, fallback: string[] = []): string[] => [
  ...new Set(parseScope(scope).length > 0 ? parseScope(scope) : fallback),
];

const parseTokenResponse = async (response: Response): Promise<LinearOAuthTokens> => {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LinearOAuthError('Linear OAuth returned an invalid token response', {
      status: response.status,
    });
  }

  const record = isRecord(body) ? body : {};
  if (!response.ok || typeof record.access_token !== 'string') {
    throw new LinearOAuthError(
      typeof record.error_description === 'string'
        ? record.error_description
        : 'Linear OAuth token exchange failed',
      {
        errorCode: typeof record.error === 'string' ? record.error : undefined,
        status: response.status,
      },
    );
  }

  return {
    access_token: record.access_token,
    expires_in: typeof record.expires_in === 'number' ? record.expires_in : undefined,
    refresh_token: typeof record.refresh_token === 'string' ? record.refresh_token : undefined,
    scope:
      typeof record.scope === 'string' || Array.isArray(record.scope) ? record.scope : undefined,
    token_type: typeof record.token_type === 'string' ? record.token_type : undefined,
  };
};

const postTokenForm = async (
  form: URLSearchParams,
  fetcher: typeof fetch,
): Promise<LinearOAuthTokens> => {
  const response = await fetcher(LINEAR_OAUTH_TOKEN_URL, {
    body: form,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  });
  return parseTokenResponse(response);
};

export const exchangeLinearAuthorizationCode = async (input: {
  clientId: string;
  clientSecret?: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetcher?: typeof fetch;
}): Promise<LinearOAuthTokens> => {
  const form = new URLSearchParams({
    client_id: input.clientId,
    code: input.code,
    code_verifier: input.codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
  });
  if (input.clientSecret) form.set('client_secret', input.clientSecret);
  return postTokenForm(form, input.fetcher ?? fetch);
};

export const refreshLinearAccessToken = async (input: {
  clientId: string;
  clientSecret?: string;
  fetcher?: typeof fetch;
  refreshToken: string;
}): Promise<LinearOAuthTokens> => {
  const form = new URLSearchParams({
    client_id: input.clientId,
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
  });
  if (input.clientSecret) form.set('client_secret', input.clientSecret);
  return postTokenForm(form, input.fetcher ?? fetch);
};

export const revokeLinearToken = async (input: {
  clientId: string;
  clientSecret?: string;
  fetcher?: typeof fetch;
  token: string;
  tokenTypeHint?: 'access_token' | 'refresh_token';
}): Promise<void> => {
  const form = new URLSearchParams({
    client_id: input.clientId,
    token: input.token,
  });
  if (input.clientSecret) form.set('client_secret', input.clientSecret);
  if (input.tokenTypeHint) form.set('token_type_hint', input.tokenTypeHint);

  const response = await (input.fetcher ?? fetch)(LINEAR_OAUTH_REVOKE_URL, {
    body: form,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  });
  if (!response.ok && response.status !== 400 && response.status !== 401) {
    throw new LinearOAuthError('Linear OAuth token revocation failed', { status: response.status });
  }
};

export interface LinearOAuthInstallationIdentity {
  appActorId: string;
  appActorName: string;
  organizationId: string;
  organizationName: string;
}

export const validateLinearOAuthInstallation = async (input: {
  accessToken: string;
  clientId: string;
  fetcher?: typeof fetch;
}): Promise<LinearOAuthInstallationIdentity> => {
  const response = await (input.fetcher ?? fetch)(LINEAR_GRAPHQL_URL, {
    body: JSON.stringify({
      query: `query ValidateLinearInstallation {
        viewer { id name oauthClientId }
        organization { id name }
      }`,
    }),
    headers: {
      'authorization': `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LinearOAuthError('Linear API returned an invalid installation response', {
      status: response.status,
    });
  }
  const record = isRecord(body) ? body : {};
  const errors = Array.isArray(record.errors) ? record.errors : [];
  if (!response.ok || errors.length > 0 || !isRecord(record.data)) {
    const first = isRecord(errors[0]) ? errors[0].message : undefined;
    throw new LinearOAuthError(
      typeof first === 'string' ? first : 'Linear OAuth installation validation failed',
      { status: response.status },
    );
  }

  const data = record.data;
  const viewer = isRecord(data.viewer) ? data.viewer : undefined;
  const organization = isRecord(data.organization) ? data.organization : undefined;
  const appActorId = viewer && typeof viewer.id === 'string' ? viewer.id : null;
  const appActorName = viewer && typeof viewer.name === 'string' ? viewer.name : null;
  const returnedClientId =
    viewer && typeof viewer.oauthClientId === 'string' ? viewer.oauthClientId : null;
  const organizationId =
    organization && typeof organization.id === 'string' ? organization.id : null;
  const organizationName =
    organization && typeof organization.name === 'string' ? organization.name : null;

  if (!appActorId || !appActorName || returnedClientId !== input.clientId) {
    throw new LinearOAuthError('Linear OAuth token is not an app actor for this OAuth client');
  }
  if (!organizationId || !organizationName) {
    throw new LinearOAuthError('Linear OAuth token did not resolve an organization');
  }

  return { appActorId, appActorName, organizationId, organizationName };
};
