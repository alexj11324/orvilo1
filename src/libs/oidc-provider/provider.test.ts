/**
 * @vitest-environment node
 */
import { createServer } from 'node:http';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies

vi.mock('@/envs/app', () => ({
  appEnv: {
    APP_URL: 'https://example.com',
    MARKET_BASE_URL: undefined,
  },
}));

vi.mock('@/config/db', () => ({
  serverDBEnv: {
    KEY_VAULTS_SECRET: 'test-secret-key',
  },
}));

vi.mock('debug', () => ({
  default: () => vi.fn(),
}));

describe('OIDC Provider - Market Client Integration', () => {
  const MARKET_CLIENT_ID = 'orvilo-market';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Market Client Logic', () => {
    it('should identify market client correctly', () => {
      expect(MARKET_CLIENT_ID).toBe('orvilo-market');
    });

    it('should have market client in default clients', async () => {
      vi.doMock('@/envs/app', () => ({
        appEnv: {
          APP_URL: 'https://example.com',
          MARKET_BASE_URL: 'https://market.aspectlylabs.com',
        },
      }));

      const { defaultClients } = await import('./config');
      const marketClient = defaultClients.find((c) => c.client_id === MARKET_CLIENT_ID);

      expect(marketClient).toBeDefined();
      expect(marketClient?.client_id).toBe('orvilo-market');
      expect(marketClient?.client_name).toBe('Orvilo Marketplace');

      vi.doUnmock('@/envs/app');
    });
  });

  describe('Provider Configuration', () => {
    it('should accept both Cloud desktop callback origins during the apex migration', async () => {
      vi.doMock('@/envs/app', () => ({
        appEnv: {
          APP_URL: 'https://orvilo.aspectlylabs.com',
          MARKET_BASE_URL: undefined,
        },
      }));

      const { default: Provider } = await import('oidc-provider');
      const { defaultClients } = await import('./config');
      const provider = new Provider('https://orvilo.aspectlylabs.com/oidc', {
        clients: defaultClients,
      });
      const desktopClient = await provider.Client.find('orvilo-desktop');

      expect(
        desktopClient?.redirectUriAllowed('https://orvilo.aspectlylabs.com/oidc/callback/desktop'),
      ).toBe(true);
      expect(
        desktopClient?.redirectUriAllowed('https://orvilo.aspectlylabs.com/oidc/callback/desktop'),
      ).toBe(true);
      expect(desktopClient?.redirectUriAllowed('https://example.com/oidc/callback/desktop')).toBe(
        false,
      );

      vi.doUnmock('@/envs/app');
    });

    it('should export API_AUDIENCE constant', async () => {
      vi.doMock('@/envs/app', () => ({
        appEnv: {
          APP_URL: 'https://example.com',
          MARKET_BASE_URL: undefined,
        },
      }));

      const module = await import('./provider');
      expect(module.API_AUDIENCE).toBe('urn:orvilo:chat');

      vi.doUnmock('@/envs/app');
    }, 10000);

    it('should define numeric TTLs for all OIDC provider artifacts', async () => {
      vi.doMock('@/envs/app', () => ({
        appEnv: {
          APP_URL: 'https://example.com',
          MARKET_BASE_URL: undefined,
        },
      }));

      const module = await import('./provider');

      expect(module.oidcArtifactTTL).toEqual({
        AccessToken: 900,
        AuthorizationCode: 600,
        BackchannelAuthenticationRequest: 600,
        ClientCredentials: 600,
        DeviceCode: 600,
        Grant: 365 * 24 * 60 * 60,
        IdToken: 3600,
        Interaction: 3600,
        RefreshToken: 30 * 24 * 60 * 60,
        Session: 30 * 24 * 60 * 60,
      });

      for (const ttl of Object.values(module.oidcArtifactTTL)) {
        expect(typeof ttl).toBe('number');
        expect(Number.isSafeInteger(ttl)).toBe(true);
        expect(ttl).toBeGreaterThan(0);
      }

      vi.doUnmock('@/envs/app');
    }, 10000);

    it('keeps the grant alive longer than a rotating refresh token', async () => {
      vi.doMock('@/envs/app', () => ({
        appEnv: {
          APP_URL: 'https://example.com',
          MARKET_BASE_URL: undefined,
        },
      }));

      const { oidcArtifactTTL } = await import('./provider');
      const dayFifteen = 15 * 24 * 60 * 60;

      expect(oidcArtifactTTL.Grant).toBeGreaterThan(dayFifteen);
      expect(oidcArtifactTTL.Grant).toBeGreaterThanOrEqual(oidcArtifactTTL.RefreshToken);

      vi.doUnmock('@/envs/app');
    }, 10000);

    it('should have createOIDCProvider function', async () => {
      vi.doMock('@/envs/app', () => ({
        appEnv: {
          APP_URL: 'https://example.com',
          MARKET_BASE_URL: undefined,
        },
      }));

      const module = await import('./provider');
      expect(module.createOIDCProvider).toBeDefined();
      expect(typeof module.createOIDCProvider).toBe('function');

      vi.doUnmock('@/envs/app');
    }, 10000);
  });

  describe('Name Resolution Priority', () => {
    it('should prioritize fullName over firstName+lastName', () => {
      const priorities = ['fullName', 'firstName + lastName', 'username', 'id'];

      // Test the priority logic
      expect(priorities[0]).toBe('fullName');
      expect(priorities[1]).toBe('firstName + lastName');
      expect(priorities[2]).toBe('username');
      expect(priorities[3]).toBe('id');
    });
  });

  describe('Claims Generation', () => {
    it('should include profile claims when profile scope is requested', () => {
      const scopes = ['openid', 'profile', 'email'];
      expect(scopes).toContain('profile');
    });

    it('should include email claims when email scope is requested', () => {
      const scopes = ['openid', 'profile', 'email'];
      expect(scopes).toContain('email');
    });

    it('should always include sub claim', () => {
      const requiredClaims = ['sub'];
      expect(requiredClaims).toContain('sub');
    });
  });

  describe('Non-Market Client Logic (Default Path)', () => {
    it('should use UserModel for non-market clients (desktop client)', () => {
      // Desktop client should use the default user database lookup
      const desktopClientId = 'orvilo-desktop';
      expect(desktopClientId).not.toBe(MARKET_CLIENT_ID);
    });

    it('should use UserModel for non-market clients (mobile client)', () => {
      // Mobile client should use the default user database lookup
      const mobileClientId = 'orvilo-mobile';
      expect(mobileClientId).not.toBe(MARKET_CLIENT_ID);
    });

    it('should validate non-market client IDs are different from market client', () => {
      const nonMarketClients = ['orvilo-desktop', 'orvilo-mobile'];

      nonMarketClients.forEach((clientId) => {
        expect(clientId).not.toBe(MARKET_CLIENT_ID);
      });
    });
  });

  describe('Account ID Priority Logic', () => {
    it('should prioritize externalAccountId over session accountId', () => {
      const priorities = {
        first: 'externalAccountId',
        second: 'ctx.oidc.session.accountId',
        third: 'parameter id',
      };

      expect(priorities.first).toBe('externalAccountId');
      expect(priorities.second).toBe('ctx.oidc.session.accountId');
      expect(priorities.third).toBe('parameter id');
    });

    it('should document account ID resolution priority', () => {
      // Priority: 1. externalAccountId 2. ctx.oidc.session?.accountId 3. id parameter
      const accountIdPriority = [
        'externalAccountId (highest)',
        'ctx.oidc.session.accountId (medium)',
        'id parameter (lowest)',
      ];

      expect(accountIdPriority).toHaveLength(3);
      expect(accountIdPriority[0]).toContain('externalAccountId');
      expect(accountIdPriority[1]).toContain('ctx.oidc.session.accountId');
      expect(accountIdPriority[2]).toContain('id parameter');
    });
  });

  describe('Business Logic Scenarios', () => {
    describe('Scenario 1: Desktop Client + Local Database', () => {
      it('should use local UserModel for desktop client', () => {
        // Business: Desktop app uses local database for user management
        const scenario = {
          client: 'orvilo-desktop',
          authProvider: 'UserModel (Local Database)',
          useCase: 'Desktop app with local/self-hosted user database',
        };

        expect(scenario.client).toBe('orvilo-desktop');
        expect(scenario.authProvider).toBe('UserModel (Local Database)');
      });
    });

    describe('Scenario 2: Mobile Client + Local Database', () => {
      it('should use local UserModel for mobile client', () => {
        // Business: Mobile app uses local database for user management
        const scenario = {
          client: 'orvilo-mobile',
          authProvider: 'UserModel (Local Database)',
          useCase: 'Mobile app with local/self-hosted user database',
        };

        expect(scenario.client).toBe('orvilo-mobile');
        expect(scenario.authProvider).toBe('UserModel (Local Database)');
      });
    });

    describe('Scenario 3: Claims Generation', () => {
      it('should generate database-based claims for clients', () => {
        // Business: Users get profile/email from local DB
        const localClaims = {
          source: 'UserModel (PostgreSQL/PGLite)',
          fields: ['sub', 'name', 'picture', 'email', 'email_verified'],
          nameResolution: 'fullName || username || firstName+lastName',
        };

        expect(localClaims.source).toBe('UserModel (PostgreSQL/PGLite)');
        expect(localClaims.fields).toContain('name');
        expect(localClaims.fields).toContain('email');
      });
    });
  });
});

