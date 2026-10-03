// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendResultWebhook, validateResultWebhookEndpoint } from './transport';

const { fetch } = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@orvilo/ssrf-safe-fetch', () => ({ ssrfSafeFetch: fetch }));

const payload = {
  completedAt: '2026-10-03T00:00:00Z',
  evidence: { occurrenceId: 'occurrence-1' },
  identifier: 'AUT-1',
  runId: 'operation-1',
  status: 'succeeded' as const,
  stopReason: 'done',
  summary: 'Used the unique error report ERR-784.',
  taskId: 'task-1',
  version: 1 as const,
};
const input = { deliveryId: 'delivery-1', endpoint: 'https://receiver.example/results', payload };

beforeEach(() => {
  fetch.mockReset();
});

describe('result webhook transport', () => {
  it('sends frozen structured results through strict SSRF protection with stable output identity', async () => {
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await sendResultWebhook({ ...input, authorization: 'Bearer vault-token' })).toEqual({
      httpStatus: 204,
      status: 'delivered',
    });
    expect(fetch).toHaveBeenCalledWith(
      input.endpoint,
      expect.objectContaining({
        body: JSON.stringify(payload),
        headers: expect.objectContaining({
          'Authorization': 'Bearer vault-token',
          'Idempotency-Key': input.deliveryId,
        }),
        method: 'POST',
        redirect: 'manual',
        signal: expect.any(AbortSignal),
      }),
      { allowIPAddressList: [], allowPrivateIPAddress: false, maxContentLength: 4096 },
    );
  });

  it.each([429, 500, 503])(
    'retries an explicit HTTP %s response independently of execution',
    async (status) => {
      fetch.mockResolvedValue(new Response(null, { status }));
      expect(await sendResultWebhook(input)).toEqual({
        error: `HTTP_${status}`,
        httpStatus: status,
        status: 'retry',
      });
    },
  );

  it('never follows a redirect that could forward credentials to a new host', async () => {
    fetch.mockResolvedValue(
      new Response(null, { headers: { Location: 'https://another.example' }, status: 302 }),
    );
    expect(await sendResultWebhook(input)).toEqual({
      error: 'HTTP_302',
      httpStatus: 302,
      status: 'failed',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('records an ambiguous write as unknown without leaking the secret or raw network error', async () => {
    fetch.mockRejectedValue(new Error('socket closed after Authorization: secret-token was sent'));
    expect(await sendResultWebhook(input)).toEqual({
      error: 'DELIVERY_RESULT_UNKNOWN',
      status: 'unknown',
    });
  });

  it('treats a blocked private destination as a failed output', async () => {
    fetch.mockRejectedValue(new Error('SSRF blocked: 127.0.0.1 is not allowed'));
    expect(await sendResultWebhook(input)).toEqual({ error: 'ENDPOINT_BLOCKED', status: 'failed' });
  });

  it.each([
    'http://receiver.example/results',
    'https://user:secret@receiver.example/results',
    'https://receiver.example/results?token=secret',
    'https://receiver.example/results#secret',
    'file:///etc/passwd',
  ])('rejects unsafe or secret-bearing endpoint %s before sending', async (endpoint) => {
    expect(() => validateResultWebhookEndpoint(endpoint)).toThrow();
    expect(await sendResultWebhook({ ...input, endpoint })).toEqual({
      error: 'CONFIGURATION_INVALID',
      status: 'failed',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
