// @vitest-environment node
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { HARNESS_EVENT_NOTIFICATION } from './harnessProtocol';
import { HarnessTransport } from './harnessTransport';

const openPair = () => {
  // runner.stdout → host transport.stdout ; host stdin → transport.stdin
  const runnerToHost = new PassThrough();
  const hostToRunner = new PassThrough();
  const transport = new HarnessTransport({ stdin: hostToRunner, stdout: runnerToHost });
  return { runnerToHost, hostToRunner, transport };
};

const readFrame = async (stream: PassThrough): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.includes('\n')) {
        stream.off('data', onData);
        resolve(JSON.parse(text.trim()));
      }
    };
    stream.on('data', onData);
    stream.once('error', reject);
  });

const writeFrame = (stream: PassThrough, value: unknown): void => {
  stream.write(`${JSON.stringify(value)}\n`);
};

describe('HarnessTransport', () => {
  it('answers a forward request with the peer result', async () => {
    const { runnerToHost, hostToRunner, transport } = openPair();
    const pending = transport.request('harness.init', { protocolVersion: 1 });
    const frame = await readFrame(hostToRunner);
    expect(frame).toMatchObject({
      id: 1,
      jsonrpc: '2.0',
      method: 'harness.init',
      params: { protocolVersion: 1 },
    });
    writeFrame(runnerToHost, { id: 1, jsonrpc: '2.0', result: { ok: true } });
    await expect(pending).resolves.toEqual({ ok: true });
    transport.close();
  });

  it('fans out notifications to subscribers', async () => {
    const { runnerToHost, transport } = openPair();
    const seen: { method: string; params: unknown }[] = [];
    let second: (() => void) | undefined;
    const both = new Promise<void>((resolve) => {
      second = resolve;
    });
    transport.subscribe((n) => {
      seen.push(n);
      if (seen.length === 2) second?.();
    });
    writeFrame(runnerToHost, {
      jsonrpc: '2.0',
      method: HARNESS_EVENT_NOTIFICATION,
      params: { sessionId: 's', event: { kind: 'text', text: 'x' } },
    });
    writeFrame(runnerToHost, { jsonrpc: '2.0', method: 'bogus', params: {} });
    await both;
    expect(seen.map((n) => n.method)).toEqual([HARNESS_EVENT_NOTIFICATION, 'bogus']);
    transport.close();
  });

  it('answers allowlisted reverse requests through the handler', async () => {
    const { runnerToHost, hostToRunner, transport } = openPair();
    transport.setReverseHandler((method, params) => {
      if (method === 'broker.infer')
        return { result: { requestId: 'r1', accepted: true, echo: params } };
      return undefined;
    });
    writeFrame(runnerToHost, {
      id: 'r7',
      jsonrpc: '2.0',
      method: 'broker.infer',
      params: { a: 1 },
    });
    const response = await readFrame(hostToRunner);
    expect(response).toMatchObject({
      id: 'r7',
      result: { requestId: 'r1', accepted: true },
    });
    transport.close();
  });

  it('answers unhandled reverse requests with -32601', async () => {
    const { runnerToHost, hostToRunner, transport } = openPair();
    writeFrame(runnerToHost, { id: 9, jsonrpc: '2.0', method: 'fs/read', params: {} });
    const response = await readFrame(hostToRunner);
    expect(response).toMatchObject({
      id: 9,
      error: { code: -32601 },
    });
    transport.close();
  });

  it('rejects requests beyond the pending limit', async () => {
    const { transport } = openPair();
    const pends = [];
    for (let i = 0; i < 16; i++) pends.push(transport.request('x', {}));
    await expect(transport.request('x', {})).rejects.toThrow('request limit');
    transport.close();
    for (const p of pends) await expect(p).rejects.toThrow();
  });

  it('close settles every pending request and destroys the streams', async () => {
    const { runnerToHost, hostToRunner, transport } = openPair();
    const pending = transport.request('harness.init', {});
    transport.close();
    await expect(pending).rejects.toThrow('Harness transport unavailable');
    expect(runnerToHost.destroyed).toBe(true);
    expect(hostToRunner.destroyed).toBe(true);
  });

  it('dies on an oversized inbound frame', async () => {
    const { runnerToHost, transport } = openPair();
    const pending = transport.request('harness.init', {});
    const oversized = 'x'.repeat(1_048_577);
    runnerToHost.write(`${oversized}\n`);
    await expect(pending).rejects.toThrow('Harness transport unavailable');
    await expect(transport.request('x', {})).rejects.toThrow('closed');
    transport.close();
  });
});
