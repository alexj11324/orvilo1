import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { DockerProcessTreeSupervisor } from '../../packages/agent-execution/src/controlPlane/dockerSupervisor';
import { PRIME_RUNTIME_PIN } from '../../packages/agent-execution/src/controlPlane/primeRuntime';

const execute = promisify(execFile);
async function main() {
  const imageId = process.argv[2];
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId ?? ''))
    throw new Error('Supply trusted pinned image ID');
  const [image] = JSON.parse(
    (await execute('/usr/local/bin/docker', ['image', 'inspect', imageId])).stdout,
  );
  if (
    image.Config.Labels?.['orvilo.prime.commit'] !== PRIME_RUNTIME_PIN.commit ||
    image.Config.Labels?.['orvilo.prime.version'] !== PRIME_RUNTIME_PIN.version
  )
    throw new Error('Pin mismatch');
  async function phase(seed: boolean, snapshot?: Buffer) {
    const workspace = await mkdtemp(path.join(tmpdir(), 'prime-nonempty-'));
    await chmod(workspace, 0o755);
    const harness = path.join(workspace, 'prime-nonempty-harness.mjs');
    await copyFile(
      fileURLToPath(new URL('./prime-nonempty-harness.mjs', import.meta.url)),
      harness,
    );
    await chmod(harness, 0o644);
    if (snapshot) {
      const file = path.join(workspace, 'session.jsonl');
      await writeFile(file, snapshot);
      await chmod(file, 0o644);
    }
    const supervisor = new DockerProcessTreeSupervisor({
      dockerPath: '/usr/local/bin/docker',
      imageId,
      executable: '/usr/local/bin/node',
      workspace,
      supervisorId: 'prime-nonempty-acceptance',
      memoryMiB: 1024,
      drainActions: async () => ({ pendingActions: 0 }),
    });
    const launch = await supervisor.launch({
      executable: '/usr/local/bin/node',
      workspace,
      args: ['/workspace/prime-nonempty-harness.mjs', ...(seed ? ['--seed'] : [])],
      environment: { HOME: '/tmp', TMPDIR: '/tmp', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1' },
    });
    if (!launch.ok) {
      await rm(workspace, { recursive: true, force: true });
      throw new Error(JSON.stringify(launch));
    }
    const treeId = launch.value.treeId;
    let rows: Record<string, unknown>[];
    let stopped: boolean;
    try {
      const streams = await supervisor.connect(treeId);
      let output = '';
      streams.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.length > 1048576) streams.stdout.destroy(new Error('Oversized fixture output'));
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Probe deadline')), 60000);
        streams.stdout.once('end', () => {
          clearTimeout(timer);
          resolve();
        });
        streams.stdout.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      rows = output
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      for (const row of rows) {
        const { snapshot, ...publicRow } = row;
        console.log(
          JSON.stringify({
            imageId,
            treeId,
            ...publicRow,
            ...(typeof snapshot === 'string'
              ? {
                  snapshotSha256: createHash('sha256')
                    .update(Buffer.from(snapshot, 'base64'))
                    .digest('hex'),
                }
              : {}),
          }),
        );
      }
      if (rows.some((row) => row.failed)) throw new Error('Pinned nonempty probe failed');
    } finally {
      const quiescence = await supervisor.terminate(treeId);
      console.log(JSON.stringify({ seed, treeId, quiescence }));
      stopped = quiescence.ok;
      if (quiescence.ok) await supervisor.remove(treeId);
      await rm(workspace, { recursive: true, force: true });
    }
    if (!stopped) throw new Error('Source tree quiescence unproven');
    return rows;
  }
  const seeded = await phase(true);
  const snapshot = seeded.find((row) => row.phase === 'nonempty-snapshot')?.snapshot;
  if (typeof snapshot !== 'string') throw new Error('No fixture snapshot');
  // Source container is stopped/proven/removed before successor gets the immutable fixture bytes.
  const resumed = await phase(false, Buffer.from(snapshot, 'base64'));
  if (!resumed.some((row) => row.phase === 'nonempty-restored'))
    throw new Error('No restored history');
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Failed');
  process.exitCode = 1;
});
