/**
 * Mock OpenAI-compatible LLM server for E2E.
 *
 * After the browser-side client runtime was retired, agent sends run through
 * the server-side agent runtime (gateway mode). The runtime's model call is a
 * real HTTP request to the configured provider — in E2E `DEEPSEEK_PROXY_URL`
 * points at this server so `chat/completions` returns canned SSE responses
 * driven by the same registry as `llmMockManager` (via the shared state file
 * in ./registry.ts).
 *
 * Served endpoints:
 *  - GET  /health                 — readiness probe for CI/local setup
 *  - GET  /v1/models              — minimal model list
 *  - POST /v1/chat/completions    — OpenAI SSE stream (`stream: true`) or JSON
 *  - POST /chat/completions       — same, for clients that omit the /v1 prefix
 */
import * as http from 'node:http';

import {
  DEFAULT_MOCK_LLM_CONFIG,
  MOCK_LLM_PORT,
  type MockLLMChatMessage,
  type MockLLMState,
  readMockLLMState,
  resolveMockResponse,
} from './registry';

const FALLBACK_STATE: MockLLMState = {
  config: DEFAULT_MOCK_LLM_CONFIG,
  workers: {},
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const openAiChunk = (id: string, model: string, delta: Record<string, unknown>) =>
  `data: ${JSON.stringify({
    choices: [{ delta, finish_reason: null, index: 0 }],
    created: Math.floor(Date.now() / 1000),
    id,
    model,
    object: 'chat.completion.chunk',
  })}\n\n`;

const writeChatCompletions = async (
  res: http.ServerResponse,
  body: { messages?: MockLLMChatMessage[]; model?: string; stream?: boolean },
): Promise<void> => {
  const state = readMockLLMState() ?? FALLBACK_STATE;
  const messages = body.messages ?? [];
  const model = body.model ?? 'deepseek-v4-flash';
  const content = resolveMockResponse(messages, state);
  const id = `chatcmpl-e2e-${Date.now()}`;

  if (!state.config.enabled) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'E2E LLM mock disabled', type: 'mock_disabled' } }));
    return;
  }

  await sleep(state.config.responseDelay);

  if (body.stream) {
    res.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
    });

    res.write(openAiChunk(id, model, { role: 'assistant' }));

    const size = Math.max(1, state.config.streamChunkSize);
    for (let i = 0; i < content.length; i += size) {
      res.write(openAiChunk(id, model, { content: content.slice(i, i + size) }));
      if (i + size < content.length) await sleep(state.config.streamDelay);
    }

    // Final chunk: finish_reason + usage (OpenAI `stream_options.include_usage`
    // contract emits one last data frame before [DONE]).
    res.write(
      `data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
        created: Math.floor(Date.now() / 1000),
        id,
        model,
        object: 'chat.completion.chunk',
        usage: {
          completion_tokens: Math.ceil(content.length / 4),
          prompt_tokens: 10,
          total_tokens: 10 + Math.ceil(content.length / 4),
        },
      })}\n\n`,
    );
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      choices: [
        {
          finish_reason: 'stop',
          index: 0,
          message: { content, role: 'assistant' },
        },
      ],
      created: Math.floor(Date.now() / 1000),
      id,
      model,
      object: 'chat.completion',
      usage: {
        completion_tokens: Math.ceil(content.length / 4),
        prompt_tokens: 10,
        total_tokens: 10 + Math.ceil(content.length / 4),
      },
    }),
  );
};

const readBody = async (req: http.IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

export const createMockLLMServer = (): http.Server =>
  http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }

    if (req.method === 'GET' && (path === '/v1/models' || path === '/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: [
            { id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' },
            { id: 'deepseek-v4-pro', object: 'model', owned_by: 'deepseek' },
          ],
          object: 'list',
        }),
      );
      return;
    }

    if (
      req.method === 'POST' &&
      (path === '/v1/chat/completions' || path === '/chat/completions')
    ) {
      void (async () => {
        try {
          const raw = await readBody(req);
          const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          await writeChatCompletions(res, body);
        } catch (error) {
          console.error('[e2e-llm-mock] request failed:', error);
          if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: String(error), type: 'mock_error' } }));
        }
      })();
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `Unknown mock path: ${req.method} ${path}` } }));
  });

export const startMockLLMServer = (port = MOCK_LLM_PORT): Promise<http.Server> =>
  new Promise((resolve, reject) => {
    const server = createMockLLMServer();
    server.once('error', reject);
    server.listen(port, () => {
      console.log(`[e2e-llm-mock] OpenAI-compatible mock listening on :${port}`);
      resolve(server);
    });
  });
