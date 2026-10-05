import { EventEmitter } from 'node:events';
import type * as nodeFs from 'node:fs';

import type { HarnessSessionEvent } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import type { PrimeDeviceRun } from '@orvilo/device-prime-host';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { openPrimeDeviceRunMock } = vi.hoisted(() => ({ openPrimeDeviceRunMock: vi.fn() }));
vi.mock('@orvilo/device-prime-host', () => ({
  openPrimeDeviceRun: openPrimeDeviceRunMock,
}));

const { saveTaskMock } = vi.hoisted(() => ({ saveTaskMock: vi.fn() }));
vi.mock('../daemon/taskRegistry', () => ({
  getTask: vi.fn(),
  removeTask: vi.fn(),
  saveTask: saveTaskMock,
}));

const { registerAgentRunMock } = vi.hoisted(() => ({ registerAgentRunMock: vi.fn() }));
vi.mock('./agentRunRegistry', () => ({
  cancelAgentRun: vi.fn(),
  getAgentRun: vi.fn(),
  registerAgentRun: registerAgentRunMock,
}));

const { finishCalls } = vi.hoisted(() => ({
  finishCalls: [] as Array<{
    error?: { message: string; type: string };
    result: string;
    resumeSessionInvalidated?: boolean;
    sessionId?: string;
  }>,
}));
vi.mock('../utils/TrpcIngestSink', () => ({
  TrpcIngestSink: vi.fn().mockImplementation(function () {
    return {
      finish: async (params: (typeof finishCalls)[number]) => {
        finishCalls.push(params);
      },
      ingest: async () => undefined,
    };
  }),
}));
const { pushedEvents } = vi.hoisted(() => ({
  pushedEvents: [] as Array<{ data: any; type: string }>,
}));
vi.mock('../utils/CoalescingBatchIngester', () => ({
  CoalescingBatchIngester: vi.fn().mockImplementation(function () {
    return {
      drain: async () => undefined,
      push: (event: { data: any; type: string }) => {
        pushedEvents.push({ data: event.data, type: event.type });
      },
    };
  }),
}));
vi.mock('../api/client', () => ({ createLambdaClient: vi.fn(() => ({})) }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof nodeFs>();
  return { ...actual, existsSync: vi.fn(() => true), mkdirSync: vi.fn() };
});

const { admitPrimeDeviceRun, waitPrimeSessionIdle } = await import('./primeRun');
type SpawnParams = Parameters<typeof admitPrimeDeviceRun>[0];

/** Controllable fake of the runner-side event queue (mirrors the host's). */
const makeFakeRun = (sessionId: string) => {
  const queue: HarnessSessionEvent[] = [];
  const waiters: Array<() => void> = [];
  let streamClosed = false;
  let leaseLapsed = false;
  const push = (event: HarnessSessionEvent) => {
    queue.push(event);
    for (const wake of waiters.splice(0)) wake();
  };
  const run = {
    abort: vi.fn(async () => undefined),
    activation: {
      artifact: { bytes: 1, commit: 'c', license: 'MIT', sha256: 'x', version: '1' },
      sessionId,
      supervisorId: 'test',
      treeId: 'pg-1',
    },
    child: Object.assign(new EventEmitter(), { pid: 4242 }),
    events: {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            for (;;) {
              const event = queue.shift();
              if (event !== undefined) return { done: false, value: event };
              if (streamClosed) return { done: true, value: undefined };
              await new Promise<void>((resolve) => waiters.push(resolve));
            }
          },
        };
      },
    },
    kill: vi.fn(async () => undefined),
    leaseExpired: new Promise<void>(() => undefined),
    pendingEvents: () => queue.length,
    prompt: vi.fn(async (_text: string) => {
      push({ kind: 'text', text: 'turn output' });
      return { ok: true, value: { stopReason: 'end_turn' } };
    }),
    reactivate: vi.fn(async () => ({ ok: true, value: undefined })),
    renewLease: vi.fn(),
    get closed() {
      return streamClosed;
    },
    get leaseLapsed() {
      return leaseLapsed;
    },
  };
  return {
    push,
    run: run as unknown as PrimeDeviceRun,
    runImpl: run,
    setLeaseLapsed: (value: boolean) => {
      leaseLapsed = value;
    },
    close: () => {
      streamClosed = true;
      for (const wake of waiters.splice(0)) wake();
    },
  };
};

const params = (overrides: Partial<SpawnParams> = {}): SpawnParams => ({
  agentType: 'orvilo',
  jwt: 'jwt',
  operationId: 'op-1',
  prime: {
    artifact: { bytes: 1, commit: 'c', license: 'MIT', sha256: 'x', version: '1' },
    broker: { credential: 'cred' },
    lease: { ttlMs: 60_000 },
    model: { id: 'm', maxOutputTokens: 1024 },
    subject: { kind: 'conversation', topicId: 'topic-1' },
  },
  prompt: 'do the thing',
  serverUrl: 'http://server',
  systemContext: 'ctx',
  topicId: 'topic-1',
  ...overrides,
});

