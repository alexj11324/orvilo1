import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFile, spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';

import type { ControlResult, IsolationEvidence, QuiescenceProof } from './contracts';
import type { IsolatedLaunch, ProcessTreeSupervisor } from './isolation';

const execute = promisify(execFile);
// The application's ProcessEnv augmentation describes its ambient process, not
// a child allowlist. Do not inherit ambient credentials to satisfy that type.
const dockerClientEnvironment = () =>
  ({
    PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/local/sbin',
    HOME: '/nonexistent',
  }) as unknown as NodeJS.ProcessEnv;
const dockerBinary = (explicit?: string) => explicit ?? 'docker';
const fail = (message: string): ControlResult<never> => ({
  ok: false,
  error: { code: 'isolation_unavailable', message, retryable: false },
});
interface Inspection {
  Config: { Labels: Record<string, string> };
  Id: string;
  Name: string;
  State: { Running: boolean; Pid: number; Status: string };
}

/** Trusted host configuration only. Workspace must be a dedicated credential-free
 * snapshot, never a control-plane checkout, home directory, or vault mount. */
export interface DockerSupervisorOptions {
  /** Persist this trusted run identity before launch to recover an unjournaled tree. */
  containerName?: string;
  dockerPath?: string;
  /** Close mutation admission and await all broker effects, including during recovery. */
  drainActions: (treeId: string) => Promise<{ pendingActions: number }>;
  executable: string;
  imageId: string;
  /** Trusted host budget, never supplied by the child. Hard memory and swap ceiling. */
  memoryMiB?: number;
  supervisorId: string;
  workspace: string;
}

/** Docker daemon owns the PID namespace/cgroup. The attached host docker client
 * is a transport only; no runtime executable is launched on the host. */
export class DockerProcessTreeSupervisor implements ProcessTreeSupervisor {
  private readonly clients = new Map<string, ChildProcessWithoutNullStreams>();
  constructor(private readonly options: DockerSupervisorOptions) {}

  private async command(args: string[]) {
    return (
      await execute(dockerBinary(this.options.dockerPath), args, {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        env: dockerClientEnvironment(),
      })
    ).stdout.trim();
  }

  private async inspect(treeId: string): Promise<Inspection> {
    if (!/^[a-f0-9]{64}$/.test(treeId)) throw new Error('Invalid container identity');
    const [info] = JSON.parse(await this.command(['inspect', treeId])) as Inspection[];
    if (
      !info ||
      info.Id !== treeId ||
      info.Config.Labels['orvilo.core.supervisor'] !== this.options.supervisorId
    ) {
      throw new Error('Container is not owned by this supervisor');
    }
    return info;
  }

  /** Resolve only the exact persisted run name. A daemon/ownership error is not absence. */
  async recover(): Promise<string | undefined> {
    const name = this.options.containerName;
    if (!name || !/^[a-z0-9][\w.-]{0,127}$/i.test(name)) throw new Error('Invalid recovery name');
    let value: string;
    try {
      value = await this.command(['container', 'inspect', name]);
    } catch (error) {
      if (
        error instanceof Error &&
        'stderr' in error &&
        typeof error.stderr === 'string' &&
        error.stderr.trim() === `Error response from daemon: No such container: ${name}`
      )
        return undefined;
      throw error;
    }
    const [candidate] = JSON.parse(value) as Inspection[];
    const owned = await this.inspect(candidate.Id);
    if (owned.Name !== `/${name}`) throw new Error('Recovery name changed');
    return owned.Id;
  }

