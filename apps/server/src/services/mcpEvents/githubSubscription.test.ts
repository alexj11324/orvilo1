// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGithubEventBinding } from './githubSubscription';

const mocks = vi.hoisted(() => ({ grant: vi.fn(), verify: vi.fn(), encrypt: vi.fn() }));
vi.mock('@/server/services/githubOAuth', () => ({ getValidGitHubAccessGrant: mocks.grant }));
vi.mock('@/server/services/githubRepo', () => ({ verifyGithubRepository: mocks.verify }));
vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: { initWithEnvKey: async () => ({ encrypt: mocks.encrypt }) },
}));

const request = () => ({
  arguments: { repository: 'owner/repository' },
  callbackUrl: (token: string) => `https://orvilo.example/api/webhooks/github-events/${token}`,
  connector: {
    id: 'source',
    agentId: null,
    isEnabled: true,
    status: 'connected',
    metadata: {
      githubMcp: { type: 'github_user_connection' as const, grantOwnerUserId: 'grant-owner' },
    },
  },
  db: {} as Parameters<typeof createGithubEventBinding>[0]['db'],
  eventName: 'github.pull_request',
  repository: { createPending: vi.fn() } as unknown as Parameters<
    typeof createGithubEventBinding
  >[0]['repository'],
  tenantId: 'workspace',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.grant.mockResolvedValue({
    githubUserId: '123',
    grantRevision: 'grant-revision',
    accessToken: 'test-access-token',
  });
  mocks.verify.mockResolvedValue({
    remoteRepositoryId: '456',
    coordinate: { owner: 'Owner', name: 'Repository' },
  });
  mocks.encrypt.mockResolvedValue('encrypted-signing-secret');
});

describe('native GitHub event binding', () => {
  it('pins verified repository and grant identity, encrypting the secret before durable save', async () => {
    const input = request();
    const binding = await createGithubEventBinding(input);
    expect(binding).toMatchObject({
      state: 'pending',
      sourceType: 'github',
      signingKeys: [],
      remoteSubscriptionId: null,
      tenantId: 'workspace',
      connectorId: 'source',
      github: {
        repositoryId: '456',
        repositoryFullName: 'Owner/Repository',
        githubUserId: '123',
        grantRevision: 'grant-revision',
        encryptedSecret: 'encrypted-signing-secret',
      },
    });
    const plaintext = mocks.encrypt.mock.calls[0][0];
    expect(plaintext).toMatch(/^[a-f\d]{64}$/);
    expect(JSON.stringify(binding)).not.toContain(plaintext);
    expect(input.repository.createPending).toHaveBeenCalledWith(binding);
  });

  it.each([
    'http://localhost/callback',
    'https://user:pass@example.com',
    'https://example.com?key=x',
  ])('refuses an invalid callback %s before persisting', async (url) => {
    const input = request();
    input.callbackUrl = () => url;
    await expect(createGithubEventBinding(input)).rejects.toThrow('GitHub callback requires HTTPS');
    expect(input.repository.createPending).not.toHaveBeenCalled();
  });

  it.each(['grant', 'verify'] as const)(
    'does not mint a binding without verified %s',
    async (boundary) => {
      mocks[boundary].mockResolvedValue(null);
      const input = request();
      await expect(createGithubEventBinding(input)).rejects.toThrow();
      expect(input.repository.createPending).not.toHaveBeenCalled();
    },
  );

  it('refuses unknown events, extra arguments, and disabled sources', async () => {
    for (const patch of [
      { eventName: 'github.push' },
      { arguments: { repository: 'owner/repository', token: 'test-only' } },
      { connector: { ...request().connector, isEnabled: false } },
    ]) {
      const input = { ...request(), ...patch };
      await expect(createGithubEventBinding(input)).rejects.toThrow();
      expect(input.repository.createPending).not.toHaveBeenCalled();
    }
  });
});
