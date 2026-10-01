// @vitest-environment node
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DockerProcessTreeSupervisor } from './dockerSupervisor';

const execute = promisify(execFile);
const docker = process.env.DOCKER_PATH ?? 'docker';
// Pinned public fixture image; this does not validate the Prime artifact. The
// daemon resolves its immutable content Id at pull time.
const imageTag = process.env.CORE_DOCKER_IMAGE ?? 'alpine:3.21';
let imageId: string;

describe('real Docker isolation and tree cancellation', () => {
  beforeAll(async () => {
    await execute(docker, ['pull', imageTag]);
    const inspected: { Id: string }[] = JSON.parse(
      (await execute(docker, ['image', 'inspect', imageTag])).stdout,
    );
    imageId = inspected[0].Id;
  });
  let directory: string;
  let supervisor: DockerProcessTreeSupervisor;
  let treeId: string | undefined;
  let pendingActions = 0;
  const environment = { HOME: '/tmp', TMPDIR: '/tmp', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1' };
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'orvilo-core-isolation-'));
    await chmod(directory, 0o755);
    await writeFile(path.join(directory, 'fixture'), 'permitted');
    await chmod(path.join(directory, 'fixture'), 0o644);
    pendingActions = 0;
    supervisor = new DockerProcessTreeSupervisor({
      imageId,
      supervisorId: `test-${Date.now()}`,
      workspace: directory,
      executable: '/bin/sh',
      drainActions: async () => ({ pendingActions }),
    });
  });
  afterEach(async () => {
    pendingActions = 0;
    if (treeId) {
      await supervisor.terminate(treeId);
      await supervisor.remove(treeId);
      treeId = undefined;
    }
    await rm(directory, { recursive: true, force: true });
  });

  it('enforces workspace read-only, hidden host files, empty credentials, network none and kills descendants', async () => {
    const result = await supervisor.launch({
      executable: '/bin/sh',
      workspace: directory,
      environment,
      args: [
        '-c',
        `
      set -x
      test "$(cat /workspace/fixture)" = permitted || exit 11
      test ! -e /var/run/docker.sock || exit 12
      test ! -e /workspace/orvilo1 || exit 13
      touch /workspace/forbidden 2>/dev/null && exit 14
      touch /root-forbidden 2>/dev/null && exit 15
      test -z "$AWS_SECRET_ACCESS_KEY$OPENAI_API_KEY$DOCKER_HOST" || exit 16
      test "$(id -u)" = 65534 || exit 17
      test "$(ls /sys/class/net)" = lo || exit 18
      sleep 300 &
      echo child=$!
      echo accepted
      wait
    `,
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    treeId = result.value.treeId;
    const streams = await supervisor.connect(treeId).catch(async (error) => {
      const report = await execute(docker, ['logs', treeId!]);
      throw new Error(report.stdout + report.stderr, { cause: error });
    });
    const output = await new Promise<string>((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error('No confinement report')), 5000);
      streams.stdout.on('data', (chunk) => {
        text += chunk;
        if (text.includes('accepted')) {
          clearTimeout(timer);
          resolve(text);
        }
      });
    });
    expect(output).toMatch(/child=\d+/);
    const inspected = JSON.parse((await execute(docker, ['inspect', treeId])).stdout)[0];
    expect(inspected.HostConfig.NetworkMode).toBe('none');
    expect(inspected.HostConfig.ReadonlyRootfs).toBe(true);
    expect(inspected.HostConfig.CapDrop).toEqual(['ALL']);
    expect(inspected.HostConfig.SecurityOpt).toContain('no-new-privileges');
    expect(inspected.HostConfig.PidsLimit).toBe(64);
    expect(inspected.Mounts).toHaveLength(1);
    expect(inspected.Mounts[0].RW).toBe(false);
    expect((await supervisor.terminate(treeId)).ok).toBe(true);
    const stopped = JSON.parse((await execute(docker, ['inspect', treeId])).stdout)[0];
    expect(stopped.State.Running).toBe(false);
    expect(stopped.State.Pid).toBe(0);
    await expect(supervisor.connect(treeId)).rejects.toThrow();
  }, 20_000);

  it('rejects environment credentials and foreign workspaces before launch', async () => {
    const base = {
      executable: '/bin/sh',
      args: ['-c', 'sleep 300'],
      workspace: directory,
      environment,
    };
    expect(
      (
        await supervisor.launch({
          ...base,
          environment: { ...environment, OPENAI_API_KEY: 'fixture' },
        })
      ).ok,
    ).toBe(false);
    expect((await supervisor.launch({ ...base, workspace: '/workspace/orvilo1' })).ok).toBe(false);
    expect((await supervisor.terminate('f'.repeat(64))).ok).toBe(false);
  });

  it.each([0, -1, 63, 4097, 256.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid trusted memory limit %s before container creation',
    async (memoryMiB) => {
      const restricted = new DockerProcessTreeSupervisor({
        imageId,
        supervisorId: 'invalid-budget',
        workspace: directory,
        executable: '/bin/sh',
        memoryMiB,
        drainActions: async () => ({ pendingActions: 0 }),
      });
      const result = await restricted.launch({
        executable: '/bin/sh',
        args: ['-c', 'sleep 300'],
        workspace: directory,
        environment,
      });
      expect(result).toMatchObject({
        ok: false,
        error: { message: 'Memory budget must be an integer from 64 to 4096 MiB' },
      });
    },
  );

  it('applies an explicit trusted memory ceiling equally to memory and swap', async () => {
    supervisor = new DockerProcessTreeSupervisor({
      imageId,
      supervisorId: 'explicit-budget',
      workspace: directory,
      executable: '/bin/sh',
      memoryMiB: 1024,
      drainActions: async () => ({ pendingActions: 0 }),
    });
    const result = await supervisor.launch({
      executable: '/bin/sh',
      args: ['-c', 'sleep 300'],
      workspace: directory,
      environment,
    });
    if (!result.ok) throw new Error(result.error.message);
    treeId = result.value.treeId;
    const inspected = JSON.parse((await execute(docker, ['inspect', treeId])).stdout)[0];
    expect(inspected.HostConfig.Memory).toBe(1024 * 1024 * 1024);
    expect(inspected.HostConfig.MemorySwap).toBe(inspected.HostConfig.Memory);
  });

  it('proves quiescence when closing transport races graceful container exit', async () => {
    const result = await supervisor.launch({
      executable: '/bin/sh',
      args: ['-c', 'while read line; do :; done'],
      workspace: directory,
      environment,
    });
    if (!result.ok) throw new Error(result.error.message);
    treeId = result.value.treeId;
    const streams = await supervisor.connect(treeId);
    streams.stdin.end();
    expect((await supervisor.terminate(treeId)).ok).toBe(true);
  });

  it('recovers the exact journaled name with a fresh supervisor and refuses duplicate launch', async () => {
    const options = {
      imageId,
      supervisorId: `recovery-${Date.now()}`,
      containerName: `orvilo-recovery-${Date.now()}`,
      workspace: directory,
      executable: '/bin/sh',
      drainActions: async () => ({ pendingActions: 0 }),
    };
    supervisor = new DockerProcessTreeSupervisor(options);
    expect(await supervisor.recover()).toBeUndefined();
    const input = {
      executable: '/bin/sh',
      args: ['-c', 'sleep 300'],
      workspace: directory,
      environment,
    };
    const result = await supervisor.launch(input);
    if (!result.ok) throw new Error(result.error.message);
    treeId = result.value.treeId;
    const restarted = new DockerProcessTreeSupervisor(options);
    expect(await restarted.recover()).toBe(treeId);
    expect((await restarted.launch(input)).ok).toBe(false);
    const foreign = new DockerProcessTreeSupervisor({ ...options, supervisorId: 'foreign-owner' });
    await expect(foreign.recover()).rejects.toThrow('not owned');
    expect((await restarted.terminate(treeId)).ok).toBe(true);
  });

  it('withholds quiescence when broker actions have not drained', async () => {
    const result = await supervisor.launch({
      executable: '/bin/sh',
      args: ['-c', 'sleep 300'],
      workspace: directory,
      environment,
    });
    if (!result.ok) throw new Error(result.error.message);
    treeId = result.value.treeId;
    pendingActions = 1;
    expect((await supervisor.terminate(treeId)).ok).toBe(false);
    pendingActions = 0;
    expect((await supervisor.terminate(treeId)).ok).toBe(true);
  }, 20_000);
});
