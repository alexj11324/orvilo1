// @vitest-environment node
import { PassThrough } from 'node:stream';

import type { AssistantMessageEvent, Context, Model } from '@earendil-works/pi-ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type BrokerBridge, createBrokerBridge } from './broker';
import { RunnerLink } from './ndjson';

const MODEL: Model = {
  api: 'orvilo-broker',
  baseUrl: 'orvilo-broker://local',
  contextWindow: 128_000,
  cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
  id: 'mock-model-1',
  input: ['text'],
  maxTokens: 4096,
  name: 'Orvilo Broker',
  provider: 'orvilo-broker',
  reasoning: false,
};

const context = (text: string): Context => ({
  messages: [{ role: 'user', content: text, timestamp: 0 }],
  systemPrompt: 'system line',
});

interface Harness {
  bridge: BrokerBridge;
  frames: Record<string, unknown>[];
  link: RunnerLink;
  send: (value: unknown) => void;
}

/** Wire the bridge to a real RunnerLink over in-memory streams — the frames
 * the host asserts on are exactly what the container's stdout would carry. */
const harness = (sessionId = 'session-1'): Harness => {
  const toHost = new PassThrough();
  const fromHost = new PassThrough();
  const link = new RunnerLink({ input: fromHost, output: toHost });
  const frames: Record<string, unknown>[] = [];
  let buffer = '';
  toHost.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    for (;;) {
      const end = buffer.indexOf('\n');
      if (end === -1) break;
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (line) frames.push(JSON.parse(line) as Record<string, unknown>);
    }
  });
  const bridge = createBrokerBridge(link, sessionId);
  // Runner wiring (runner.ts): broker.event notifications route to the bridge.
  link.setNotificationHandler((method, params) => {
    if (method === 'broker.event') bridge.deliverEvent(params);
  });
  return {
    bridge,
    frames,
    link,
    send: (value) => fromHost.write(`${JSON.stringify(value)}\n`),
  };
};

const collect = async (
  stream: ReturnType<BrokerBridge['streamSimple']>,
): Promise<AssistantMessageEvent[]> => {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
};

const nextInfer = async (frames: Record<string, unknown>[]) => {
  await vi.waitFor(() => {
    expect(frames.some((frame) => frame.method === 'broker.infer')).toBe(true);
  });
  return frames.find((frame) => frame.method === 'broker.infer')!;
};

const ack = (harnessRef: Harness, inferFrame: Record<string, unknown>, requestId: string) => {
  harnessRef.send({
    id: inferFrame.id,
    jsonrpc: '2.0',
    result: { requestId, accepted: true },
  });
};

const brokerEvent = (harnessRef: Harness, requestId: string, event: Record<string, unknown>) =>
  harnessRef.send({
    jsonrpc: '2.0',
    method: 'broker.event',
    params: { requestId, event },
  });

const links: RunnerLink[] = [];
const makeHarness = (sessionId?: string) => {
  const h = harness(sessionId);
  links.push(h.link);
  return h;
};

afterEach(() => {
  for (const link of links.splice(0)) link.close();
});