describe('admitPrimeDeviceRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    finishCalls.length = 0;
    pushedEvents.length = 0;
  });
  afterEach(() => vi.clearAllMocks());

  it('reuses the live session when resumeSessionId matches instead of spawning', async () => {
    const first = makeFakeRun('sess-1');
    openPrimeDeviceRunMock.mockResolvedValue({ ok: true, value: first.run });

    await expect(
      admitPrimeDeviceRun(params({ operationId: 'op-1' }), '/tmp/work'),
    ).resolves.toEqual({ status: 'accepted' });
    await waitPrimeSessionIdle('sess-1');
    expect(openPrimeDeviceRunMock).toHaveBeenCalledTimes(1);

    await expect(
      admitPrimeDeviceRun(params({ operationId: 'op-2', resumeSessionId: 'sess-1' }), '/tmp/work'),
    ).resolves.toEqual({ status: 'accepted' });
    await waitPrimeSessionIdle('sess-1');

    // Same runner, re-activated under op-2's credential — no second spawn.
    expect(openPrimeDeviceRunMock).toHaveBeenCalledTimes(1);
    expect(first.runImpl.reactivate).toHaveBeenCalledWith('cred');
    expect(finishCalls).toHaveLength(2);
    expect(finishCalls[1].result).toBe('success');
    expect(finishCalls[1].resumeSessionInvalidated).toBeUndefined();
  });

  it('rebuilds explicitly when the resume session is dead', async () => {
    const first = makeFakeRun('sess-1');
    const second = makeFakeRun('sess-2');
    openPrimeDeviceRunMock
      .mockResolvedValueOnce({ ok: true, value: first.run })
      .mockResolvedValueOnce({ ok: true, value: second.run });

    await admitPrimeDeviceRun(params({ operationId: 'op-1' }), '/tmp/work');
    await waitPrimeSessionIdle('sess-1');
    first.close(); // runner exits after the turn — session is dead
    await vi.waitFor(() => {
      /* pump teardown */
    });

    await expect(
      admitPrimeDeviceRun(
        params({
          operationId: 'op-2',
          resumeFallbackSystemContext: 'history-fallback',
          resumeSessionId: 'sess-1',
        }),
        '/tmp/work',
      ),
    ).resolves.toEqual({ status: 'accepted' });
    await waitPrimeSessionIdle('sess-2');

    expect(openPrimeDeviceRunMock).toHaveBeenCalledTimes(2);
    // The dead pointer is cleared server-side via the finish receipt.
    const last = finishCalls.at(-1);
    expect(last?.result).toBe('success');
    expect(last?.resumeSessionInvalidated).toBe(true);
    expect(last?.sessionId).toBe('sess-2');
    // The fallback context carried the turn's prompt.
    expect(second.runImpl.prompt).toHaveBeenCalledWith(expect.stringContaining('history-fallback'));
  });

  it('invalidates the session pointer when a resumed op settles error', async () => {
    // ROOT CAUSE: only `rebuilt` cleared the pointer — an errored resumed op
    // left the topic TRAPPED on the same broken session forever.
    const first = makeFakeRun('sess-1');
    const second = makeFakeRun('sess-2');
    openPrimeDeviceRunMock
      .mockResolvedValueOnce({ ok: true, value: first.run })
      .mockResolvedValueOnce({ ok: true, value: second.run });

    await admitPrimeDeviceRun(params({ operationId: 'op-1' }), '/tmp/work');
    await waitPrimeSessionIdle('sess-1');

    // The resumed turn fails (e.g. its bound credential got 403s).
    first.runImpl.prompt.mockResolvedValue({ ok: true, value: { stopReason: 'error' } });
    await expect(
      admitPrimeDeviceRun(params({ operationId: 'op-2', resumeSessionId: 'sess-1' }), '/tmp/work'),
    ).resolves.toEqual({ status: 'accepted' });
    await waitPrimeSessionIdle('sess-1');

    // Pointer invalidated like the rebuilt path + the session is dead locally.
    const errored = finishCalls.at(-1);
    expect(errored?.result).toBe('error');
    expect(errored?.resumeSessionInvalidated).toBe(true);
    expect(first.runImpl.kill).toHaveBeenCalled();

    // The next turn must NOT resume the trapped session — it rebuilds.
    await expect(
      admitPrimeDeviceRun(params({ operationId: 'op-3', resumeSessionId: 'sess-1' }), '/tmp/work'),
    ).resolves.toEqual({ status: 'accepted' });
    await waitPrimeSessionIdle('sess-2');
    expect(openPrimeDeviceRunMock).toHaveBeenCalledTimes(2);
    expect(second.runImpl.reactivate).not.toHaveBeenCalled();
    expect(finishCalls.at(-1)?.sessionId).toBe('sess-2');
  });

  it('drops the session when reactivation is refused', async () => {
    const first = makeFakeRun('sess-1');
    const second = makeFakeRun('sess-2');
    openPrimeDeviceRunMock
      .mockResolvedValueOnce({ ok: true, value: first.run })
      .mockResolvedValueOnce({ ok: true, value: second.run });

    await admitPrimeDeviceRun(params({ operationId: 'op-1' }), '/tmp/work');
    await waitPrimeSessionIdle('sess-1');

    first.runImpl.reactivate.mockResolvedValue({ ok: false, error: { message: 'refused' } });
    await expect(
      admitPrimeDeviceRun(params({ operationId: 'op-2', resumeSessionId: 'sess-1' }), '/tmp/work'),
    ).resolves.toMatchObject({ reason: 'refused', status: 'rejected' });
    expect(first.runImpl.kill).toHaveBeenCalled();

    // The refused session is dropped — a later resume rebuilds honestly.
    await expect(
      admitPrimeDeviceRun(params({ operationId: 'op-3', resumeSessionId: 'sess-1' }), '/tmp/work'),
    ).resolves.toEqual({ status: 'accepted' });
    await waitPrimeSessionIdle('sess-2');
    expect(openPrimeDeviceRunMock).toHaveBeenCalledTimes(2);
  });

  it('settles a killed op cancelled, never done', async () => {
    const run = makeFakeRun('sess-1');
    // Prompt never resolves — the kill arrives mid-turn.
    run.runImpl.prompt.mockImplementation(() => new Promise(() => undefined) as never);
    openPrimeDeviceRunMock.mockResolvedValue({ ok: true, value: run.run });

    await admitPrimeDeviceRun(params({ operationId: 'op-1' }), '/tmp/work');
    run.setLeaseLapsed(true);
    run.close(); // lease lapse → runner killed → stream closes mid-op
    await waitPrimeSessionIdle('sess-1');
    await vi.waitFor(() => expect(finishCalls.length).toBe(1));

    expect(finishCalls[0].result).toBe('cancelled');
    expect(finishCalls[0].error?.message).toContain('lease lapsed');
  });

  it('maps v2 thinking/tool harness events onto hetero-parity ingest', async () => {
    const run = makeFakeRun('sess-1');
    run.runImpl.prompt.mockImplementation(async (_text: string) => {
      run.push({ kind: 'thinking', text: 'pondering' });
      run.push({
        args: { code: 'print(1)' },
        kind: 'tool_call',
        toolCallId: 'call_1',
        toolName: 'ipython',
      });
      run.push({
        kind: 'tool_progress',
        partialResult: { content: [{ text: 'partial', type: 'text' }] },
        toolCallId: 'call_1',
        toolName: 'ipython',
      });
      run.push({
        isError: false,
        kind: 'tool_result',
        result: { content: [{ text: '1', type: 'text' }] },
        toolCallId: 'call_1',
        toolName: 'ipython',
      });
      return { ok: true, value: { stopReason: 'end_turn' } };
    });
    openPrimeDeviceRunMock.mockResolvedValue({ ok: true, value: run.run });

    await admitPrimeDeviceRun(params({ operationId: 'op-1' }), '/tmp/work');
    await waitPrimeSessionIdle('sess-1');

    const types = pushedEvents.map((e) => `${e.type}:${e.data?.chunkType ?? ''}`);
    expect(types).toEqual(
      expect.arrayContaining([
        'stream_chunk:reasoning',
        'stream_chunk:tools_calling',
        'tool_start:',
        'stream_chunk:tool_state',
        'tool_result:',
        'tool_end:',
      ]),
    );
    const toolsCalling = pushedEvents.find((e) => e.data?.chunkType === 'tools_calling');
    expect(toolsCalling?.data.toolsCalling).toEqual([
      expect.objectContaining({ apiName: 'ipython', id: 'call_1', identifier: 'orvilo' }),
    ]);
    const toolEnd = pushedEvents.find((e) => e.type === 'tool_end');
    expect(toolEnd?.data).toMatchObject({ isSuccess: true, toolCallId: 'call_1' });
  });

  it('keeps a live admitted run untouched when the session stays healthy', async () => {
    const run = makeFakeRun('sess-1');
    openPrimeDeviceRunMock.mockResolvedValue({ ok: true, value: run.run });

    await admitPrimeDeviceRun(params({ operationId: 'op-1' }), '/tmp/work');
    await waitPrimeSessionIdle('sess-1');

    expect(finishCalls[0].result).toBe('success');
    expect(finishCalls[0].error).toBeUndefined();
  });
});
