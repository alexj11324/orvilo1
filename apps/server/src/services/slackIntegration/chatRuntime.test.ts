import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { Server } from 'node:net';

import { createSlackAdapter } from '@chat-adapter/slack';
import type { OrviloDatabase } from '@orvilo/database';
import type {
  CreateResponseRequest,
  ResponseStreamEvent,
} from '@orvilo/openapi/src/types/responses.type';
import type { StateAdapter } from 'chat';
import { Chat } from 'chat';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSlackChatRuntime,
  getSlackChatRuntime,
  type SlackChatDependencies,
  stopSlackChatRuntime,
} from './chatRuntime';

const mocks = vi.hoisted(() => ({
  posts: [] as Record<string, unknown>[],
  history: [] as Record<string, unknown>[],
  failPost: false,
  failUpdate: false,
  apiCall: vi.fn(),
  identities: [] as { userId: string; workspaceId: string }[],
  requests: [] as CreateResponseRequest[],
  responseCount: 0,
  attachments: [] as unknown[],
  stream: vi.fn(),
}));

vi.mock('./attachments', () => ({
  downloadSlackAttachments: vi.fn(async (_token, ids: string[]) =>
    ids.map((id) => ({ buffer: Buffer.from(id), name: id })),
  ),
}));
vi.mock('@orvilo/openapi/src/services/responses.service', () => ({
  ResponsesService: class {
    constructor(
      _database: OrviloDatabase,
      userId: string,
      workspaceId: string,
      transport?: unknown,
    ) {
      mocks.attachments.push(transport);
      mocks.identities.push({ userId, workspaceId });
    }

    createStreamingResponse = mocks.stream;
  },
}));

const installation = {
  botToken: 'bot-team-1',
  botUserId: 'UBOT',
  signingSecret: 'test-secret',
  id: 'I1',
  teamId: 'T1',
  tokenRevision: 'revision-1',
};
const envelope = (
  id: string,
  user = 'UA',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  api_app_id: 'APP',
  authorizations: [{ is_bot: true, team_id: 'T1', user_id: 'UBOT' }],
  event: {
    channel: 'C1',
    event_ts: id,
    text: '<@UBOT> hello',
    thread_ts: '100.001',
    ts: id,
    type: 'app_mention',
    user,
    ...overrides,
  },
  event_id: `event-${id}`,
  team_id: 'T1',
  type: 'event_callback',
});