describe('orvilo-broker streamSimple → broker.infer wire mapping', () => {
  it('sends a sanitized request — no endpoint, headers or credentials', async () => {
    const h = makeHarness('session-9');
    const done = collect(h.bridge.streamSimple(MODEL, context('hi')));

    const infer = await nextInfer(h.frames);
    expect(infer.params).toEqual({
      sessionId: 'session-9',
      request: {
        requestId: 'infer-1',
        modelRoute: 'mock-model-1',
        maxOutputTokens: 4096,
        messages: [
          { role: 'system', content: 'system line' },
          { role: 'user', content: 'hi' },
        ],
      },
    });
    // The entire frame must be free of anything resolvable/credentialed.
    const wire = JSON.stringify(infer);
    expect(wire).not.toMatch(/http|authorization|api[-_]?key|credential|endpoint/i);

    brokerEvent(h, 'infer-1', { type: 'text', text: 'Hello ' });
    ack(h, infer, 'infer-1');
    brokerEvent(h, 'infer-1', { type: 'text', text: 'world.' });
    brokerEvent(h, 'infer-1', { type: 'usage', inputTokens: 10, outputTokens: 2 });
    brokerEvent(h, 'infer-1', { type: 'end' });

    const events = await done;
    expect(events.map((event) => event.type)).toEqual([
      'start',
      'text_start',
      'text_delta',
      'text_delta',
      'text_end',
      'done',
    ]);
    const last = events.at(-1);
    if (last?.type !== 'done') throw new Error('expected done event');
    expect(last.reason).toBe('stop');
    expect(last.message.model).toBe('mock-model-1');
    expect(last.message.content).toEqual([{ type: 'text', text: 'Hello world.' }]);
    expect(last.message.usage.input).toBe(10);
    expect(last.message.usage.output).toBe(2);
    expect(last.message.usage.totalTokens).toBe(12);
    h.bridge.abortAll();
  });

  it('honors caller maxTokens and per-call requestIds', async () => {
    const h = makeHarness();
    const first = collect(h.bridge.streamSimple(MODEL, context('a'), { maxTokens: 11 }));
    const infer = await nextInfer(h.frames);
    expect(infer.params).toMatchObject({
      request: { requestId: 'infer-1', maxOutputTokens: 11 },
    });
    ack(h, infer, 'infer-1');
    brokerEvent(h, 'infer-1', { type: 'end' });
    await first;
    h.bridge.abortAll();
  });

  it('fails the stream without emitting a request when context cannot be sanitized', async () => {
    const h = makeHarness();
    const done = collect(
      h.bridge.streamSimple(MODEL, {
        messages: [
          {
            role: 'toolResult',
            content: [{ type: 'text', text: 'result' }],
            isError: false,
            timestamp: 0,
            toolCallId: 'call-1',
            toolName: 'bash',
          },
        ],
      }),
    );
    const events = await done;
    const error = events.at(-1);
    if (error?.type !== 'error') throw new Error('expected error event');
    expect(error.reason).toBe('error');
    expect(error.error.errorMessage).toContain('broker cannot carry');
    expect(h.frames).toHaveLength(0);
  });

  it('surfaces a broker stream error as a stream error', async () => {
    const h = makeHarness();
    const done = collect(h.bridge.streamSimple(MODEL, context('hi')));
    const infer = await nextInfer(h.frames);
    ack(h, infer, 'infer-1');
    brokerEvent(h, 'infer-1', {
      type: 'error',
      code: 'revoked',
      message: 'Inference grant revoked or expired',
    });
    const events = await done;
    const last = events.at(-1);
    if (last?.type !== 'error') throw new Error('expected error event');
    expect(last.reason).toBe('error');
    expect(last.error.errorMessage).toBe('Inference grant revoked or expired');
  });

  it('fails the stream when the host rejects the broker.infer', async () => {
    const h = makeHarness();
    const done = collect(h.bridge.streamSimple(MODEL, context('hi')));
    const infer = await nextInfer(h.frames);
    h.send({
      id: infer.id,
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Inference broker unavailable' },
    });
    void infer;
    const events = await done;
    const last = events.at(-1);
    if (last?.type !== 'error') throw new Error('expected error event');
    expect(last.error.errorMessage).toContain('Runner request failed');
  });

  it('abort sends broker.cancel and ends the stream aborted', async () => {
    const h = makeHarness();
    const controller = new AbortController();
    const done = collect(
      h.bridge.streamSimple(MODEL, context('hi'), { signal: controller.signal }),
    );
    const infer = await nextInfer(h.frames);
    ack(h, infer, 'infer-1');
    brokerEvent(h, 'infer-1', { type: 'text', text: 'half' });

    controller.abort();
    await vi.waitFor(() => {
      expect(h.frames.some((frame) => frame.method === 'broker.cancel')).toBe(true);
    });
    const cancel = h.frames.find((frame) => frame.method === 'broker.cancel')!;
    expect(cancel.params).toEqual({ requestId: 'infer-1' });

    const events = await done;
    const last = events.at(-1);
    if (last?.type !== 'error') throw new Error('expected error event');
    expect(last.reason).toBe('aborted');
  });

  it('ignores broker.event traffic for unknown or malformed requestIds', async () => {
    const h = makeHarness();
    const done = collect(h.bridge.streamSimple(MODEL, context('hi')));
    const infer = await nextInfer(h.frames);
    brokerEvent(h, 'other-request', { type: 'text', text: 'stray' });
    brokerEvent(h, 'infer-1', { type: 'text' });
    ack(h, infer, 'infer-1');
    brokerEvent(h, 'infer-1', { type: 'text', text: 'kept' });
    brokerEvent(h, 'infer-1', { type: 'end' });
    const events = await done;
    const last = events.at(-1);
    if (last?.type !== 'done') throw new Error('expected done event');
    expect(last.message.content).toEqual([{ type: 'text', text: 'kept' }]);
  });

  it('abortAll ends every open stream as aborted', async () => {
    const h = makeHarness();
    const done = collect(h.bridge.streamSimple(MODEL, context('hi')));
    const infer = await nextInfer(h.frames);
    ack(h, infer, 'infer-1');
    h.bridge.abortAll();
    const events = await done;
    const last = events.at(-1);
    if (last?.type !== 'error') throw new Error('expected error event');
    expect(last.reason).toBe('aborted');
  });
});
