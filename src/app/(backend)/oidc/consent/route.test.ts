/**
 * @vitest-environment node
 */
import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const mocks = vi.hoisted(() => ({
  getInteractionDetails: vi.fn(),
  getInteractionResult: vi.fn(),
  findOrCreateGrants: vi.fn(),
  getUserAuth: vi.fn(),
}));

vi.mock('debug', () => ({ default: () => vi.fn() }));

vi.mock('@orvilo/utils/server', () => ({ getUserAuth: mocks.getUserAuth }));

vi.mock('@/server/services/oidc', () => ({
  OIDCService: {
    initialize: vi.fn(async () => ({
      getInteractionDetails: mocks.getInteractionDetails,
      getInteractionResult: mocks.getInteractionResult,
      findOrCreateGrants: mocks.findOrCreateGrants,
    })),
  },
}));

const createRequest = (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new Request('https://orvilo-cloud-next-stable.vercel.app/oidc/consent', {
    body,
    headers: { origin: 'https://orvilo.aspectlylabs.com' },
    method: 'POST',
  }) as unknown as NextRequest;
};

describe('POST /oidc/consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.findOrCreateGrants.mockResolvedValue({
      addOIDCClaims: vi.fn(),
      addOIDCScope: vi.fn(),
      addResourceScope: vi.fn(),
      save: vi.fn().mockResolvedValue('new-web-account-grant'),
    });
    mocks.getInteractionDetails.mockResolvedValue({
      params: { client_id: 'orvilo-desktop' },
      prompt: { details: {}, name: 'login' },
    });
    mocks.getInteractionResult.mockResolvedValue(
      'https://orvilo.aspectlylabs.com/oidc/auth/uid-1?resume=1',
    );
  });

  it('redirects back into the provider on the origin the browser is using', async () => {
    const response = await POST(createRequest({ consent: 'accept', uid: 'uid-1' }));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/oidc/auth/uid-1?resume=1');
    expect(mocks.getInteractionResult).toHaveBeenCalledWith('uid-1', {
      login: { accountId: 'user-1', remember: true },
    });
  });

  it('returns 400 when the interaction session is gone', async () => {
    mocks.getInteractionDetails.mockRejectedValue(new Error('interaction session not found'));

    const response = await POST(createRequest({ consent: 'accept', uid: 'uid-1' }));

    expect(response.status).toBe(400);
    expect(mocks.getInteractionResult).not.toHaveBeenCalled();
  });

  it.each(['another-user', undefined])(
    'binds verified web identity before selecting a grant when interaction account is %s',
    async (accountId) => {
      mocks.getInteractionDetails.mockResolvedValue({
        grantId: 'another-account-grant',
        params: { client_id: 'orvilo-desktop' },
        prompt: { details: {}, name: 'consent' },
        session: accountId ? { accountId } : undefined,
      });

      const response = await POST(createRequest({ consent: 'accept', uid: 'uid-1' }));

      expect(response.status).toBe(303);
      expect(mocks.findOrCreateGrants).not.toHaveBeenCalled();
      expect(mocks.getInteractionResult).toHaveBeenCalledWith('uid-1', {
        login: { accountId: 'user-1', remember: true },
      });
    },
  );

  it('retains matching SSO and grants only the requested missing scopes', async () => {
    const grant = {
      addOIDCClaims: vi.fn(),
      addOIDCScope: vi.fn(),
      addResourceScope: vi.fn(),
      save: vi.fn().mockResolvedValue('matching-grant'),
    };
    mocks.findOrCreateGrants.mockResolvedValue(grant);
    mocks.getInteractionDetails.mockResolvedValue({
      grantId: 'matching-grant',
      params: { client_id: 'orvilo-desktop' },
      prompt: {
        details: {
          missingOIDCClaims: ['email'],
          missingOIDCScope: ['profile', 'email', 'offline_access'],
          missingResourceScopes: { 'urn:orvilo:chat': ['read'] },
        },
        name: 'consent',
      },
      session: { accountId: 'user-1' },
    });

    const response = await POST(createRequest({ consent: 'accept', uid: 'uid-1' }));

    expect(response.status).toBe(303);
    expect(mocks.findOrCreateGrants).toHaveBeenCalledWith(
      'user-1',
      'orvilo-desktop',
      'matching-grant',
    );
    expect(grant.addOIDCScope).toHaveBeenCalledWith('profile email offline_access');
    expect(grant.addOIDCClaims).toHaveBeenCalledWith(['email']);
    expect(grant.addResourceScope).toHaveBeenCalledWith('urn:orvilo:chat', 'read');
    expect(mocks.getInteractionResult).toHaveBeenCalledWith('uid-1', {
      consent: { grantId: 'matching-grant' },
    });
  });

  it('recovers an expired web session through sign-in without writing a grant', async () => {
    mocks.getUserAuth.mockResolvedValue({ userId: undefined });
    const originalParams = {
      client_id: 'orvilo-desktop',
      code_challenge: 'synthetic-challenge',
      code_challenge_method: 'S256',
      prompt: 'consent',
      redirect_uri: 'https://orvilo.aspectlylabs.com/oidc/callback/desktop',
      resource: ['urn:orvilo:chat', 'urn:synthetic:second-validated-resource'],
      response_type: 'code',
      scope: 'profile email offline_access',
      state: 'synthetic-state+&=',
      ui_locales: 'en-US zh-CN',
    };
    mocks.getInteractionDetails.mockResolvedValue({
      params: originalParams,
      prompt: { details: {}, name: 'consent' },
      session: { accountId: 'existing-oidc-account' },
    });

    const response = await POST(createRequest({ consent: 'accept', uid: 'uid-1' }));

    expect(response.status).toBe(303);
    const destination = new URL(
      response.headers.get('location')!,
      'https://orvilo.aspectlylabs.com',
    );
    expect(destination.pathname).toBe('/signin');
    const restart = new URL(destination.searchParams.get('callbackUrl')!, destination.origin);
    expect(restart.pathname).toBe('/oidc/auth');
    expect([...restart.searchParams.keys()]).toHaveLength(11);
    expect(restart.searchParams.getAll('resource')).toEqual([
      'urn:orvilo:chat',
      'urn:synthetic:second-validated-resource',
    ]);
    for (const [key, value] of Object.entries(originalParams)) {
      if (typeof value === 'string') expect(restart.searchParams.get(key)).toBe(value);
    }
    expect(mocks.findOrCreateGrants).not.toHaveBeenCalled();
    expect(mocks.getInteractionResult).not.toHaveBeenCalled();
  });

  it('keeps a rejection denied even without a web session', async () => {
    mocks.getUserAuth.mockResolvedValue({ userId: undefined });
    const response = await POST(createRequest({ consent: 'deny', uid: 'uid-1' }));

    expect(response.status).toBe(303);
    expect(mocks.getInteractionResult).toHaveBeenCalledWith('uid-1', {
      error: 'access_denied',
      error_description: 'User denied the authorization request',
    });
    expect(mocks.findOrCreateGrants).not.toHaveBeenCalled();
  });

  it('denies an interrupted in-flight device interaction when web auth is missing', async () => {
    mocks.getUserAuth.mockResolvedValue({ userId: undefined });
    mocks.getInteractionDetails.mockResolvedValue({
      deviceCode: 'synthetic-device-code',
      params: { client_id: 'orvilo-cli' },
      prompt: { details: {}, name: 'consent' },
    });
    const response = await POST(createRequest({ consent: 'accept', uid: 'uid-1' }));
    expect(response.status).toBe(303);
    expect(mocks.getInteractionResult).toHaveBeenCalledWith('uid-1', {
      error: 'access_denied',
      error_description: 'The web session expired; restart device authorization',
    });
    expect(mocks.findOrCreateGrants).not.toHaveBeenCalled();
  });

  it.each(['', undefined])('rejects missing UID %s before auth or grant selection', async (uid) => {
    const response = await POST(
      createRequest(uid === undefined ? { consent: 'accept' } : { consent: 'accept', uid }),
    );
    expect(response.status).toBe(400);
    expect(mocks.getInteractionDetails).not.toHaveBeenCalled();
    expect(mocks.getUserAuth).not.toHaveBeenCalled();
    expect(mocks.findOrCreateGrants).not.toHaveBeenCalled();
  });
});
