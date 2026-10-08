/**
 * @vitest-environment node
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

import Keygrip from 'keygrip';
import { NextRequest } from 'next/server';
import type { AdapterPayload, KoaContextWithOIDC } from 'oidc-provider';
import Provider from 'oidc-provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defineConfig } from '@/libs/next/proxy/define-config';
import { createNodeRequest, createNodeResponse } from '@/libs/oidc-provider/http-adapter';

import { POST } from './route';

const fixture = vi.hoisted(() => ({
  cookieHeader: '',
  provider: undefined as Provider | undefined,
  userId: 'canonical-b' as string | undefined,
  providerErrors: [] as string[],
}));

vi.mock('@orvilo/utils/server', () => ({
  getUserAuth: async () => ({ userId: fixture.userId }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () =>
      fixture.cookieHeader
        .split('; ')
        .filter(Boolean)
        .map((cookie) => {
          const split = cookie.indexOf('=');
          return { name: cookie.slice(0, split), value: cookie.slice(split + 1) };
        }),
  }),
}));
vi.mock('@/envs/app', () => ({ appEnv: { APP_URL: 'https://synthetic.example.test' } }));
vi.mock('@/libs/oidc-provider/config', () => ({
  defaultClients: [{ client_id: 'orvilo-desktop' }],
}));
vi.mock('@/server/services/oidc/oidcProvider', () => ({
  getOIDCProvider: async () => fixture.provider,
}));
vi.mock('@orvilo/database', () => ({ getServerDB: vi.fn() }));
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: async () => ({}) }));
vi.mock('@/server/services/auth', () => ({
  resolveAuthSessionFromHeaders: async () => (fixture.userId ? { userId: fixture.userId } : null),
}));
vi.mock('@orvilo/database/schemas', () => ({ oidcClients: {}, users: {} }));

const origin = 'https://synthetic.example.test';
const clientId = 'orvilo-desktop';
const cookieKey = 'synthetic-test-cookie-key';
const verifier = 'synthetic-verifier-'.repeat(4);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const params = {
  client_id: clientId,
  code_challenge: challenge,
  code_challenge_method: 'S256',
  prompt: 'consent',
  redirect_uri: `${origin}/oidc/callback/desktop`,
  resource: 'urn:orvilo:chat',
  response_type: 'code',
  scope: 'profile email offline_access',
  state: 'synthetic-original-state',
};

const records = new Map<string, AdapterPayload>();
const cookies = new Map<string, string>();

class MemoryAdapter {
  constructor(private name: string) {}

  async upsert(id: string, payload: AdapterPayload) {
    records.set(`${this.name}:${id}`, structuredClone(payload));
  }

  async find(id: string) {
    return records.get(`${this.name}:${id}`);
  }

  async findByUid(uid: string) {
    return [...records.entries()].find(
      ([key, value]) => key.startsWith(`${this.name}:`) && value.uid === uid,
    )?.[1];
  }

  async findByUserCode(userCode: string) {
    return [...records.entries()].find(
      ([key, value]) => key.startsWith(`${this.name}:`) && value.userCode === userCode,
    )?.[1];
  }

  async destroy(id: string) {
    records.delete(`${this.name}:${id}`);
  }

  async consume(id: string) {
    const payload = await this.find(id);
    if (payload) payload.consumed = Math.floor(Date.now() / 1000);
  }

  async revokeByGrantId(grantId: string) {
    for (const [key, payload] of records) {
      if (key.startsWith(`${this.name}:`) && payload.grantId === grantId) records.delete(key);
    }
  }
}

const collectCookies = (setCookies: string | string[] | undefined) => {
  for (const entry of setCookies ? [setCookies].flat() : []) {
    const pair = entry.split(';')[0];
    const split = pair.indexOf('=');
    const name = pair.slice(0, split);
    const value = pair.slice(split + 1);
    if (value) cookies.set(name, value);
    else cookies.delete(name);
  }
  fixture.cookieHeader = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
};

const requestProvider = async (path: string, fields?: Record<string, string>) => {
  const body = fields ? new URLSearchParams(fields).toString() : undefined;
  const request = new NextRequest(new URL(path, origin), {
    body,
    headers: {
      ...(body
        ? {
            'content-length': String(Buffer.byteLength(body)),
            'content-type': 'application/x-www-form-urlencoded',
          }
        : {}),
      'cookie': fixture.cookieHeader,
      'host': 'synthetic.example.test',
      'x-forwarded-proto': 'https',
    },
    method: fields ? 'POST' : 'GET',
  });
  let collector!: ReturnType<typeof createNodeResponse>;
  const completed = new Promise<void>((resolve) => {
    collector = createNodeResponse(resolve);
  });
  const nodeRequest = await createNodeRequest(request);
  fixture.provider!.callback()(nodeRequest, collector.nodeResponse);
  await completed;
  collectCookies(collector.responseHeaders['set-cookie']);
  return collector;
};

const submitConsent = async (location: string, choice = 'accept') => {
  const uid = new URL(location, origin).pathname.split('/').at(-1)!;
  const response = await POST(
    new NextRequest(`${origin}/oidc/consent`, {
      body: new URLSearchParams({ consent: choice, uid }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    }),
  );
  return { response, uid };
};

const seedSession = async (accountId: string) => {
  const session = new fixture.provider!.Session();
  session.loginAccount({ accountId, loginTs: Math.floor(Date.now() / 1000) - 120 });
  await session.save(3600);
  const name = fixture.provider!.cookieName('session');
  const pair = `${name}=${session.jti}`;
  cookies.set(name, session.jti);
  cookies.set(`${name}.sig`, new Keygrip([cookieKey]).sign(pair));
  collectCookies(undefined);
  return session;
};

beforeEach(() => {
  records.clear();
  cookies.clear();
  fixture.cookieHeader = '';
  fixture.userId = 'canonical-b';
  fixture.providerErrors = [];
  fixture.provider = new Provider(`${origin}/oidc`, {
    adapter: MemoryAdapter,
    clients: [
      {
        client_id: clientId,
        grant_types: ['authorization_code', 'refresh_token'],
        redirect_uris: [params.redirect_uri],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
      {
        application_type: 'native',
        client_id: 'orvilo-cli',
        grant_types: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
        response_types: [],
        token_endpoint_auth_method: 'none',
      },
    ],
    cookies: {
      keys: [cookieKey],
      long: { path: '/', signed: true },
      short: { path: '/', signed: true },
    },
    features: {
      devInteractions: { enabled: false },
      deviceFlow: { enabled: true },
      rpInitiatedLogout: { enabled: true },
      resourceIndicators: {
        enabled: true,
        getResourceServerInfo: () => ({
          accessTokenFormat: 'opaque',
          audience: params.resource,
          scope: 'profile email offline_access',
        }),
      },
    },
    findAccount: async (_ctx, accountId) => {
      if (!['canonical-a', 'canonical-b'].includes(accountId)) return undefined;
      return { accountId, claims: async () => ({ sub: accountId }) };
    },
    interactions: { url: (_ctx, interaction) => `/oauth/consent/${interaction.uid}` },
    pkce: { required: () => true },
    routes: {
      authorization: '/oidc/auth',
      code_verification: '/oidc/device',
      device_authorization: '/oidc/device/auth',
      end_session: '/oidc/session/end',
      token: '/oidc/token',
    },
  });
  fixture.provider.proxy = true;
  for (const event of ['server_error', 'authorization.error', 'end_session_confirm.error']) {
    EventEmitter.prototype.on.call(
      fixture.provider,
      event,
      (_ctx: KoaContextWithOIDC, error: Error) => {
        const description = 'error_description' in error ? error.error_description : undefined;
        fixture.providerErrors.push(typeof description === 'string' ? description : error.message);
      },
    );
  }
});

const completeAuthorization = async (
  authorizationUrl = `/oidc/auth?${new URLSearchParams(params)}`,
) => {
  let reply = await requestProvider(authorizationUrl);
  for (let step = 0; step < 8; step++) {
    const location = reply.responseHeaders.location as string | undefined;
    if (location && new URL(location, origin).pathname === '/oidc/callback/desktop')
      return location;
    if (location?.startsWith('/oauth/consent/')) {
      const { response } = await submitConsent(location);
      expect(response.status).toBe(303);
      reply = await requestProvider(response.headers.get('location')!);
    } else if (reply.responseStatus === 200 && String(reply.responseBody).includes('name="xsrf"')) {
      const html = String(reply.responseBody);
      const action = /action="([^"]+)"/.exec(html)?.[1];
      const xsrf = /name="xsrf" value="([^"]+)"/.exec(html)?.[1];
      expect(action).toContain('/oidc/session/end/confirm');
      expect(xsrf).toBeTruthy();
      reply = await requestProvider(action!, { logout: 'yes', xsrf: xsrf! });
    } else if (location) {
      reply = await requestProvider(location);
    } else {
      throw new Error(
        `Provider did not resume authorization (status ${reply.responseStatus}; ${fixture.providerErrors.at(-1) ?? 'no server error'})`,
      );
    }
  }
  throw new Error('Authorization did not complete');
};

describe('consent against the installed provider', () => {
  it.each([
    { accountId: 'canonical-a', persistent: false },
    { accountId: 'canonical-a', persistent: true },
    { accountId: 'canonical-b', persistent: false },
    { accountId: undefined, persistent: false },
  ])(
    'completes PKCE from SSO $accountId (persistent grant $persistent)',
    async ({ accountId, persistent }) => {
      const currentSession = accountId ? await seedSession(accountId) : undefined;
      const currentGrant = currentSession
        ? new fixture.provider!.Grant({ accountId: accountId!, clientId })
        : undefined;
      if (currentSession && currentGrant) {
        await currentGrant.save();
        currentSession.grantIdFor(clientId, currentGrant.jti);
        currentSession.authorizationFor(clientId).persistsLogout = persistent;
        await currentSession.save(3600);
      }
      const unrelatedGrant = new fixture.provider!.Grant({ accountId: 'canonical-a', clientId });
      await unrelatedGrant.save();
      const unrelatedSession = new fixture.provider!.Session();
      unrelatedSession.loginAccount({ accountId: 'canonical-a' });
      unrelatedSession.grantIdFor(clientId, unrelatedGrant.jti);
      await unrelatedSession.save(3600);

      const location = await completeAuthorization();
      const callback = new URL(location);
      expect(callback.searchParams.get('state')).toBe(params.state);
      const code = await fixture.provider!.AuthorizationCode.find(
        callback.searchParams.get('code')!,
      );
      expect(code?.accountId).toBe('canonical-b');
      expect(code?.codeChallenge).toBe(challenge);
      assert.ok(code?.grantId);
      const grant = await fixture.provider!.Grant.find(code.grantId);
      expect(grant?.accountId).toBe('canonical-b');
      expect(await fixture.provider!.Grant.find(unrelatedGrant.jti)).toBeDefined();
      expect(await fixture.provider!.Session.find(unrelatedSession.jti)).toBeDefined();
      if (currentGrant) {
        const retained = await fixture.provider!.Grant.find(currentGrant.jti);
        if (accountId === 'canonical-a' && !persistent) expect(retained).toBeUndefined();
        else expect(retained).toBeDefined();
      }
      if (accountId === 'canonical-b') {
        const retainedSession = await fixture.provider!.Session.findByUid(code!.sessionUid!);
        expect(retainedSession?.uid).toBe(currentSession!.uid);
        expect(retainedSession?.authTime()).toBe(currentSession!.authTime());
      }

      const exchange = {
        client_id: clientId,
        code: callback.searchParams.get('code')!,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: params.redirect_uri,
      };
      for (const invalid of [
        { code_verifier: 'synthetic-wrong-verifier-'.repeat(4) },
        { redirect_uri: `${origin}/different-callback` },
        { client_id: 'unknown-synthetic-client' },
      ]) {
        const rejected = await requestProvider('/oidc/token', { ...exchange, ...invalid });
        expect(rejected.responseStatus).toBeGreaterThanOrEqual(400);
        const rejectedBody = JSON.parse(String(rejected.responseBody)) as Record<string, unknown>;
        expect(['invalid_grant', 'invalid_client']).toContain(rejectedBody.error);
      }
      const token = await requestProvider('/oidc/token', exchange);
      const result = JSON.parse(String(token.responseBody)) as Record<string, unknown>;
      expect(result.error_description).toBeUndefined();
      expect(token.responseStatus).toBe(200);
      expect(result.access_token).toBeTruthy();
      expect(result.refresh_token).toBeTruthy();
    },
  );

  it('restarts the validated native request when sign-in deletes the old OIDC session', async () => {
    const oldSession = await seedSession('canonical-a');
    fixture.userId = undefined;
    const initial = await requestProvider(`/oidc/auth?${new URLSearchParams(params)}`);
    const { response } = await submitConsent(initial.responseHeaders.location as string);
    expect(response.status).toBe(303);
    const signIn = new URL(response.headers.get('location')!, origin);
    const restart = new URL(signIn.searchParams.get('callbackUrl')!, origin);
    expect(restart.pathname).toBe('/oidc/auth');
    for (const [key, value] of Object.entries(params))
      expect(restart.searchParams.get(key)).toBe(value);

    // The normal Clerk exchange deletes only a mismatched referenced browser Session.
    await oldSession.destroy();
    fixture.userId = 'canonical-b';
    const sessionCookie = fixture.provider!.cookieName('session');
    cookies.delete(sessionCookie);
    cookies.delete(`${sessionCookie}.sig`);
    collectCookies(undefined);
    const completed = new URL(await completeAuthorization(restart.href));
    expect(completed.searchParams.get('state')).toBe(params.state);
    const code = await fixture.provider!.AuthorizationCode.find(
      completed.searchParams.get('code')!,
    );
    expect(code?.accountId).toBe('canonical-b');
    expect(code?.codeChallenge).toBe(challenge);
    const token = await requestProvider('/oidc/token', {
      client_id: clientId,
      code: completed.searchParams.get('code')!,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: params.redirect_uri,
    });
    expect(token.responseStatus).toBe(200);
  });

  it.each(['missing', 'forged', 'mismatched', 'expired'])(
    'rejects a %s interaction before recovery or grant writes',
    async (failure) => {
      await seedSession('canonical-b');
      const initial = await requestProvider(`/oidc/auth?${new URLSearchParams(params)}`);
      const location = initial.responseHeaders.location as string;
      const uid = new URL(location, origin).pathname.split('/').at(-1)!;
      fixture.userId = undefined;
      const name = fixture.provider!.cookieName('interaction');
      if (failure === 'missing') cookies.delete(name);
      if (failure === 'forged') cookies.set(`${name}.sig`, 'synthetic-invalid-signature');
      if (failure === 'expired') records.delete(`Interaction:${uid}`);
      collectCookies(undefined);
      const before = [...records.keys()].filter((key) => key.startsWith('Grant:'));
      const body = new URLSearchParams({
        consent: 'accept',
        uid: failure === 'mismatched' ? 'different-uid' : uid,
      });
      const response = await POST(
        new NextRequest(`${origin}/oidc/consent`, { body, method: 'POST' }),
      );
      expect(response.status).toBe(400);
      expect(response.headers.get('location')).toBeNull();
      expect([...records.keys()].filter((key) => key.startsWith('Grant:'))).toEqual(before);
    },
  );

  it('does not issue a grant or code for an account rejected by findAccount', async () => {
    await seedSession('rejected-canonical-account');
    fixture.userId = 'rejected-canonical-account';
    const initial = await requestProvider(`/oidc/auth?${new URLSearchParams(params)}`);
    expect(initial.responseStatus).toBeGreaterThanOrEqual(400);
    expect(initial.responseHeaders.location).toBeUndefined();
    expect([...records.keys()].filter((key) => key.startsWith('Grant:'))).toEqual([]);
    expect([...records.keys()].filter((key) => key.startsWith('AuthorizationCode:'))).toEqual([]);
  });
});

const formFields = (html: string) =>
  Object.fromEntries(
    [...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );

const issueDeviceCode = async () => {
  const response = await requestProvider('/oidc/device/auth', {
    client_id: 'orvilo-cli',
    resource: params.resource,
    scope: 'openid profile email offline_access',
  });
  expect(response.responseStatus).toBe(200);
  return JSON.parse(String(response.responseBody)) as {
    device_code: string;
    user_code: string;
    verification_uri_complete: string;
  };
};

const startDeviceInteraction = async (verificationUrl: string) => {
  const input = await requestProvider(verificationUrl);
  const inputFields = formFields(String(input.responseBody));
  const confirmation = await requestProvider('/oidc/device', inputFields);
  const confirmationFields = formFields(String(confirmation.responseBody));
  expect(confirmationFields.confirm).toBe('yes');
  return requestProvider('/oidc/device', confirmationFields);
};

describe('device verification against the installed provider', () => {
  it.each(['GET', 'POST'])(
    'preserves the same pending code across cross-account sign-in before %s reaches SDK confirmation',
    async (method) => {
      const oldSession = await seedSession('canonical-a');
      const device = await issueDeviceCode();
      let pending = await fixture.provider!.DeviceCode.find(device.device_code);
      expect(pending?.inFlight).toBeUndefined();
      const initial = await requestProvider(device.verification_uri_complete);
      const initialFields = formFields(String(initial.responseBody));
      fixture.userId = undefined;
      const request = new NextRequest(
        method === 'GET' ? device.verification_uri_complete : `${origin}/oidc/device`,
        {
          body: method === 'POST' ? new URLSearchParams(initialFields) : undefined,
          method,
        },
      );
      const { middleware } = defineConfig();
      const detour = await middleware(request);
      const signIn = new URL(detour!.headers.get('location')!);
      const callback = new URL(signIn.searchParams.get('callbackUrl')!, origin);
      expect(callback.pathname).toBe('/oidc/device');
      expect(callback.searchParams.get('user_code')).toBe(device.user_code);
      expect(callback.searchParams.has('xsrf')).toBe(false);
      pending = await fixture.provider!.DeviceCode.find(device.device_code);
      expect(pending?.inFlight).toBeUndefined();
      const originalParams = structuredClone(pending!.params);

      // Normal cross-account Clerk exchange removes the old browser Session and its cookies.
      await oldSession.destroy();
      const sessionCookie = fixture.provider!.cookieName('session');
      cookies.delete(sessionCookie);
      cookies.delete(`${sessionCookie}.sig`);
      collectCookies(undefined);
      fixture.userId = 'canonical-b';
      const restarted = await requestProvider(callback.href);
      const freshFields = formFields(String(restarted.responseBody));
      expect(freshFields.xsrf).not.toBe(initialFields.xsrf);
      const confirmed = await startDeviceInteraction(callback.href);
      expect(confirmed.responseStatus).toBe(303);
      const stillPending = await fixture.provider!.DeviceCode.find(device.device_code);
      expect(stillPending?.jti).toBe(pending!.jti);
      expect(stillPending?.inFlight).toBe(true);
      expect(stillPending?.params).toEqual(originalParams);
      expect([...records.keys()].filter((key) => key.startsWith('DeviceCode:'))).toHaveLength(1);
    },
  );

  it('finishes an interrupted in-flight device interaction with a standard poll denial', async () => {
    await seedSession('canonical-a');
    const device = await issueDeviceCode();
    const interaction = await startDeviceInteraction(device.verification_uri_complete);
    expect(interaction.responseStatus).toBe(303);
    expect((await fixture.provider!.DeviceCode.find(device.device_code))?.inFlight).toBe(true);
    fixture.userId = undefined;
    const grantsBefore = [...records.keys()].filter((key) => key.startsWith('Grant:'));
    const { response } = await submitConsent(interaction.responseHeaders.location as string);
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get('location')!, origin).pathname).not.toBe('/signin');
    await requestProvider(response.headers.get('location')!);
    const denied = await fixture.provider!.DeviceCode.find(device.device_code);
    expect(denied?.error).toBe('access_denied');
    expect(denied?.accountId).toBeUndefined();
    expect([...records.keys()].filter((key) => key.startsWith('Grant:'))).toEqual(grantsBefore);
    const poll = await requestProvider('/oidc/token', {
      client_id: 'orvilo-cli',
      device_code: device.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    const result = JSON.parse(String(poll.responseBody)) as Record<string, unknown>;
    expect(result.error).toBe('access_denied');
    expect(result.access_token).toBeUndefined();
  });
});
