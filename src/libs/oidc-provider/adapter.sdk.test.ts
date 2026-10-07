// @vitest-environment node
import { createServer } from 'node:http';

import { oidcGrants } from '@orvilo/database/schemas';
import { exportJWK, generateKeyPair } from 'jose';
import type { Adapter as SDKAdapter } from 'oidc-provider';
import Provider from 'oidc-provider';
import { describe, expect, it } from 'vitest';

import { DrizzleAdapter } from './adapter';

// Persistence is isolated in memory; provider models, routing, rotation and revocation are real SDK code.
describe('installed SDK refresh replay', () => {
  it.each([30, 300, 0])('revokes only the replayed family after %s seconds', async (age) => {
    const records = new Map<
      string,
      { data: Record<string, any>; consumedAt?: Date; expiresAt: Date }
    >();
    let reads = 0;
    let releaseReads!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    class Adapter implements SDKAdapter {
      constructor(private name: string) {}
      async upsert(id: string, data: Record<string, any>, ttl = 3600) {
        records.set(`${this.name}:${id}`, { data, expiresAt: new Date(Date.now() + ttl * 1000) });
      }
      async find(id: string) {
        const row = records.get(`${this.name}:${id}`);
        if (this.name === 'RefreshToken') {
          const chain = {
            from: () => chain,
            where: () => chain,
            limit: async () => (row ? [row] : []),
          };
          const payload = await new DrizzleAdapter('RefreshToken', {
            select: () => chain,
          } as any).find(id);
          if (age === 0 && reads < 2) {
            reads += 1;
            if (reads === 2) releaseReads();
            await bothRead;
          }
          return payload;
        }
        return row?.data;
      }
      async findByUserCode(userCode: string) {
        return [...records.entries()].find(
          ([key, row]) => key.startsWith(`${this.name}:`) && row.data.userCode === userCode,
        )?.[1].data;
      }
      async findByUid(uid: string) {
        return [...records.entries()].find(
          ([key, row]) => key.startsWith(`${this.name}:`) && row.data.uid === uid,
        )?.[1].data;
      }
      async consume(id: string) {
        const row = records.get(`${this.name}:${id}`);
        const grantId = row?.data.grantId;
        const select = {
          from: () => select,
          where: () => select,
          limit: async () => (row ? [{ grantId }] : []),
        };
        const update = {
          set: () => update,
          where: () => update,
          returning: async () => {
            if (!row || row.consumedAt) return [];
            row.consumedAt = new Date(Date.now() - age * 1000);
            return [{ id }];
          },
        };
        const db = {
          select: () => select,
          update: () => update,
          delete: (table: unknown) => ({
            where: async () => {
              if (table === oidcGrants) records.delete(`Grant:${grantId}`);
              else
                for (const [key, value] of records)
                  if (value.data.grantId === grantId) records.delete(key);
            },
          }),
          transaction: async (callback: (tx: unknown) => Promise<void>) => callback(db),
        };
        await new DrizzleAdapter('RefreshToken', db as any).consume(id);
      }
      async destroy(id: string) {
        records.delete(`${this.name}:${id}`);
      }
      async revokeByGrantId(grantId: string) {
        for (const [key, row] of records) {
          if (key.startsWith(`${this.name}:`) && row.data.grantId === grantId) records.delete(key);
        }
      }
    }
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const provider = new Provider('http://localhost/oidc', {
      adapter: Adapter,
      clients: [
        {
          client_id: 'test-client',
          grant_types: ['refresh_token'],
          response_types: [],
          redirect_uris: [],
          token_endpoint_auth_method: 'none',
        },
      ],
      jwks: { keys: [{ ...(await exportJWK(privateKey)), alg: 'RS256', use: 'sig' }] },
      findAccount: async (_ctx, accountId) => ({
        accountId,
        claims: async () => ({ sub: accountId }),
      }),
      features: { devInteractions: { enabled: false } },
      rotateRefreshToken: true,
    });
    const client = (await provider.Client.find('test-client'))!;
    const issue = async () => {
      const grant = new provider.Grant({ accountId: 'user-1', clientId: client.clientId });
      grant.addOIDCScope('openid offline_access');
      const grantId = await grant.save();
      const refreshToken = await new provider.RefreshToken({
        accountId: 'user-1',
        client,
        grantId,
        gty: 'authorization_code',
        scope: 'openid offline_access',
      }).save();
      return { grantId, refreshToken };
    };
    const first = await issue();
    const separate = await issue();
    const server = createServer(provider.callback());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const refresh = async (token: string) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/token`, {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: client.clientId,
          refresh_token: token,
        }),
      });
      return { status: response.status, body: await response.json() };
    };
    try {
      if (age === 0) {
        const simultaneous = await Promise.all([
          refresh(first.refreshToken),
          refresh(first.refreshToken),
        ]);
        expect(simultaneous.map((result) => result.status).sort()).toEqual([200, 400]);
        expect(await provider.Grant.find(first.grantId)).toBeUndefined();
        const winner = simultaneous.find((result) => result.status === 200)!;
        expect(await refresh(winner.body.refresh_token)).toMatchObject({
          status: 400,
          body: { error: 'invalid_grant' },
        });
        expect((await refresh(separate.refreshToken)).status).toBe(200);
        return;
      }
      const rotation = await refresh(first.refreshToken);
      expect(rotation.status).toBe(200);
      expect(rotation.body.refresh_token).not.toBe(first.refreshToken);
      const replay = await refresh(first.refreshToken);
      expect(replay).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
      expect(await provider.Grant.find(first.grantId)).toBeUndefined();
      expect(await refresh(rotation.body.refresh_token)).toMatchObject({
        status: 400,
        body: { error: 'invalid_grant' },
      });
      expect((await refresh(separate.refreshToken)).status).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