const memoryState = (): StateAdapter => {
  const values = new Map<string, unknown>();
  const unsupported = async () => {
    throw new Error('Unexpected state operation in concurrent Slack runtime test');
  };
  return {
    appendToList: unsupported,
    dequeue: unsupported,
    enqueue: unsupported,
    extendLock: unsupported,
    forceReleaseLock: unsupported,
    getList: unsupported,
    queueDepth: unsupported,
    subscribe: unsupported,
    unsubscribe: unsupported,
    connect: async () => {},
    disconnect: async () => {},
    get: async <T>(key: string) => (values.get(key) as T) ?? null,
    set: async (key: string, value: unknown) => {
      values.set(key, value);
    },
    setIfNotExists: async (key: string, value: unknown) => {
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
    delete: async (key: string) => {
      values.delete(key);
    },
    isSubscribed: async () => false,
    acquireLock: async (threadId: string, ttlMs: number) => ({
      threadId,
      token: 'lock',
      expiresAt: Date.now() + ttlMs,
    }),
    releaseLock: async () => {},
  };
};

const dependencies = (): SlackChatDependencies => ({
  database: {} as OrviloDatabase,
  resolveBinding: vi.fn(async () => ({ agentId: 'agent-1', workspaceId: 'workspace-1' })),
  resolveUser: vi.fn(async ({ slackUserId }) =>
    slackUserId === 'UNLINKED' ? null : { id: `orvilo-${slackUserId}` },
  ),
  store: memoryState(),
});

// The real SDK WebClient talks only to this disposable HTTP provider boundary.
const provider = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += String(chunk);
  const method = request.url?.split('/').at(-1);
  const result = await mocks.apiCall(method, Object.fromEntries(new URLSearchParams(body)));
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(result));
});
beforeAll(async () => {
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  if (!address || typeof address === 'string') throw new Error('Missing test provider port');
  vi.stubEnv('SLACK_API_URL', `http://127.0.0.1:${address.port}/api/`);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve, reject) =>
    provider.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('installed public Chat SDK Slack runtime', () => {
  const active: Awaited<ReturnType<typeof createSlackChatRuntime>>[] = [];

  beforeEach(() => {
    mocks.posts.length = 0;
    mocks.history.length = 0;
    mocks.failPost = false;
    mocks.failUpdate = false;
    mocks.apiCall.mockImplementation(async (method: string, options: Record<string, unknown>) => {
      if (method === 'auth.test') return { ok: true, user_id: 'UBOT', team_id: 'T1' };
      if (method === 'chat.postMessage') {
        if (!String(options.markdown_text ?? options.text ?? '').trim() && !options.blocks)
          return { ok: false, error: 'no_text' };
        if (mocks.failPost) {
          mocks.failPost = false;
          return { ok: false, error: 'channel_not_found' };
        }
        mocks.posts.push(options ?? {});
        return { ok: true, channel: 'C1', ts: '900.001' };
      }
      if (method === 'chat.update') {
        if (mocks.failUpdate) {
          mocks.failUpdate = false;
          return { ok: false, error: 'update_failed' };
        }
        mocks.posts.push(options ?? {});
        return { ok: true, channel: 'C1', ts: '900.001' };
      }
      if (method === 'conversations.replies' && !options.ts)
        return { ok: false, error: 'invalid_arguments' };
      if (method === 'conversations.replies' || method === 'conversations.history')
        return { ok: true, messages: mocks.history, has_more: false };
      if (method === 'users.info') return { ok: true, user: { id: 'UB', name: 'teammate' } };
      return { ok: true };
    });
    mocks.identities.length = 0;
    mocks.requests.length = 0;
    mocks.responseCount = 0;
    mocks.attachments.length = 0;
    mocks.stream.mockReset();
    mocks.stream.mockImplementation(async function* (request: CreateResponseRequest) {
      mocks.requests.push(request);
      const id = `response-${++mocks.responseCount}`;
      yield { response: { id }, type: 'response.created' } as ResponseStreamEvent;
      yield {
        delta: 'Actual Agent output',
        type: 'response.output_text.delta',
      } as ResponseStreamEvent;
      yield { response: { id }, type: 'response.completed' } as ResponseStreamEvent;
    });
  });

  afterEach(async () => {
    await Promise.all(active.splice(0).map((runtime) => runtime.stop()));
    await stopSlackChatRuntime('T1');
    await stopSlackChatRuntime('T2');
    vi.restoreAllMocks();
  });

  it('parses an authentic signed HTTP event through the public SDK webhook API', async () => {
    const adapter = createSlackAdapter({
      botToken: 'test-token',
      botUserId: 'UBOT',
      signingSecret: 'test-secret',
    });
    const bot = new Chat({
      userName: 'Orvilo',
      adapters: { slack: adapter },
      state: memoryState(),
    });
    const received: string[] = [];
    bot.onNewMention(async (_thread, message) => {
      received.push(message.author.userId);
    });
    await bot.initialize();
    try {
      const raw = JSON.stringify(envelope('99.001'));
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = `v0=${createHmac('sha256', 'test-secret').update(`v0:${timestamp}:${raw}`).digest('hex')}`;
      const request = (signed: boolean) =>
        new Request('https://orvilo.test/api/webhooks/slack', {
          method: 'POST',
          body: raw,
          headers: {
            'content-type': 'application/json',
            'x-slack-signature': signed ? signature : 'v0=invalid',
            'x-slack-request-timestamp': timestamp,
          },
        });
      expect((await bot.webhooks.slack(request(false))).status).toBe(401);
      expect(received).toEqual([]);
      const work: Promise<unknown>[] = [];
      expect(
        (
          await bot.webhooks.slack(request(true), {
            waitUntil: (task) => {
              work.push(task);
            },
            propagateHandlerErrors: true,
          })
        ).status,
      ).toBe(200);
      await Promise.all(work);
      expect(received).toEqual(['UA']);
    } finally {
      await bot.shutdown();
    }
  });

  it('uses public SDK parsing without binding a port and delivers Agent output', async () => {
    const listen = vi.spyOn(Server.prototype, 'listen');
    const runtime = await createSlackChatRuntime(installation, dependencies());
    active.push(runtime);
    expect(listen).not.toHaveBeenCalled();

    await runtime.dispatch(envelope('100.002'));

    expect(mocks.identities).toEqual([{ userId: 'orvilo-UA', workspaceId: 'workspace-1' }]);
    expect(mocks.posts).toContainEqual(
      expect.objectContaining({ markdown_text: 'Actual Agent output', thread_ts: '100.001' }),
    );
  });

  it('rejects cross-tenant events, unlinked humans and forbidden bindings before execution', async () => {
    const deps = dependencies();
    const runtime = await createSlackChatRuntime(installation, deps);
    active.push(runtime);

    await expect(runtime.dispatch({ ...envelope('100.003'), team_id: 'T2' })).rejects.toThrow(
      'installation',
    );
    await runtime.dispatch(envelope('100.004', 'UNLINKED'));
    vi.mocked(deps.resolveBinding).mockResolvedValueOnce(null);
    await runtime.dispatch(envelope('100.005'));

    expect(mocks.requests).toEqual([]);
  });

  it('deduplicates repeated mention deliveries and isolates continuation topics per human', async () => {
    const runtime = await createSlackChatRuntime(installation, dependencies());
    active.push(runtime);
    await runtime.dispatch(envelope('100.006'));
    await runtime.dispatch(envelope('100.006'));
    // Another human cannot start a conversation merely by replying to somebody else's thread.
    await runtime.dispatch(envelope('100.007', 'UB', { text: 'plain reply', type: 'message' }));
    await runtime.dispatch(envelope('100.008', 'UB'));
    await runtime.dispatch(envelope('100.009', 'UA', { text: 'continue', type: 'message' }));

    expect(mocks.requests.map((request) => request.previous_response_id)).toEqual([
      undefined,
      undefined,
      'response-1',
    ]);
    expect(mocks.identities.map((identity) => identity.userId)).toEqual([
      'orvilo-UA',
      'orvilo-UB',
      'orvilo-UA',
    ]);
  });

  it('does not start on channel chatter, and retains directly uploaded files', async () => {
    const runtime = await createSlackChatRuntime(installation, dependencies());
    active.push(runtime);
    await runtime.dispatch(
      envelope('100.010', 'UA', {
        text: 'ordinary channel chatter',
        thread_ts: undefined,
        type: 'message',
      }),
    );
    await runtime.dispatch(envelope('100.011', 'UA', { files: [{ id: 'F1' }] }));

    expect(mocks.requests).toHaveLength(1);
    expect(mocks.requests[0].instructions).toContain('intakeIssue');
    expect(mocks.attachments[0]).toMatchObject({ files: [{ name: 'F1' }] });
  });

  it('retains current-thread discussion without borrowing another author execution identity', async () => {
    const runtime = await createSlackChatRuntime(installation, dependencies());
    active.push(runtime);
    mocks.history.push({ text: 'Discussion from a teammate', user: 'UB', ts: '105.000' });
    await runtime.dispatch(envelope('105.001', 'UA'));
    expect(mocks.requests[0].input).toContain('Discussion from a teammate');
    expect(mocks.identities).toEqual([{ userId: 'orvilo-UA', workspaceId: 'workspace-1' }]);
  });

  it('isolates the same human across Slack threads and applies channel and DM source rules', async () => {
    const runtime = await createSlackChatRuntime(installation, dependencies());
    active.push(runtime);
    await runtime.dispatch(envelope('102.001'));
    await runtime.dispatch(envelope('102.002', 'UA', { thread_ts: '101.001' }));
    await runtime.dispatch(
      envelope('102.003', 'UA', {
        channel: 'D1',
        thread_ts: '103.001',
        type: 'message',
        text: 'hello',
      }),
    );
    expect(mocks.requests.map((request) => request.previous_response_id)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(
      mocks.requests.every((request) => request.instructions?.includes('readable Issue sessions')),
    ).toBe(true);
  });

  it('answers only the native request token bound to this thread without starting another user run', async () => {
    const deps = dependencies();
    deps.resolvePendingReply = vi.fn(async () => ({
      operationId: 'original-operation',
      toolCallId: 'native-call',
      toolMessageId: 'native-card',
      windowId: 'window-1',
      taskId: 'linked-issue',
      topicId: 'issue-run',
      deadline: Date.now() + 60000,
      interactionKind: 'permission' as const,
      prompt: 'Native permission',
      questions: [],
      options: [{ id: 'native-allow-once', label: 'Allow once' }],
    }));
    deps.issueUrl = vi.fn(async () => 'https://orvilo.test/workspace/task/linked-issue');
    deps.submitReply = vi.fn(async () => ({ success: true }));
    const runtime = await createSlackChatRuntime(installation, deps);
    active.push(runtime);
    await runtime.dispatch(envelope('104.001'));
    const text = mocks.posts
      .map((post) => post.text as string)
      .find((value) => value?.includes('Reply with:'))!;
    const token = /reply ([\w-]+)/.exec(text)![1];
    await runtime.dispatch(
      envelope('104.002', 'UB', {
        thread_ts: 'other-thread',
        text: `reply ${token} native-allow-once`,
      }),
    );
    expect(deps.submitReply).not.toHaveBeenCalled();
    await runtime.dispatch(
      envelope('104.003', 'UB', { text: `<@UBOT> reply ${token} native-allow-once` }),
    );
    expect(deps.submitReply).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'orvilo-UB',
        sourceTopicId: 'response-1',
        topicId: 'issue-run',
        operationId: 'original-operation',
        optionId: 'native-allow-once',
        windowId: 'window-1',
      }),
    );
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.posts.at(-1)?.text).toContain('https://orvilo.test/workspace/task/linked-issue');
  });

  it('closes interrupted streams and preserves uncertainty across worker restart', async () => {
    const deps = dependencies();
    mocks.stream.mockImplementationOnce(async function* () {
      yield { response: { id: 'unfinished' }, type: 'response.created' } as ResponseStreamEvent;
      yield { delta: 'Partial output', type: 'response.output_text.delta' } as ResponseStreamEvent;
      throw new Error('upstream disconnected');
    });
    const runtime = await createSlackChatRuntime(installation, deps);
    await runtime.dispatch(envelope('100.012'));
    await runtime.stop();
    const restarted = await createSlackChatRuntime(installation, deps);
    active.push(restarted);
    await restarted.dispatch(envelope('100.013'));

    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(
      mocks.posts.some((post) => String(post.markdown_text).includes('response was interrupted')),
    ).toBe(true);
    expect(mocks.posts.at(-1)?.text).toContain('previous Agent run is unresolved');
  });

  it('does not settle a completed Agent run until Slack delivery succeeds', async () => {
    const runtime = await createSlackChatRuntime(installation, dependencies());
    active.push(runtime);
    mocks.failPost = true;
    await expect(runtime.dispatch(envelope('100.017'))).rejects.toThrow('channel_not_found');
    await runtime.dispatch(envelope('100.018'));

    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.posts.at(-1)?.text).toContain('previous Agent run is unresolved');
  });

  it.each([false, true])(
    'delivers actual completed ACP output once when live text deltas are %s',
    async (hasDeltas) => {
      const deps = dependencies();
      const text = 'Actual completed native assistant output';
      mocks.stream.mockImplementationOnce(async function* () {
        yield {
          response: { id: 'native-response' },
          type: 'response.created',
        } as ResponseStreamEvent;
        if (hasDeltas)
          yield { delta: text, type: 'response.output_text.delta' } as ResponseStreamEvent;
        yield {
          response: { id: 'native-response', output_text: text },
          type: 'response.completed',
        } as ResponseStreamEvent;
      });
      const runtime = await createSlackChatRuntime(installation, deps);
      active.push(runtime);

      await runtime.dispatch(envelope('100.021'));

      expect(mocks.posts).toHaveLength(1);
      expect(mocks.posts[0].markdown_text).toBe(text);
      expect(mocks.stream).toHaveBeenCalledTimes(1);
      expect(
        await deps.store.get('response:["I1","C1::100.001","orvilo-UA","workspace-1","agent-1"]'),
      ).toEqual({ pending: false, responseId: 'native-response' });
    },
  );

  it.each(['original-redelivery', 'different-new-input'])(
    'recovers a pending completed reply without consuming %s as a new run',
    async (text) => {
      const deps = dependencies();
      const key = 'response:["I1","C1::100.001","orvilo-UA","workspace-1","agent-1"]';
      await deps.store.set(key, { pending: true, responseId: 'completed-topic' });
      deps.resolveCompletedResponse = vi.fn(async () => 'Actual previous native answer');
      const runtime = await createSlackChatRuntime(installation, deps);
      active.push(runtime);

      await runtime.dispatch(envelope('100.022', 'UA', { text: `<@UBOT> ${text}` }));

      expect(mocks.stream).not.toHaveBeenCalled();
      expect(deps.resolveCompletedResponse).toHaveBeenCalledWith({
        agentId: 'agent-1',
        responseId: 'completed-topic',
        userId: 'orvilo-UA',
        workspaceId: 'workspace-1',
      });
      expect(mocks.posts).toHaveLength(1);
      expect(mocks.posts[0].markdown_text).toContain('Actual previous native answer');
      expect(mocks.posts[0].markdown_text).toContain(
        'No new Agent run was started for this message.',
      );
      expect(await deps.store.get(key)).toEqual({ pending: false, responseId: 'completed-topic' });
    },
  );

  it('retains pending completion when recovered Slack delivery fails', async () => {
    const deps = dependencies();
    const key = 'response:["I1","C1::100.001","orvilo-UA","workspace-1","agent-1"]';
    const previous = { pending: true, responseId: 'completed-topic' };
    await deps.store.set(key, previous);
    deps.resolveCompletedResponse = vi.fn(async () => 'Actual previous native answer');
    const runtime = await createSlackChatRuntime(installation, deps);
    active.push(runtime);
    mocks.failPost = true;

    await expect(runtime.dispatch(envelope('100.023'))).rejects.toThrow('channel_not_found');

    expect(mocks.stream).not.toHaveBeenCalled();
    expect(await deps.store.get(key)).toEqual(previous);
  });

  it.each([null, '', '   '])(
    'keeps unresolved or unreadable prior replies pending (%s)',
    async (text) => {
      const deps = dependencies();
      const key = 'response:["I1","C1::100.001","orvilo-UA","workspace-1","agent-1"]';
      const previous = { pending: true, responseId: 'pending-topic' };
      await deps.store.set(key, previous);
      deps.resolveCompletedResponse = vi.fn(async () => text);
      const runtime = await createSlackChatRuntime(installation, deps);
      active.push(runtime);

      await runtime.dispatch(envelope('100.024'));

      expect(mocks.stream).not.toHaveBeenCalled();
      expect(mocks.posts.at(-1)?.text).toContain('previous Agent run is unresolved');
      expect(await deps.store.get(key)).toEqual(previous);
    },
  );

  it('retains files in edited Slack messages without the original delivery marker', async () => {
    const runtime = await createSlackChatRuntime(installation, dependencies());
    active.push(runtime);
    await runtime.dispatch(
      envelope('100.020', 'UA', {
        message: {
          edited: { ts: '100.020', user: 'UA' },
          files: [{ id: 'F2' }],
          text: '<@UBOT> updated file prompt',
          thread_ts: '100.001',
          ts: '100.019',
          user: 'UA',
        },
        previous_message: { text: '<@UBOT> old file prompt', ts: '100.019', user: 'UA' },
        subtype: 'message_changed',
        type: 'message',
      }),
    );

    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });

  it('keeps clients separate by team and replaces installations or token revisions', async () => {
    const deps = dependencies();
    const first = await getSlackChatRuntime(installation, () => deps);
    expect(await getSlackChatRuntime(installation, () => deps)).toBe(first);
    const other = await getSlackChatRuntime(
      { ...installation, botToken: 'bot-team-2', id: 'I2', teamId: 'T2' },
      () => dependencies(),
    );
    expect(other).not.toBe(first);
    const next = await getSlackChatRuntime(
      { ...installation, tokenRevision: 'revision-2' },
      () => deps,
    );
    await expect(first.dispatch(envelope('100.014'))).rejects.toThrow('not started');
    expect(next).not.toBe(first);
    const reinstalled = await getSlackChatRuntime({ ...installation, id: 'I3' }, () => deps);
    await expect(next.dispatch(envelope('100.015'))).rejects.toThrow('not started');
    expect(reinstalled).not.toBe(next);
  });

  it('keeps concurrent installations on their own token and response state', async () => {
    const first = await createSlackChatRuntime(installation, dependencies());
    const otherDeps = dependencies();
    vi.mocked(otherDeps.resolveBinding).mockResolvedValue({
      agentId: 'agent-2',
      workspaceId: 'workspace-2',
    });
    const other = await createSlackChatRuntime(
      { ...installation, id: 'I2', teamId: 'T2', botToken: 'bot-team-2' },
      otherDeps,
    );
    active.push(first, other);
    await Promise.all([
      first.dispatch(envelope('107.001')),
      other.dispatch({ ...envelope('107.001'), team_id: 'T2' }),
    ]);
    expect(mocks.identities.map(({ workspaceId }) => workspaceId).sort()).toEqual([
      'workspace-1',
      'workspace-2',
    ]);
    expect(
      mocks.posts
        .filter((post) => post.markdown_text)
        .map((post) => post.token)
        .sort(),
    ).toEqual(['bot-team-1', 'bot-team-2']);
    expect(mocks.requests.map((request) => request.model).sort()).toEqual(['agent-1', 'agent-2']);
  });

  it('continues unthreaded DMs across messages while keeping explicit DM threads separate', async () => {
    const runtime = await createSlackChatRuntime(installation, dependencies());
    active.push(runtime);
    const direct = {
      channel: 'D1',
      channel_type: 'im',
      thread_ts: undefined,
      type: 'message',
      text: 'hello',
    };
    await runtime.dispatch(envelope('108.001', 'UA', direct));
    await runtime.dispatch(envelope('108.002', 'UA', direct));
    await runtime.dispatch(envelope('108.003', 'UA', { ...direct, thread_ts: '108.001' }));
    expect(mocks.requests.map((request) => request.previous_response_id)).toEqual([
      undefined,
      'response-1',
      undefined,
    ]);
    const historyCalls = mocks.apiCall.mock.calls.filter(
      ([method]) => method === 'conversations.history',
    );
    const replyCalls = mocks.apiCall.mock.calls.filter(
      ([method]) => method === 'conversations.replies',
    );
    expect(historyCalls).toHaveLength(2);
    expect(historyCalls.every(([, args]) => args.channel === 'D1')).toBe(true);
    expect(replyCalls).toHaveLength(1);
    expect(replyCalls[0][1].ts).toBe('108.001');
  });

  it('keeps final Slack update failures unresolved', async () => {
    const deps = dependencies();
    const runtime = await createSlackChatRuntime(installation, deps);
    active.push(runtime);
    mocks.stream.mockImplementationOnce(async function* () {
      yield { type: 'response.created', response: { id: 'update-run' } } as ResponseStreamEvent;
      yield { type: 'response.output_text.delta', delta: 'First' } as ResponseStreamEvent;
      yield { type: 'response.output_text.delta', delta: ' second' } as ResponseStreamEvent;
      yield { type: 'response.completed', response: { id: 'update-run' } } as ResponseStreamEvent;
    });
    mocks.failUpdate = true;
    await expect(runtime.dispatch(envelope('106.001'))).rejects.toThrow('update_failed');
    await runtime.dispatch(envelope('106.002'));
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.posts.at(-1)?.text).toContain('previous Agent run is unresolved');
  });
});
