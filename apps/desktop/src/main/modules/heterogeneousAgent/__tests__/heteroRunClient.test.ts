import superjson from 'superjson';
import { describe, expect, it, vi } from 'vitest';

import { resolveInProcessAgentArgs } from '../heteroExecArgs';
import { createDesktopBuiltinToolCaller, createDesktopHeteroRunClient } from '../heteroRunClient';

vi.mock('electron', () => ({ app: { getVersion: () => '1.0.0-test' } }));

const ok = (data: unknown) =>
  new Response(JSON.stringify({ result: { data: superjson.serialize(data) } }), { status: 200 });

const trpcError = (status: number, code: string) =>
  new Response(
    JSON.stringify({ error: superjson.serialize({ data: { code }, message: `${code} failed` }) }),
    { status },
  );

describe('createDesktopHeteroRunClient', () => {
  it('matches the httpLink + superjson wire format with per-request auth', async () => {
    const fetchImpl = vi.fn(async () => ok({ ok: true }));
    const client = createDesktopHeteroRunClient({
      auth: { getAccessToken: async () => 'device-token' },
      fetchImpl: fetchImpl as any,
      serverUrl: 'https://s.example.com/',
      workspaceId: 'ws-1',
    });

    await expect(client.aiAgent.heteroIngest.mutate({ events: [] })).resolves.toEqual({
      ok: true,
    });
    await client.aiAgent.waitInterventionResponse.query({ lastEventId: '0-0', operationId: 'op' });

    const [mutationUrl, mutationInit] = fetchImpl.mock.calls[0] as any;
    expect(mutationUrl).toBe('https://s.example.com/trpc/lambda/aiAgent.heteroIngest');
    expect(mutationInit.method).toBe('POST');
    expect(JSON.parse(mutationInit.body)).toEqual(superjson.serialize({ events: [] }));
    expect(mutationInit.headers).toMatchObject({
      'Oidc-Auth': 'device-token',
      'User-Agent': 'Orvilo Desktop/1.0.0-test',
      'X-Workspace-Id': 'ws-1',
    });

    const [queryUrl, queryInit] = fetchImpl.mock.calls[1] as any;
    expect(queryInit.method).toBe('GET');
    expect(queryInit.body).toBeUndefined();
    const url = new URL(queryUrl);
    expect(url.pathname).toBe('/trpc/lambda/aiAgent.waitInterventionResponse');
    expect(JSON.parse(url.searchParams.get('input')!)).toEqual(
      superjson.serialize({ lastEventId: '0-0', operationId: 'op' }),
    );
  });

  it('refreshes the device token once on 401 and retries', async () => {
    let token = 'stale';
    const refreshAccessToken = vi.fn(async () => {
      token = 'fresh';
      return true;
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(trpcError(401, 'UNAUTHORIZED'))
      .mockResolvedValueOnce(ok('done'));
    const client = createDesktopHeteroRunClient({
      auth: { getAccessToken: async () => token, refreshAccessToken },
      fetchImpl,
      serverUrl: 'https://s',
    });

    await expect(client.aiAgent.heteroFinish.mutate({})).resolves.toBe('done');
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[1][1].headers['Oidc-Auth']).toBe('fresh');
  });

  it('surfaces the tRPC error code for the finish retry policy', async () => {
    const client = createDesktopHeteroRunClient({
      auth: { getAccessToken: async () => null },
      fallbackJwt: 'dispatch-jwt',
      fetchImpl: vi.fn(async () => trpcError(500, 'INTERNAL_SERVER_ERROR')) as any,
      serverUrl: 'https://s',
    });

    await expect(client.aiAgent.heteroFinish.mutate({})).rejects.toMatchObject({
      data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
    });
  });
});

describe('createDesktopBuiltinToolCaller', () => {
  it('authenticates each call with the current turn operation token', async () => {
    const fetchImpl = vi.fn(async () => ok({ success: true }));
    let turn: any = { operationJwt: 'op-jwt-1', serverUrl: 'https://s', workspaceId: 'ws' };
    const caller = createDesktopBuiltinToolCaller(() => turn, fetchImpl as any);

    await caller.exec({
      apiName: 'run',
      args: {},
      identifier: 'tool',
      operationId: 'op-1',
      toolCallId: 'call-1',
    });
    turn = { operationJwt: 'op-jwt-2', serverUrl: 'https://s' };
    await caller.exec({
      apiName: 'run',
      args: {},
      identifier: 'tool',
      operationId: 'op-2',
      toolCallId: 'call-2',
    });

    const headers = fetchImpl.mock.calls.map((call: any) => call[1].headers);
    expect(headers[0]).toMatchObject({ 'Oidc-Auth': 'op-jwt-1', 'X-Workspace-Id': 'ws' });
    expect(headers[1]['Oidc-Auth']).toBe('op-jwt-2');
    expect(headers[1]).not.toHaveProperty('X-Workspace-Id');
  });

  it('cancels approvals when no turn bridge is bound', async () => {
    const caller = createDesktopBuiltinToolCaller(() => undefined);
    await expect(
      caller.requestApproval!({
        apiName: 'run',
        args: {},
        identifier: 'tool',
        operationId: 'op',
        toolCallId: 'call',
      }),
    ).resolves.toEqual({ cancelReason: 'session_ended', cancelled: true });
  });
});

describe('resolveInProcessAgentArgs', () => {
  it('translates wrapper selectors and native args like hetero exec', () => {
    expect(
      resolveInProcessAgentArgs('claude-code', [
        '--agent-arg=--verbose',
        '--acp-permission-id',
        'mode',
        '--acp-permission-value',
        'plan',
        '--model',
        'opus',
        '--effort',
        'high',
      ]),
    ).toEqual({
      command: undefined,
      extraArgs: ['--verbose', '--model', 'opus', '--effort', 'high'],
      initialPermission: { configId: 'mode', value: 'plan' },
    });
    expect(resolveInProcessAgentArgs('codex', ['--effort', 'low'])?.extraArgs).toEqual([
      '-c',
      'model_reasoning_effort="low"',
    ]);
  });

  it('refuses unknown flags so the CLI keeps authority', () => {
    expect(resolveInProcessAgentArgs('claude-code', ['--raw-dump', '/tmp/x'])).toBeUndefined();
    expect(resolveInProcessAgentArgs('claude-code', ['--model'])).toBeUndefined();
  });
});