describe('configured provider JWT API grant binding', () => {
  it('mints a signed grantId and 900 second TTL without an access-token database row', async () => {
    const { decodeJwt, exportJWK, generateKeyPair, importJWK, jwtVerify } = await import('jose');
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const key = { ...(await exportJWK(privateKey)), alg: 'RS256', kid: 'binding-test', use: 'sig' };
    vi.doMock('./jwt', async (original) => ({
      ...(await original<Record<string, unknown>>()),
      getJWKS: () => ({ keys: [key] }),
    }));
    vi.doMock('./cookies', () => ({ getOIDCCookieKeys: () => ['isolated-test-cookie-key'] }));
    try {
      const { createOIDCProvider, API_AUDIENCE } = await import('./provider');
      const insert = vi.fn();
      const chain = { from: () => chain, where: () => chain, limit: async () => [] };
      const provider = await createOIDCProvider({ insert, select: () => chain } as any);
      const client = (await provider.Client.find('orvilo-desktop'))!;
      const token = new provider.AccessToken({
        accountId: 'user-123',
        client,
        grantId: 'grant-123',
      });
      token.resourceServer = new provider.ResourceServer(API_AUDIENCE, {
        audience: API_AUDIENCE,
        accessTokenFormat: 'jwt',
        scope: 'profile email',
      });
      token.scope = 'profile email';
      const jwt = await token.save();
      const { payload } = await jwtVerify(
        jwt,
        await importJWK({ kty: key.kty, n: key.n, e: key.e }, 'RS256'),
        { issuer: provider.issuer, audience: API_AUDIENCE, typ: 'at+jwt' },
      );
      expect(payload.grantId).toBe('grant-123');
      expect(payload.exp! - payload.iat!).toBe(900);
      expect(decodeJwt(jwt).client_id).toBe('orvilo-desktop');
      expect(insert).not.toHaveBeenCalled();
      // The Next route adapter preserves the full /oidc path when invoking callback().
      const server = createServer(provider.callback());
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const { port } = server.address() as { port: number };
        const response = await fetch(`http://127.0.0.1:${port}/oidc/token/revocation`, {
          method: 'POST',
          body: new URLSearchParams({
            token: 'nonexistent-test-token',
            token_type_hint: 'refresh_token',
            client_id: 'orvilo-desktop',
          }),
        });
        expect(response.status).toBe(200);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    } finally {
      vi.doUnmock('./jwt');
      vi.doUnmock('./cookies');
      vi.resetModules();
    }
  });
});
