import * as fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importRegistry = async () => {
  vi.resetModules();
  return await import('./registry');
};

const importServer = async () => {
  vi.resetModules();
  return await import('./server');
};

let stateDir: string;

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-llm-state-'));
  vi.stubEnv('E2E_MOCK_STATE_DIR', stateDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(stateDir, { force: true, recursive: true });
});

describe('resolveMockResponse', () => {
  it('returns the exact-match response for the last user message', async () => {
    const { resolveMockResponse, DEFAULT_MOCK_LLM_CONFIG } = await importRegistry();
    const state = {
      config: DEFAULT_MOCK_LLM_CONFIG,
      workers: {
        '0': { customResponseFragments: {}, customResponses: { hello: 'hi there' } },
      },
    };

    expect(
      resolveMockResponse(
        [
          { content: 'earlier', role: 'user' },
          { content: 'assistant reply', role: 'assistant' },
          { content: 'Hello', role: 'user' },
        ],
        state,
      ),
    ).toBe('hi there');
  });

  it('flattens OpenAI content-parts arrays before matching', async () => {
    const { resolveMockResponse, DEFAULT_MOCK_LLM_CONFIG } = await importRegistry();
    const state = {
      config: DEFAULT_MOCK_LLM_CONFIG,
      workers: {
        '0': { customResponseFragments: {}, customResponses: { hello: 'hi' } },
      },
    };

    expect(
      resolveMockResponse([{ content: [{ text: 'hello', type: 'text' }], role: 'user' }], state),
    ).toBe('hi');
  });

  it('falls back to fragment containment, then the default response', async () => {
    const { resolveMockResponse, DEFAULT_MOCK_LLM_CONFIG } = await importRegistry();
    const state = {
      config: { ...DEFAULT_MOCK_LLM_CONFIG, defaultResponse: 'DEFAULT' },
      workers: {
        '0': {
          customResponseFragments: { 碎片词: 'FRAGMENT' },
          customResponses: {},
        },
      },
    };

    expect(resolveMockResponse([{ content: '前缀碎片词后缀', role: 'user' }], state)).toBe(
      'FRAGMENT',
    );
    expect(resolveMockResponse([{ content: 'nothing matches', role: 'user' }], state)).toBe(
      'DEFAULT',
    );
    expect(resolveMockResponse([], state)).toBe('DEFAULT');
  });

  it('sees every worker namespace (parallel-worker merge)', async () => {
    const { resolveMockResponse, DEFAULT_MOCK_LLM_CONFIG } = await importRegistry();
    const state = {
      config: DEFAULT_MOCK_LLM_CONFIG,
      workers: {
        '0': { customResponseFragments: {}, customResponses: { a: 'A' } },
        '1': { customResponseFragments: {}, customResponses: { b: 'B' } },
      },
    };

    expect(resolveMockResponse([{ content: 'a', role: 'user' }], state)).toBe('A');
    expect(resolveMockResponse([{ content: 'b', role: 'user' }], state)).toBe('B');
  });
});

