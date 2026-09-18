import { EventEmitter } from 'node:events';
import { statSync } from 'node:fs';
import os from 'node:os';

import { HETERO_EXEC_INHERIT_PROCESS_GROUP_ENV } from '@orvilo/heterogeneous-agents/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { spawnHeteroAgentRun } from './agentRun';

const { spawnMock, execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  spawnMock: vi.fn(),
}));
const { saveTaskMock, getTaskMock, removeTaskMock } = vi.hoisted(() => ({
  getTaskMock: vi.fn(),
  removeTaskMock: vi.fn(),
  saveTaskMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
  spawn: spawnMock,
}));
vi.mock('../daemon/taskRegistry', () => ({
  getTask: getTaskMock,
  removeTask: removeTaskMock,
  saveTask: saveTaskMock,
}));
const { cancelAgentRunMock, registerAgentRunMock, getAgentRunMock } = vi.hoisted(() => ({
  cancelAgentRunMock: vi.fn(),
  getAgentRunMock: vi.fn(),
  registerAgentRunMock: vi.fn(),
}));
vi.mock('./agentRunRegistry', () => ({
  cancelAgentRun: cancelAgentRunMock,
  getAgentRun: getAgentRunMock,
  registerAgentRun: registerAgentRunMock,
}));
// `resolveHeteroSpawnCwd` stats the candidate directories; treat every path as
// an existing directory unless a test says otherwise.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, statSync: vi.fn() };
});

const asDirectory = { isDirectory: () => true } as ReturnType<typeof statSync>;
const mockMissingDir = (missing: string) =>
  vi
    .mocked(statSync)
    .mockImplementation((candidate) => (candidate === missing ? undefined : asDirectory) as never);

