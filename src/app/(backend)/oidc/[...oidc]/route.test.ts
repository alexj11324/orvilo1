/**
 * @vitest-environment node
 */
import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createNodeRequest: vi.fn(),
  createNodeResponse: vi.fn(),
  middleware: vi.fn(),
  log: vi.fn(),
  providerCallback: vi.fn(),
}));

vi.mock('debug', () => ({
  default: () => mocks.log,
}));

vi.mock('@/envs/auth', () => ({
  authEnv: {
    ENABLE_OIDC: true,
  },
}));

vi.mock('@/libs/oidc-provider/http-adapter', () => ({
  createNodeRequest: mocks.createNodeRequest,
  createNodeResponse: mocks.createNodeResponse,
}));

vi.mock('@/server/services/oidc/oidcProvider', () => ({
  getOIDCProvider: vi.fn(async () => ({
    callback: mocks.providerCallback,
  })),
}));

describe('OIDC route', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.providerCallback.mockReturnValue(mocks.middleware);
    mocks.createNodeResponse.mockReturnValue({
      nodeResponse: {},
      responseBody: '',
      responseHeaders: {},
      responseStatus: 200,
    });
  });

  it('does not log authorization query or response cookie values', async () => {
    const sentinel = 'OIDC_SECRET_LOG_SENTINEL';
    mocks.createNodeRequest.mockResolvedValueOnce({});
    mocks.createNodeResponse.mockReturnValueOnce({
      nodeResponse: {},
      responseStatus: 200,
      responseBody: JSON.stringify({ access_token: sentinel }),
      responseHeaders: {
        'set-cookie': `session=${sentinel}`,
        'location': `https://example.com/callback?code=${sentinel}`,
      },
    });
    mocks.middleware.mockImplementationOnce((_req, _res, next) => next());
    const { POST } = await import('./route');
    const response = await POST(
      new Request(`https://example.com/oidc/token?code=${sentinel}`, {
        method: 'POST',
      }) as unknown as NextRequest,
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(sentinel);
  });

  it('returns a 500 response when creating the Node request fails', async () => {
    mocks.createNodeRequest.mockRejectedValueOnce(new Error('body stream aborted'));

    const { POST } = await import('./route');
    const request = new Request('https://example.com/oidc/token', {
      body: 'grant_type=refresh_token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    }) as unknown as NextRequest;

    const response = await Promise.race([
      POST(request),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OIDC route timed out')), 50),
      ),
    ]);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('Internal Server Error');
    expect(mocks.middleware).not.toHaveBeenCalled();
  });
});

it('retains safe provider diagnostics and redacts credentials from logs and response', async () => {
  const error = Object.assign(new Error('secret sentinel'), {
    error: 'invalid_client',
    statusCode: 401,
    name: 'secret sentinel',
  });
  mocks.createNodeRequest.mockRejectedValueOnce(error);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { POST } = await import('./route');
  const response = await POST(
    new Request('https://example.com/oidc/token?secret=secret-sentinel', {
      method: 'POST',
    }) as unknown as NextRequest,
  );
  expect(response.headers.get('X-Request-ID')).toBeTruthy();
  expect(log).toHaveBeenCalledWith(
    '[OIDC Route] Request failed',
    expect.objectContaining({
      code: 'invalid_client',
      status: 401,
      requestId: response.headers.get('X-Request-ID'),
    }),
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
  expect(await response.text()).toBe('Internal Server Error');
  log.mockRestore();
});
