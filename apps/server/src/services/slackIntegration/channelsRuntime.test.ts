import { Server } from 'node:net';

import { MemoryStore } from '@copilotkit/channels-core';
import type * as ChannelsSlack from '@copilotkit/channels-slack';
import type { OrviloDatabase } from '@orvilo/database';
import type {
  CreateResponseRequest,
  ResponseStreamEvent,
} from '@orvilo/openapi/src/types/responses.type';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSlackChannelsRuntime,
  getSlackChannelsRuntime,
  type SlackChannelsDependencies,
  stopSlackChannelsRuntime,
} from './channelsRuntime';
import { SlackChannelsReceiver } from './receiver';

const mocks = vi.hoisted(() => ({
  adapters: [] as ChannelsSlack.SlackAdapter[],
  identities: [] as { userId: string; workspaceId: string }[],
  requests: [] as CreateResponseRequest[],
  responseCount: 0,
  stream: vi.fn(),
}));

vi.mock('@copilotkit/channels-slack', async (importOriginal) => {
  const original = await importOriginal<typeof ChannelsSlack>();
  return {
    ...original,
    slack: (options: Parameters<typeof original.slack>[0]) => {
      const adapter = original.slack(options);
      vi.spyOn(adapter.client.auth, 'test').mockResolvedValue({
        app_id: 'APP',
        bot_id: 'BBOT',
        ok: true,
        team_id: options.botToken === 'bot-team-2' ? 'T2' : 'T1',
        user_id: 'UBOT',
      });
      vi.spyOn(adapter.client.chat, 'postMessage').mockResolvedValue({
        channel: 'C1',
        ok: true,
        ts: '900.001',
      });
      vi.spyOn(adapter.client.chat, 'update').mockResolvedValue({ ok: true });
      mocks.adapters.push(adapter);
      return adapter;
    },
  };
});
vi.mock('@orvilo/openapi/src/services/responses.service', () => ({
  ResponsesService: class {
    constructor(_database: OrviloDatabase, userId: string, workspaceId: string) {
      mocks.identities.push({ userId, workspaceId });
    }

    createStreamingResponse = mocks.stream;
  },
}));

const installation = {
  botToken: 'bot-team-1',
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

const dependencies = (): SlackChannelsDependencies => ({
  database: {} as OrviloDatabase,
  resolveBinding: vi.fn(async () => ({ agentId: 'agent-1', workspaceId: 'workspace-1' })),
  resolveUser: vi.fn(async ({ slackUserId }) =>
    slackUserId === 'UNLINKED' ? null : { id: `orvilo-${slackUserId}` },
  ),
  store: new MemoryStore(),
});

describe('installed Channels SDK Slack runtime', () => {
  const active: Awaited<ReturnType<typeof createSlackChannelsRuntime>>[] = [];

  beforeEach(() => {
    mocks.adapters.length = 0;
    mocks.identities.length = 0;
    mocks.requests.length = 0;
    mocks.responseCount = 0;
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
    await stopSlackChannelsRuntime('T1');
    await stopSlackChannelsRuntime('T2');
    vi.restoreAllMocks();
  });

  it('uses the pinned receiver seam without binding a port and delivers real Agent output', async () => {
    const listen = vi.spyOn(Server.prototype, 'listen');
    const runtime = await createSlackChannelsRuntime(installation, dependencies());
    active.push(runtime);
    expect(listen).not.toHaveBeenCalled();

    await runtime.dispatch(envelope('100.002'));

    expect(mocks.identities).toEqual([{ userId: 'orvilo-UA', workspaceId: 'workspace-1' }]);
    expect(mocks.adapters[0].client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Actual Agent output', thread_ts: '100.001' }),
    );
  });

  it('rejects cross-tenant events, unlinked humans and forbidden bindings before execution', async () => {
    const deps = dependencies();
    const runtime = await createSlackChannelsRuntime(installation, deps);
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
    const runtime = await createSlackChannelsRuntime(installation, dependencies());
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

  it('does not start on channel chatter, and reports unsupported files without executing', async () => {
    const runtime = await createSlackChannelsRuntime(installation, dependencies());
    active.push(runtime);
    await runtime.dispatch(
      envelope('100.010', 'UA', {
        text: 'ordinary channel chatter',
        thread_ts: undefined,
        type: 'message',
      }),
    );
    await runtime.dispatch(envelope('100.011', 'UA', { files: [{ id: 'F1' }] }));

    expect(mocks.requests).toEqual([]);
    expect(mocks.adapters[0].client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('attachments are not supported') }),
    );
  });

  it('closes interrupted streams and preserves uncertainty across worker restart', async () => {
    const deps = dependencies();
    mocks.stream.mockImplementationOnce(async function* () {
      yield { response: { id: 'unfinished' }, type: 'response.created' } as ResponseStreamEvent;
      yield { delta: 'Partial output', type: 'response.output_text.delta' } as ResponseStreamEvent;
      throw new Error('upstream disconnected');
    });
    const runtime = await createSlackChannelsRuntime(installation, deps);
    await runtime.dispatch(envelope('100.012'));
    await runtime.stop();
    const restarted = await createSlackChannelsRuntime(installation, deps);
    active.push(restarted);
    await restarted.dispatch(envelope('100.013'));

    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.adapters[0].client.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('response was interrupted') }),
    );
    expect(mocks.adapters[1].client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('previous Agent run is unresolved'),
      }),
    );
  });

  it('does not settle a completed Agent run until Slack delivery succeeds', async () => {
    const runtime = await createSlackChannelsRuntime(installation, dependencies());
    active.push(runtime);
    vi.mocked(mocks.adapters[0].client.chat.postMessage).mockRejectedValueOnce(
      new Error('channel_not_found'),
    );
    await expect(runtime.dispatch(envelope('100.017'))).rejects.toThrow('channel_not_found');
    await runtime.dispatch(envelope('100.018'));

    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.adapters[0].client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('previous Agent run is unresolved'),
      }),
    );
  });

  it('rejects files in edited Slack messages even without the original delivery marker', async () => {
    const runtime = await createSlackChannelsRuntime(installation, dependencies());
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

    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.adapters[0].client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('attachments are not supported') }),
    );
  });

  it('keeps clients separate by team and replaces installations or token revisions', async () => {
    const deps = dependencies();
    const first = await getSlackChannelsRuntime(installation, deps);
    expect(await getSlackChannelsRuntime(installation, deps)).toBe(first);
    const other = await getSlackChannelsRuntime(
      { botToken: 'bot-team-2', id: 'I2', teamId: 'T2', tokenRevision: 'revision-1' },
      dependencies(),
    );
    expect(other).not.toBe(first);
    const next = await getSlackChannelsRuntime(
      { ...installation, tokenRevision: 'revision-2' },
      deps,
    );
    await expect(first.dispatch(envelope('100.014'))).rejects.toThrow('not started');
    expect(next).not.toBe(first);
    const reinstalled = await getSlackChannelsRuntime({ ...installation, id: 'I3' }, deps);
    await expect(next.dispatch(envelope('100.015'))).rejects.toThrow('not started');
    expect(reinstalled).not.toBe(next);
  });

  it('does not accept events before receiver activation', async () => {
    await expect(new SlackChannelsReceiver().dispatch(envelope('100.016'))).rejects.toThrow(
      'not started',
    );
  });
});