const makeFakeChild = () => {
  const child = new EventEmitter() as EventEmitter & {
    stdin: { end: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  };
  child.stdin = { end: vi.fn(), write: vi.fn() };
  return child;
};

const baseParams = {
  agentType: 'claudeCode',
  assistantMessageId: 'asst',
  jwt: 'jwt',
  operationId: 'op',
  prompt: 'hi',
  serverUrl: 'https://orvilo.aspectlylabs.com',
  topicId: 'tpc',
};

describe('spawnHeteroAgentRun', () => {
  beforeEach(() => {
    vi.mocked(statSync).mockReturnValue(asDirectory);
    saveTaskMock.mockReset();
    getTaskMock.mockReset();
    removeTaskMock.mockReset();
    getAgentRunMock.mockReset();
    cancelAgentRunMock.mockReset();
    // Unreadable leader cmdline → the conservative "still ours" kill path.
    execFileSyncMock.mockReset().mockReturnValue('');
  });

  afterEach(() => {
    spawnMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  /**
   * `process.kill` double: each group probes alive until a real signal lands
   * on ITS pid, then signal-0 probes report ESRCH — i.e. that writer is
   * observed dead. Tracked per pid so a replacement spawn stays alive.
   */
  const mockGroupDeathOnKill = () => {
    const dead = new Set<number>();
    return vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      const target = Math.abs(pid as number);
      if (signal !== 0) dead.add(target);
      if (dead.has(target)) {
        const gone = new Error('no such process') as NodeJS.ErrnoException;
        gone.code = 'ESRCH';
        throw gone;
      }
      return true;
    });
  };

  it('spawns `lh hetero exec` in server-ingest mode via the current CLI entry', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({
      ...baseParams,
      cwd: '/work/dir',
      jwt: 'jwt-token',
      operationId: 'op-1',
      topicId: 'tpc-1',
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [bin, args, opts] = spawnMock.mock.calls[0];

    expect(bin).toBe(process.execPath);
    expect(args).toEqual([
      ...process.execArgv,
      process.argv[1],
      'hetero',
      'exec',
      '--type',
      'claudeCode',
      '--operation-id',
      'op-1',
      '--topic',
      'tpc-1',
      '--render',
      'none',
      '--input-json',
      '-',
      '--cwd',
      '/work/dir',
    ]);
    expect(opts).toMatchObject({
      cwd: '/work/dir',
      detached: true,
      env: expect.objectContaining({
        [HETERO_EXEC_INHERIT_PROCESS_GROUP_ENV]: '1',
        ORVILO_ASSISTANT_MESSAGE_ID: 'asst',
        ORVILO_JWT: 'jwt-token',
        ORVILO_SERVER: 'https://orvilo.aspectlylabs.com',
      }),
      windowsHide: true,
    });
    expect(opts.env).not.toHaveProperty('ORVILO_WORKSPACE_ID');

    // stdin is only written after the child actually spawns.
    expect(child.stdin.write).not.toHaveBeenCalled();
    child.emit('spawn');

    await expect(ackPromise).resolves.toEqual({ status: 'accepted' });
    expect(child.stdin.write).toHaveBeenCalledWith(JSON.stringify('hi'));
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
  });

  it('replaces the launcher conversation context with the dispatched run', async () => {
    for (const key of ['AGENT', 'TASK', 'OPERATION', 'TOPIC', 'WORKSPACE', 'ASSISTANT_MESSAGE']) {
      vi.stubEnv(`ORVILO_${key}_ID`, `launcher-${key}`);
    }
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const ack = spawnHeteroAgentRun({ ...baseParams, assistantMessageId: undefined });
    const env = spawnMock.mock.calls[0][2].env;
    expect(env.ORVILO_OPERATION_ID).toBe('op');
    expect(env.ORVILO_TOPIC_ID).toBe('tpc');
    for (const key of ['AGENT', 'TASK', 'WORKSPACE', 'ASSISTANT_MESSAGE']) {
      expect(env).not.toHaveProperty(`ORVILO_${key}_ID`);
    }
    child.emit('spawn');
    await expect(ack).resolves.toEqual({ status: 'accepted' });
  });

  it('starts the wrapper from home so its inner preflight can report a missing cwd', async () => {
    const missingCwd = '/missing';
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);
    mockMissingDir(missingCwd);

    const ackPromise = spawnHeteroAgentRun({ ...baseParams, cwd: missingCwd });

    const [, args, options] = spawnMock.mock.calls[0];
    const cwdArgIndex = args.indexOf('--cwd');
    expect(options.cwd).toBe(os.homedir());
    expect(args[cwdArgIndex + 1]).toBe(missingCwd);
    child.emit('spawn');

    await expect(ackPromise).resolves.toEqual({ status: 'accepted' });
    expect(child.stdin.write).toHaveBeenCalledWith(JSON.stringify('hi'));
  });

  it('rejects when the wrapper process still fails to spawn from the fallback cwd', async () => {
    const missingCwd = '/missing';
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);
    mockMissingDir(missingCwd);

    const ackPromise = spawnHeteroAgentRun({ ...baseParams, cwd: missingCwd });
    child.emit('error', new Error('spawn EACCES'));

    await expect(ackPromise).resolves.toEqual({ reason: 'spawn EACCES', status: 'rejected' });
    expect(child.stdin.write).not.toHaveBeenCalled();
  });

  it('forwards the topic workspace as ORVILO_WORKSPACE_ID for ingest', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({
      ...baseParams,
      workspaceId: 'ws-orvilo',
    });
    child.emit('spawn');
    await ackPromise;

    const [, , opts] = spawnMock.mock.calls[0];
    expect(opts.env).toEqual(
      expect.objectContaining({
        ORVILO_WORKSPACE_ID: 'ws-orvilo',
      }),
    );
  });

  it('appends --resume when resuming a session', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const ack = spawnHeteroAgentRun({ ...baseParams, resumeSessionId: 'sess-9' });

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toContain('--resume');
    expect(args).toContain('sess-9');
    // Admissions serialize per operation — settle this one so later tests
    // sharing the operationId are not stuck behind a never-emitted child.
    child.emit('spawn');
    await ack;
  });

  it('forwards resolved args to lh hetero exec', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const ack = spawnHeteroAgentRun({
      ...baseParams,
      args: ['--model', 'opus', '--effort', 'high'],
    });

    const [, args] = spawnMock.mock.calls[0];
    expect(args.slice(-4)).toEqual(['--model', 'opus', '--effort', 'high']);
    child.emit('spawn');
    await ack;
  });

  it('sends a content-block array to stdin when systemContext is provided', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({
      ...baseParams,
      prompt: 'do it',
      systemContext: 'workspace rules',
    });
    child.emit('spawn');
    await ackPromise;

    expect(child.stdin.write).toHaveBeenCalledWith(
      JSON.stringify([
        { text: 'workspace rules', type: 'text' },
        { text: 'do it', type: 'text' },
      ]),
    );
  });

  it('sends recovery history only in the resume fallback prompt', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({
      ...baseParams,
      prompt: 'continue',
      resumeFallbackSystemContext: 'workspace rules\n\nprevious conversation',
      resumeSessionId: 'session-1',
      systemContext: 'workspace rules',
    });
    child.emit('spawn');
    await ackPromise;

    expect(child.stdin.write).toHaveBeenCalledWith(
      JSON.stringify({
        content: [
          { text: 'workspace rules', type: 'text' },
          { text: 'continue', type: 'text' },
        ],
        resumeFallback: [
          { text: 'workspace rules\n\nprevious conversation', type: 'text' },
          { text: 'continue', type: 'text' },
        ],
      }),
    );
  });

  it('appends image blocks to stdin when imageList is provided', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({
      ...baseParams,
      imageList: [{ id: 'file-1', url: 'https://signed/a.png' }],
      prompt: 'look at this',
    });
    child.emit('spawn');
    await ackPromise;

    expect(child.stdin.write).toHaveBeenCalledWith(
      JSON.stringify([
        { text: 'look at this', type: 'text' },
        { source: { id: 'file-1', type: 'url', url: 'https://signed/a.png' }, type: 'image' },
      ]),
    );
  });

  // ─── Cancel regression: process registration ───
  // The connect daemon must register the spawned CLI child into the task
  // registry so `cancelHeteroTask` dispatched from the server can resolve it
  // by operationId and signal the whole process group.

  it('registers the spawned child PID into the task registry on spawn', async () => {
    const child = makeFakeChild();
    Object.defineProperty(child, 'pid', { value: 12345 });
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({
      ...baseParams,
      agentType: 'devin',
      operationId: 'op-cancel-reg',
      topicId: 'tpc-cancel-reg',
      workspaceId: 'ws-reg',
    });
    child.emit('spawn');
    await ackPromise;

    expect(saveTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'devin',
        operationId: 'op-cancel-reg',
        pid: 12345,
        taskId: 'op-cancel-reg',
        topicId: 'tpc-cancel-reg',
        workspaceId: 'ws-reg',
      }),
    );
  });

  it('removes the task registry entry on child exit when the PID still matches', async () => {
    const child = makeFakeChild();
    Object.defineProperty(child, 'pid', { value: 9988 });
    spawnMock.mockReturnValue(child);
    // The exit handler checks getTask to guard against stale exits clearing a
    // newer entry — simulate the registry still owning this PID.
    getTaskMock.mockReturnValue({ pid: 9988 });

    const ackPromise = spawnHeteroAgentRun({
      ...baseParams,
      operationId: 'op-exit-cleanup',
    });
    child.emit('spawn');
    await ackPromise;

    child.emit('exit', 0, null);

    expect(getTaskMock).toHaveBeenCalledWith('op-exit-cleanup');
    expect(removeTaskMock).toHaveBeenCalledWith('op-exit-cleanup');
  });

  it('does not remove the registry entry on exit when a newer PID replaced it', async () => {
    const child = makeFakeChild();
    Object.defineProperty(child, 'pid', { value: 7777 });
    spawnMock.mockReturnValue(child);
    // A newer run reused the same operationId with a different PID. The first
    // getTask call is the redelivery dedupe probe — empty so this spawn is
    // fresh; the exit handler then sees the newer PID's entry.
    getTaskMock.mockReturnValueOnce(undefined);
    getTaskMock.mockReturnValue({ pid: 8888 });

    const ackPromise = spawnHeteroAgentRun({
      ...baseParams,
      operationId: 'op-stale-exit',
    });
    child.emit('spawn');
    await ackPromise;

    child.emit('exit', 0, null);

    expect(removeTaskMock).not.toHaveBeenCalled();
  });

  it('acks a redelivered run request without spawning a duplicate', async () => {
    // A retry after a lost ack reuses the same operationId: the tracked run is
    // still live, so the daemon must return the existing acceptance instead of
    // spawning a second writer.
    getTaskMock.mockReturnValue({ operationId: 'op', pid: 4242, runGeneration: 1 });
    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

    const ack = await spawnHeteroAgentRun({ ...baseParams, runGeneration: 1 });

    expect(ack).toEqual({ status: 'accepted' });
    expect(spawnMock).not.toHaveBeenCalled();
    killSpy.mockRestore();
  });

  it('stops the stale writer and respawns when a retry carries a newer generation', async () => {
    getTaskMock.mockReturnValue({ operationId: 'op', pid: 4242, runGeneration: 1 });
    const killSpy = mockGroupDeathOnKill();
    const child = makeFakeChild();
    Object.defineProperty(child, 'pid', { value: 5555 });
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({ ...baseParams, runGeneration: 2 });
    // The dedupe preamble is async — spawn only happens after the fenced
    // writer is stopped.
    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(1);
    });
    child.emit('spawn');

    await expect(ackPromise).resolves.toEqual({ status: 'accepted' });
    expect(cancelAgentRunMock).toHaveBeenCalledWith('op', 'SIGINT');
    // SIGKILL was delivered to the old group before the record was dropped.
    expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL');
    expect(removeTaskMock).toHaveBeenCalledWith('op');
  });

  it('refuses to spawn a second writer when the forced kill is undeliverable', async () => {
    // EPERM on SIGKILL: the old writer's fate is unknown — the admission must
    // be rejected and the registry record kept for recovery, never dropped.
    getTaskMock.mockReturnValue({ operationId: 'op', pid: 4242, runGeneration: 1 });
    vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal === 'SIGKILL') {
        const denied = new Error('operation not permitted') as NodeJS.ErrnoException;
        denied.code = 'EPERM';
        throw denied;
      }
      return true;
    });

    const ack = await spawnHeteroAgentRun({ ...baseParams, runGeneration: 2 });

    expect(ack).toEqual({ reason: 'previous run has not confirmed exit', status: 'rejected' });
    expect(spawnMock).not.toHaveBeenCalled();
    expect(removeTaskMock).not.toHaveBeenCalled();
  });

  it('keeps waiting when SIGKILL lands but the group lingers — no spawn until exit', async () => {
    vi.useFakeTimers();
    getTaskMock.mockReturnValue({ operationId: 'op', pid: 4242, runGeneration: 1 });
    // The group never dies: every probe reports alive, signals are accepted.
    vi.spyOn(process, 'kill').mockReturnValue(true);

    const ackPromise = spawnHeteroAgentRun({ ...baseParams, runGeneration: 2 });
    // Let the admission reach the post-SIGKILL wait loop, then run the whole
    // confirm window out — the group is still alive at the deadline.
    await vi.advanceTimersByTimeAsync(4000);
    const ack = await ackPromise;

    expect(ack).toEqual({ reason: 'previous run has not confirmed exit', status: 'rejected' });
    expect(spawnMock).not.toHaveBeenCalled();
    expect(removeTaskMock).not.toHaveBeenCalled();
  });

  it('replaces only once when two superseding generations race', async () => {
    getTaskMock
      .mockReturnValueOnce({ operationId: 'op', pid: 4242, runGeneration: 1 }) // first admission
      .mockReturnValue({ operationId: 'op', pid: 5555, runGeneration: 2 }); // second sees the fresh record
    mockGroupDeathOnKill();
    const child = makeFakeChild();
    Object.defineProperty(child, 'pid', { value: 5555 });
    spawnMock.mockReturnValue(child);

    const [ackA, ackB] = await Promise.all([
      (async () => {
        const ackPromise = spawnHeteroAgentRun({ ...baseParams, runGeneration: 2 });
        await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
        child.emit('spawn');
        return ackPromise;
      })(),
      spawnHeteroAgentRun({ ...baseParams, runGeneration: 2 }),
    ]);

    expect(ackA).toEqual({ status: 'accepted' });
    expect(ackB).toEqual({ status: 'accepted' }); // deduped, not a second writer
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('does not signal a reused pid whose leader is a foreign process', async () => {
    // PID reuse after a daemon restart: pid 4242 now belongs to an unrelated
    // process. It must not be signaled — the record is stale, so the new run
    // simply replaces it.
    getTaskMock.mockReturnValue({ operationId: 'op', pid: 4242, runGeneration: 1 });
    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);
    execFileSyncMock.mockReturnValue('vim /tmp/notes.txt\n');
    const child = makeFakeChild();
    Object.defineProperty(child, 'pid', { value: 5555 });
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({ ...baseParams, runGeneration: 2 });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.emit('spawn');

    await expect(ackPromise).resolves.toEqual({ status: 'accepted' });
    // Only signal-0 liveness probes were sent — never a real signal.
    expect(killSpy).not.toHaveBeenCalledWith(expect.anything(), 'SIGKILL');
    expect(killSpy).not.toHaveBeenCalledWith(expect.anything(), 'SIGINT');
    expect(cancelAgentRunMock).not.toHaveBeenCalled();
    expect(removeTaskMock).toHaveBeenCalledWith('op');
  });

  it('trusts the in-process registry for pid identity without a cmdline probe', async () => {
    // A run this daemon spawned: the pgid was minted by its own spawn, so no
    // `ps`/PowerShell probe runs even when the exec shim would answer.
    getTaskMock.mockReturnValue({ operationId: 'op', pid: 4242, runGeneration: 1 });
    getAgentRunMock.mockReturnValue({ child: { pid: 4242 }, exited: false });
    mockGroupDeathOnKill();
    execFileSyncMock.mockImplementation(() => {
      throw new Error('probe must not run');
    });
    const child = makeFakeChild();
    Object.defineProperty(child, 'pid', { value: 5555 });
    spawnMock.mockReturnValue(child);

    const ackPromise = spawnHeteroAgentRun({ ...baseParams, runGeneration: 2 });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.emit('spawn');

    await expect(ackPromise).resolves.toEqual({ status: 'accepted' });
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(cancelAgentRunMock).toHaveBeenCalledWith('op', 'SIGINT');
  });
});
