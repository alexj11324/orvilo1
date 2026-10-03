/**
 * The broker bridge is synchronous on the wire — `broker.infer` acks
 * `{accepted}` immediately while the HTTP pump delivers `broker.event`
 * notifications back into the runner.
 */
import { describe, expect, it, vi } from 'vitest';

import { createBrokerReverseHandler } from './brokerBridge';

const noopLog = { error: vi.fn(), log: vi.fn() };

const ndjson = (lines: unknown[]): string =>
  lines.map((line) => `${JSON.stringify(line)}\n`).join('');

describe('createBrokerReverseHandler', () => {
  it('acks broker.infer synchronously and pumps NDJSON events to the runner', async () => {
    const sent: Array<{ event: unknown; requestId: string }> = [];
    const fetchImpl = (async () =>
      new Response(
        ndjson([
          { event: { text: 'a', type: 'text' }, requestId: 'infer-1' },
          { event: { type: 'end' }, requestId: 'infer-1' },
        ]),
        { status: 200 },
      )) as typeof fetch;
    const handler = createBrokerReverseHandler({
      credential: 'op-jwt',
      endpoint: 'https://server.test/api/agent/prime-broker',
      fetchImpl,
      log: noopLog,
      sendEvent: (requestId, event) => sent.push({ event, requestId }),
      sessionId: 'sess-1',
    });
    const ack = handler('broker.infer', {
      request: { requestId: 'infer-1' },
      sessionId: 'sess-1',
    });
    expect(ack).toEqual({ result: { accepted: true, requestId: 'infer-1' } });
    await vi.waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(2));
    expect(sent.map((item) => item.requestId)).toEqual(['infer-1', 'infer-1']);
  });

  it('falls back to the host session when the request omits sessionId', async () => {
    let posted: unknown;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      posted = JSON.parse(String(init?.body));
      return new Response(ndjson([{ event: { type: 'end' }, requestId: 'infer-2' }]), {
        status: 200,
      });
    }) as typeof fetch;
    const handler = createBrokerReverseHandler({
      credential: 'op-jwt',
      endpoint: 'https://server.test/api/agent/prime-broker',
      fetchImpl,
      log: noopLog,
      sendEvent: () => undefined,
      sessionId: 'sess-fallback',
    });
    handler('broker.infer', { request: { requestId: 'infer-2' } });
    await vi.waitFor(() => expect(posted).toBeTruthy());
    expect(posted).toMatchObject({ sessionId: 'sess-fallback' });
  });

  it('reports error+end when the broker answers a non-2xx', async () => {
    const sent: Array<{ event: { type: string }; requestId: string }> = [];
    const handler = createBrokerReverseHandler({
      credential: 'op-jwt',
      endpoint: 'https://server.test/api/agent/prime-broker',
      fetchImpl: (async () => new Response('denied', { status: 403 })) as typeof fetch,
      log: noopLog,
      sendEvent: (requestId, event) => sent.push({ event, requestId }),
      sessionId: 'sess-1',
    });
    handler('broker.infer', { request: { requestId: 'infer-3' }, sessionId: 'sess-1' });
    await vi.waitFor(() => expect(sent.length).toBe(2));
    expect(sent[0]?.event.type).toBe('error');
    expect(sent[1]?.event.type).toBe('end');
  });

  it('rejects malformed params and ignores unknown methods', () => {
    const handler = createBrokerReverseHandler({
      credential: 'op-jwt',
      endpoint: 'https://server.test/api/agent/prime-broker',
      fetchImpl: (async () => new Response('{}')) as typeof fetch,
      log: noopLog,
      sendEvent: () => undefined,
      sessionId: 'sess-1',
    });
    expect(handler('broker.infer', { request: {} })?.error?.code).toBe(-32602);
    expect(handler('broker.cancel', { requestId: 1 })?.error?.code).toBe(-32602);
    expect(handler('other.method', {})).toBeUndefined();
  });
});