  async launch(input: IsolatedLaunch): Promise<ControlResult<IsolationEvidence>> {
    let treeId: string | undefined;
    try {
      if (
        this.options.containerName !== undefined &&
        !/^[a-z0-9][\w.-]{0,127}$/i.test(this.options.containerName)
      )
        return fail('Invalid container name');
      const memoryMiB = this.options.memoryMiB ?? 256;
      if (!Number.isSafeInteger(memoryMiB) || memoryMiB < 64 || memoryMiB > 4096) {
        return fail('Memory budget must be an integer from 64 to 4096 MiB');
      }
      if (
        !/^[\w-]{1,100}$/.test(this.options.supervisorId) ||
        !/^sha256:[a-f0-9]{64}$/.test(this.options.imageId) ||
        input.executable !== this.options.executable ||
        !input.executable.startsWith('/') ||
        (await realpath(input.workspace)) !== (await realpath(this.options.workspace))
      )
        return fail('Unapproved image, executable or workspace');
      const expected = { HOME: '/tmp', TMPDIR: '/tmp', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1' };
      if (
        JSON.stringify(Object.entries(input.environment).sort()) !==
        JSON.stringify(Object.entries(expected).sort())
      )
        return fail('Unapproved runtime environment');
      const [image] = JSON.parse(await this.command(['image', 'inspect', this.options.imageId]));
      if (image.Id !== this.options.imageId || Object.keys(image.Config.Volumes ?? {}).length)
        return fail('Image must not declare writable volumes');
      const workspace = await realpath(this.options.workspace);
      if (workspace === '/' || workspace === '/workspace' || /[,\n\r]/.test(workspace))
        return fail('Dedicated workspace required');
      treeId = await this.command([
        'create',
        ...(this.options.containerName ? ['--name', this.options.containerName] : []),
        '--interactive',
        '--network',
        'none',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--pids-limit',
        '64',
        '--memory',
        `${memoryMiB}m`,
        '--memory-swap',
        `${memoryMiB}m`,
        '--user',
        '65534:65534',
        '--tmpfs',
        '/tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777',
        '--mount',
        `type=bind,src=${workspace},dst=/workspace,readonly`,
        '--workdir',
        '/workspace',
        '--label',
        `orvilo.core.supervisor=${this.options.supervisorId}`,
        '--entrypoint',
        '/usr/bin/env',
        this.options.imageId,
        '-i',
        ...Object.entries(expected).map(([key, value]) => `${key}=${value}`),
        input.executable,
        ...input.args,
      ]);
      await this.inspect(treeId);
      const client = spawn(
        dockerBinary(this.options.dockerPath),
        ['start', '--attach', '--interactive', treeId],
        {
          stdio: 'pipe',
          env: dockerClientEnvironment(),
        },
      );
      this.clients.set(treeId, client);
      client.stderr.resume();
      let spawnError = false;
      client.on('error', () => {
        spawnError = true;
      });
      for (let attempt = 0; attempt < 50; attempt++) {
        if (spawnError || client.exitCode !== null) throw new Error('Container attach failed');
        if ((await this.inspect(treeId)).State.Running)
          return {
            ok: true,
            value: {
              supervisorId: this.options.supervisorId,
              treeId,
              enforced: true,
              filesystem: true,
              network: true,
              processes: true,
              sanitizedEnvironment: true,
              credentialsExcluded: true,
            },
          };
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error('Container failed to start');
    } catch {
      if (treeId) await this.terminate(treeId);
      return fail('Restricted container launch failed');
    }
  }

  async connect(treeId: string) {
    const info = await this.inspect(treeId);
    const client = this.clients.get(treeId);
    if (!info.State.Running || !client || client.exitCode !== null)
      throw new Error('No live owned container transport');
    return { stdin: client.stdin, stdout: client.stdout };
  }

  async terminate(treeId: string): Promise<ControlResult<QuiescenceProof>> {
    try {
      const info = await this.inspect(treeId);
      if (info.State.Running) {
        try {
          await this.command(['kill', '--signal', 'KILL', treeId]);
        } catch (error) {
          // Closing ACP can let PID 1 exit between inspection and kill. Only a
          // fresh daemon observation can turn that command failure into success.
          const raced = await this.inspect(treeId);
          if (raced.State.Running || raced.State.Pid !== 0 || raced.State.Status !== 'exited')
            throw error;
        }
      }
      if (info.State.Status !== 'created') await this.command(['wait', treeId]);
      const stopped = await this.inspect(treeId);
      const drained = await this.options.drainActions(treeId);
      if (
        stopped.State.Running ||
        stopped.State.Pid !== 0 ||
        !['exited', 'created'].includes(stopped.State.Status) ||
        drained.pendingActions !== 0
      )
        throw new Error('Tree or broker actions remain active');
      this.clients.get(treeId)?.stdin.destroy();
      this.clients.delete(treeId);
      return {
        ok: true,
        value: {
          supervisorId: this.options.supervisorId,
          treeId,
          observedAt: Date.now(),
          remainingProcesses: 0,
          pendingActions: 0,
        },
      };
    } catch {
      return {
        ok: false,
        error: {
          code: 'not_quiescent',
          message: 'Container or action drain is unproven',
          retryable: true,
        },
      };
    }
  }

  /** Explicit cleanup for an already stopped owned container. */
  async remove(treeId: string) {
    const info = await this.inspect(treeId);
    if (info.State.Running || info.State.Pid !== 0) throw new Error('Cannot remove a live tree');
    await this.command(['rm', '--volumes', treeId]);
  }
}
