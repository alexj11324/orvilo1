import { createHash, randomBytes } from 'node:crypto';

import { appEnv } from '@/envs/app';
import { githubAppEnv } from '@/envs/githubApp';

export const GITHUB_CALLBACK_PATH = '/oauth/github/callback';

export const getConfig = () => {
  const clientId = githubAppEnv.GITHUB_APP_CLIENT_ID;
  const clientSecret = githubAppEnv.GITHUB_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret || !appEnv.APP_URL) {
    throw new Error('GitHub App OAuth is not configured');
  }
  return {
    clientId,
    clientSecret,
    redirectUri: new URL(GITHUB_CALLBACK_PATH, appEnv.APP_URL).toString(),
  };
};

export const createPkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
};

export interface GitHubTokens {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

export class GitHubOAuthTokenError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super('GitHub token exchange failed');
    this.name = 'GitHubOAuthTokenError';
  }
}

const tokenRequest = async (params: URLSearchParams): Promise<GitHubTokens> => {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const raw: unknown = await response.json();
  if (
    !response.ok ||
    !raw ||
    typeof raw !== 'object' ||
    !('access_token' in raw) ||
    typeof raw.access_token !== 'string' ||
    !raw.access_token
  ) {
    const code =
      raw && typeof raw === 'object' && 'error' in raw && typeof raw.error === 'string'
        ? raw.error
        : undefined;
    throw new GitHubOAuthTokenError(response.status, code);
  }
  const tokens = raw as Record<string, unknown>;
  return {
    access_token: tokens.access_token as string,
    expires_in: typeof tokens.expires_in === 'number' ? tokens.expires_in : undefined,
    refresh_token: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : undefined,
    refresh_token_expires_in:
      typeof tokens.refresh_token_expires_in === 'number'
        ? tokens.refresh_token_expires_in
        : undefined,
  };
};

export const exchangeCode = async (input: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<GitHubTokens> => {
  const config = getConfig();
  return tokenRequest(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
    }),
  );
};

export const refreshToken = async (refresh: string): Promise<GitHubTokens> => {
  const config = getConfig();
  return tokenRequest(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  );
};

export const getGitHubUser = async (
  accessToken: string,
): Promise<{
  id: string;
  login: string;
  avatarUrl: string | null;
}> => {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'accept': 'application/vnd.github+json',
      'authorization': `Bearer ${accessToken}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  const raw: unknown = await response.json();
  if (
    !response.ok ||
    !raw ||
    typeof raw !== 'object' ||
    !('id' in raw) ||
    !('login' in raw) ||
    typeof raw.id !== 'number' ||
    typeof raw.login !== 'string' ||
    !raw.login
  ) {
    throw new Error('GitHub user verification failed');
  }
  return {
    id: String(raw.id),
    login: raw.login,
    avatarUrl: 'avatar_url' in raw && typeof raw.avatar_url === 'string' ? raw.avatar_url : null,
  };
};
