import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendLog,
  readPid,
  readStatus,
  removePid,
  removeStatus,
  writePid,
  writeStatus,
} from './manager';
import { getTask, listTasks, removeTask, saveTask } from './taskRegistry';

describe('CLI state isolation', () => {
  let temporaryHome: string;

  beforeEach(async () => {
    temporaryHome = await mkdtemp(path.join(os.tmpdir(), 'orvilo-cli-state-isolation-'));
    vi.spyOn(os, 'homedir').mockReturnValue(temporaryHome);
    vi.stubEnv('ORVILO_CLI_HOME', 'installation-a');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(temporaryHome, { force: true, recursive: true });
  });

  it('keeps daemon PID, status, and logs independent across installations', async () => {
    const status = {
      connectionStatus: 'connected',
      deviceId: 'device-a',
      gatewayUrl: 'http://localhost:8805',
      pid: 12345,
      startedAt: '2026-10-06T00:00:00.000Z',
    };
    writePid(status.pid);
    writeStatus(status);
    appendLog('installation-a connected');

    vi.stubEnv('ORVILO_CLI_HOME', 'installation-b');
    expect(readPid()).toBeNull();
    expect(readStatus()).toBeNull();
    writePid(23456);
    writeStatus({ ...status, deviceId: 'device-b', pid: 23456 });
    appendLog('installation-b connected');
    removePid();
    removeStatus();

    vi.stubEnv('ORVILO_CLI_HOME', 'installation-a');
    expect(readPid()).toBe(status.pid);
    expect(readStatus()).toEqual(status);
    expect(await readFile(path.join(temporaryHome, 'installation-a/daemon.log'), 'utf8')).toContain(
      'installation-a connected',
    );
    expect(
      await readFile(path.join(temporaryHome, 'installation-b/daemon.log'), 'utf8'),
    ).not.toContain('installation-a connected');
    expect((await readdir(temporaryHome)).sort()).toEqual(['installation-a', 'installation-b']);
  });

  it('keeps task lookup and removal inside the selected installation', async () => {
    const task = {
      agentType: 'codex',
      operationId: 'operation-a',
      pid: 12345,
      startedAt: '2026-10-06T00:00:00.000Z',
      taskId: 'task-a',
      topicId: 'topic-a',
      workspaceId: 'workspace-a',
    };
    saveTask(task);

    vi.stubEnv('ORVILO_CLI_HOME', 'installation-b');
    expect(listTasks()).toEqual([]);
    expect(getTask(task.taskId)).toBeUndefined();
    saveTask({ ...task, taskId: 'task-b' });
    removeTask(task.taskId);
    expect(listTasks()).toEqual([{ ...task, taskId: 'task-b' }]);

    vi.stubEnv('ORVILO_CLI_HOME', 'installation-a');
    expect(getTask(task.taskId)).toEqual(task);
    removeTask(task.taskId);
    expect(listTasks()).toEqual([]);
    expect((await readdir(temporaryHome)).sort()).toEqual(['installation-a', 'installation-b']);
  });
});
