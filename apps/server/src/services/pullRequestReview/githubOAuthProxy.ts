import type { GitHubMarketClient } from '@orvilo/connector-data/github';

export class GitHubAuthorizationExpiredError extends Error {
  constructor() {
    super('GitHub authorization expired. Connect GitHub again in Reviews.');
    this.name = 'GitHubAuthorizationExpiredError';
  }
}

/** The review service's existing REST/GraphQL adapter accepts this proxy shape. */
export const createGitHubOAuthProxy = (accessToken: string): GitHubMarketClient => ({
  proxyOAuthRequest: async ({ body, endpoint, method, parameters, provider }) => {
    if (provider !== 'github' || !endpoint.startsWith('/') || endpoint.startsWith('//')) {
      throw new Error('Invalid GitHub API endpoint');
    }

    const url = new URL(endpoint, 'https://api.github.com');
    if (url.origin !== 'https://api.github.com') {
      throw new Error('Invalid GitHub API origin');
    }
    for (const parameter of parameters ?? []) {
      if (parameter.in === 'query') url.searchParams.set(parameter.name, String(parameter.value));
    }

    const response = await fetch(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        'X-GitHub-Api-Version': '2022-11-28',
      },
      method,
    });

    if (response.status === 401) throw new GitHubAuthorizationExpiredError();

    return { data: await response.json(), status: response.status };
  },
});
