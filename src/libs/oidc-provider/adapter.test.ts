import debug from 'debug';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DrizzleAdapter } from './adapter';

const createSelectDb = (rows: any[]) => {
  const chain = {
    from: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    where: vi.fn(() => chain),
  };
  return { select: vi.fn(() => chain) };
};

const createUpsertDb = (options?: { updateRejects?: boolean }) => {
  const updateWhere = vi.fn(() =>
    options?.updateRejects
      ? Promise.reject(new Error('update failed'))
      : Promise.resolve(undefined),
  );
  const updateChain = {
    set: vi.fn(() => updateChain),
    where: updateWhere,
  };

  const insertChain = {
    onConflictDoUpdate: vi.fn(() => Promise.resolve(undefined)),
    values: vi.fn(() => insertChain),
  };

  const update = vi.fn(() => updateChain);

  return {
    db: {
      insert: vi.fn(() => insertChain),
      update,
    },
    update,
    updateChain,
  };
};

describe('OIDCAdapter (DrizzleAdapter)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('find Client enforcement', () => {
    const clientRow = {
      applicationType: 'native',
      clientSecret: null,
      enabled: true,
      grants: ['urn:ietf:params:oauth:grant-type:device_code'],
      id: 'lca_client_1',
      isFirstParty: false,
      redirectUris: [],
      responseTypes: [],
      scopes: ['openid', 'profile'],
    };

    it('returns the mapped client when enabled', async () => {
      const db = createSelectDb([clientRow]);
      const adapter = new DrizzleAdapter('Client', db as any);

      const result = await adapter.find('lca_client_1');

      expect(result).toMatchObject({
        client_id: 'lca_client_1',
        scope: 'openid profile',
      });
    });

    it('returns undefined when the client is disabled', async () => {
      const db = createSelectDb([{ ...clientRow, enabled: false }]);
      const adapter = new DrizzleAdapter('Client', db as any);

      const result = await adapter.find('lca_client_1');

      expect(result).toBeUndefined();
    });

    it('omits null optional fields so oidc-provider client schema accepts the metadata', async () => {
      const db = createSelectDb([
        {
          ...clientRow,
          clientUri: null,
          logoUri: null,
          policyUri: null,
          tokenEndpointAuthMethod: 'none',
          tosUri: null,
        },
      ]);
      const adapter = new DrizzleAdapter('Client', db as any);

      const result = (await adapter.find('lca_client_1')) as Record<string, unknown>;

      for (const key of ['client_secret', 'client_uri', 'logo_uri', 'policy_uri', 'tos_uri']) {
        expect(result).not.toHaveProperty(key);
      }
      expect(result).toMatchObject({
        client_id: 'lca_client_1',
        token_endpoint_auth_method: 'none',
      });
    });
  });

  describe('lastUsedAt stamping', () => {
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('stamps last_used_at for a user-created (lca_) client on AccessToken upsert', async () => {
      const { db, update, updateChain } = createUpsertDb();
      const adapter = new DrizzleAdapter('AccessToken', db as any);

      await adapter.upsert('token-1', { accountId: 'user-1', clientId: 'lca_client_1' }, 3600);
      await flush();

      expect(update).toHaveBeenCalledTimes(1);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      );
    });

    it('stamps last_used_at on DeviceCode upsert', async () => {
      const { db, update } = createUpsertDb();
      const adapter = new DrizzleAdapter('DeviceCode', db as any);

      await adapter.upsert(
        'device-1',
        { accountId: 'user-1', clientId: 'lca_client_2', userCode: 'ABCD' },
        600,
      );
      await flush();

      expect(update).toHaveBeenCalledTimes(1);
    });

    it('does not stamp for static first-party clients', async () => {
      const { db, update } = createUpsertDb();
      const adapter = new DrizzleAdapter('AccessToken', db as any);

      await adapter.upsert('token-2', { accountId: 'user-1', clientId: 'orvilo-cli' }, 3600);
      await flush();

      expect(update).not.toHaveBeenCalled();
    });

    it('does not throw when the stamping update fails', async () => {
      const { db } = createUpsertDb({ updateRejects: true });
      const adapter = new DrizzleAdapter('AccessToken', db as any);

      await expect(
        adapter.upsert('token-3', { accountId: 'user-1', clientId: 'lca_client_3' }, 3600),
      ).resolves.toBeUndefined();
      await flush();
    });
  });
});

describe('refresh token replay persistence', () => {
  it.each([30, 300])(
    'returns consumed epoch seconds after %s seconds until expiry',
    async (age) => {
      const consumedAt = new Date(Date.now() - age * 1000);
      const adapter = new DrizzleAdapter(
        'RefreshToken',
        createSelectDb([
          {
            consumedAt,
            data: { grantId: 'grant-1', accountId: 'user-1' },
            expiresAt: new Date(Date.now() + 60_000),
          },
        ]) as any,
      );
      await expect(adapter.find('used-token')).resolves.toMatchObject({
        consumed: Math.floor(consumedAt.getTime() / 1000),
        grantId: 'grant-1',
      });
    },
  );
});

describe('enabled adapter debug logging', () => {
  it('does not log grant artifact IDs during family revocation', async () => {
    const previous = debug.disable();
    debug.enable('orvilo-oidc:adapter');
    const output = vi.spyOn(debug, 'log').mockImplementation(() => {});
    const tx = { delete: () => ({ where: async () => {} }) };
    const db = {
      transaction: async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx),
    };
    try {
      await new DrizzleAdapter('RefreshToken', db as any).revokeByGrantId(
        'GRANT_SECRET_LOG_SENTINEL',
      );
      expect(output).toHaveBeenCalled();
      expect(JSON.stringify(output.mock.calls)).not.toContain('GRANT_SECRET_LOG_SENTINEL');
    } finally {
      output.mockRestore();
      debug.enable(previous);
    }
  });
});