describe('worker state files', () => {
  it('persists per-worker files and merges them on read', async () => {
    const registry = await importRegistry();

    // Simulate two parallel workers writing their own files.
    fs.writeFileSync(
      path.join(stateDir, 'orvilo-e2e-llm-state.0.json'),
      JSON.stringify({
        customResponseFragments: {},
        customResponses: { 'worker-zero': 'W0' },
      }),
    );
    fs.writeFileSync(
      path.join(stateDir, 'orvilo-e2e-llm-state.1.json'),
      JSON.stringify({
        customResponseFragments: { frag: 'F1' },
        customResponses: { 'worker-one': 'W1' },
      }),
    );

    const merged = registry.readMockLLMState();
    expect(merged?.workers['0'].customResponses['worker-zero']).toBe('W0');
    expect(merged?.workers['1'].customResponseFragments['frag']).toBe('F1');
    expect(merged?.config).toEqual(registry.DEFAULT_MOCK_LLM_CONFIG);
  });

  it('returns undefined with no state and no config files', async () => {
    const { readMockLLMState } = await importRegistry();
    expect(readMockLLMState()).toBeUndefined();
  });

  it('clearAllMockLLMState removes worker files and the config file only', async () => {
    const { clearAllMockLLMState } = await importRegistry();

    fs.writeFileSync(path.join(stateDir, 'orvilo-e2e-llm-state.0.json'), '{}');
    fs.writeFileSync(path.join(stateDir, 'orvilo-e2e-llm-config.json'), '{}');
    fs.writeFileSync(path.join(stateDir, 'unrelated.json'), '{}');

    clearAllMockLLMState();

    const remaining = fs.readdirSync(stateDir);
    expect(remaining).toEqual(['unrelated.json']);
  });
});

describe('mock LLM server', () => {
  const requestJson = async (port: number, urlPath: string, body: unknown) => {
    const res = await fetch(`http://localhost:${port}${urlPath}`, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    return res;
  };

  it('answers /v1/chat/completions with a non-streamed OpenAI body', async () => {
    const registry = await importRegistry();
    registry.persistMockLLMResponses({
      customResponseFragments: {},
      customResponses: { hello: 'mocked hello reply' },
    });

    const { startMockLLMServer } = await importServer();
    const server = await startMockLLMServer(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await requestJson(port, '/v1/chat/completions', {
        messages: [{ content: 'hello', role: 'user' }],
        model: 'deepseek-v4-flash',
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.choices[0].message.content).toBe('mocked hello reply');
      expect(json.usage.total_tokens).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  });

  it('streams OpenAI SSE chunks terminated by [DONE]', async () => {
    const registry = await importRegistry();
    registry.persistMockLLMResponses({
      customResponseFragments: {},
      customResponses: { 'say hi': 'streamed reply text' },
    });

    const { startMockLLMServer } = await importServer();
    const server = await startMockLLMServer(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await requestJson(port, '/v1/chat/completions', {
        messages: [{ content: 'say hi', role: 'user' }],
        model: 'deepseek-v4-flash',
        stream: true,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const body = await res.text();
      expect(body).toContain('data: [DONE]');

      const deltas = [...body.matchAll(/^data: (.*)$/gm)]
        .map((m) => m[1])
        .filter((d) => d !== '[DONE]')
        .map((d) => JSON.parse(d) as any)
        .flatMap((chunk) => chunk.choices.map((c: any) => c.delta?.content ?? ''))
        .join('');
      expect(deltas).toBe('streamed reply text');
    } finally {
      server.close();
    }
  });

  it('synthesizes a schema-valid JSON object for response_format requests', async () => {
    const { startMockLLMServer } = await importServer();
    const server = await startMockLLMServer(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await requestJson(port, '/v1/chat/completions', {
        messages: [{ content: 'title this', role: 'user' }],
        model: 'gpt-5.6-luna',
        response_format: {
          json_schema: {
            schema: {
              properties: { summary: { type: 'string' }, title: { type: 'string' } },
              required: ['title'],
              type: 'object',
            },
          },
          type: 'json_schema',
        },
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(JSON.parse(json.choices[0].message.content)).toEqual({ title: 'e2e-title' });
    } finally {
      server.close();
    }
  });

  it('returns 503 when the mock is disabled', async () => {
    const registry = await importRegistry();
    registry.persistMockLLMConfig({
      ...registry.DEFAULT_MOCK_LLM_CONFIG,
      enabled: false,
    });

    const { startMockLLMServer } = await importServer();
    const server = await startMockLLMServer(0);
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await requestJson(port, '/v1/chat/completions', {
        messages: [{ content: 'hi', role: 'user' }],
      });
      expect(res.status).toBe(503);
    } finally {
      server.close();
    }
  });
});
