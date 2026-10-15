import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

import { withRepoFileMutex } from '@orvilo/local-file-shell/fileMutex';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createStandardAcpSession } from './standardAcpAgents';

const directories: string[] = [];
const children: ReturnType<typeof spawn>[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fixture = path.join(import.meta.dirname, '__fixtures__/opencodeStartup.child.ts');
const freshDirectory = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'opencode-startup-'));
  directories.push(directory);
  return directory;
};
const events = async (
  directory: string,
): Promise<Array<{ event: string; id: string; pid: number }>> =>
  (await readFile(path.join(directory, 'events.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
const start = (directory: string, id: string, agentType = 'opencode', scenario = 'parallel') => {
  const child = spawn('bun', [fixture, 'wrapper', directory, id, agentType, scenario], {
    env: { ...process.env, HOME: directory },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let stderr = '';
  child.stderr!.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  return new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`Fixture exited ${code}: ${stderr}`)),
    );
  });
};

afterEach(async () => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill('SIGKILL');
  for (const directory of directories.splice(0)) {
    for (const id of ['first', 'second']) {
      const pid = Number(
        await readFile(path.join(directory, `native-${id}`), 'utf8').catch(() => '0'),
      );
      if (pid > 0) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* Already stopped. */
        }
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

describe('OpenCode ACP startup', () => {
  it('serializes startup across CLI processes while allowing both prompts to run together', async () => {
    const directory = await freshDirectory();
    await Promise.all([start(directory, 'first'), start(directory, 'second')]);
    const observed = await events(directory);
    expect(observed.filter(({ event }) => event === 'startup-overlap')).toEqual([]);
    expect(observed.filter(({ event }) => event === 'completed')).toHaveLength(2);
    expect(observed.filter(({ event }) => event === 'prompt')).toHaveLength(2);
  }, 20000);

  it('kills a failed initializing child before another process enters startup', async () => {
    const directory = await freshDirectory();
    const first = start(directory, 'first', 'opencode', 'failure');
    await vi.waitFor(
      async () =>
        expect(await readFile(path.join(directory, 'native-first'), 'utf8')).toMatch(/^\d+$/),
      { timeout: 10000 },
    );
    await Promise.all([first, start(directory, 'second', 'opencode', 'failure')]);
    const observed = await events(directory);
    expect(observed.filter(({ event }) => event === 'startup-overlap')).toEqual([]);
    expect(observed).toContainEqual(expect.objectContaining({ event: 'failed', id: 'first' }));
    expect(observed).toContainEqual(expect.objectContaining({ event: 'completed', id: 'second' }));
  }, 20000);

  it('keeps other native ACP providers concurrent', async () => {
    const directory = await freshDirectory();
    await Promise.all([
      start(directory, 'first', 'kimi-code'),
      start(directory, 'second', 'kimi-code'),
    ]);
    expect(
      (await events(directory)).filter(({ event }) => event === 'startup-overlap'),
    ).toHaveLength(1);
  }, 20000);

  it('kills a TERM-ignoring child canceled during initialize and releases the startup lock', async () => {
    const directory = await freshDirectory();
    const first = start(directory, 'first', 'opencode', 'active-cancel');
    await vi.waitFor(
      async () =>
        expect(await readFile(path.join(directory, 'initializing-first'), 'utf8')).toBe(''),
      { timeout: 10000 },
    );
    const completed = Promise.all([first, start(directory, 'second', 'opencode', 'active-cancel')]);
    expect(await Promise.race([completed.then(() => true), sleep(2000).then(() => false)])).toBe(
      true,
    );
    const observed = await events(directory);
    expect(observed.filter(({ event }) => event === 'startup-overlap')).toEqual([]);
    expect(observed.filter(({ event, id }) => event === 'prompt' && id === 'first')).toEqual([]);
    expect(observed).toContainEqual(expect.objectContaining({ event: 'completed', id: 'second' }));
  }, 20000);

  it('does not spawn a canceled session after its startup lock becomes available', async () => {
    const directory = await freshDirectory();
    vi.stubEnv('HOME', directory);
    const target = path.join(homedir(), '.cache', 'orvilo', 'opencode-startup', 'initialize');
    await mkdir(path.dirname(target), { recursive: true });
    const session = createStandardAcpSession('opencode', {
      args: [],
      clientVersion: 'test',
      commandPath: 'must-not-spawn',
      cwd: directory,
      env: process.env,
      onEvents: () => {},
      onRawMessage: () => {},
      onRuntimeStatus: () => {},
      onSessionId: () => {},
      onStderr: () => {},
      operationId: 'canceled',
      prompt: 'test',
      sessionId: 'canceled',
    });
    let run: Promise<void> | undefined;
    await withRepoFileMutex(target, async () => {
      run = session.run();
      await sleep(50);
      session.close();
    });
    await run;
    expect(session.pid).toBeUndefined();
  });
});
