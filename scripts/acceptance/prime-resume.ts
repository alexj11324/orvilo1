import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdtemp, rm } from 'node:fs/promises';
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
  const { stdout } = await execute('/usr/local/bin/docker', ['image', 'inspect', imageId]);
  const [image] = JSON.parse(stdout);
  if (
    image.Config.Labels?.['orvilo.prime.commit'] !== PRIME_RUNTIME_PIN.commit ||
    image.Config.Labels?.['orvilo.prime.version'] !== PRIME_RUNTIME_PIN.version
  )
    throw new Error('Build provenance labels do not match pin');
  const workspace = await mkdtemp(path.join(tmpdir(), 'prime-resume-acceptance-'));
  const harness = path.join(workspace, 'prime-resume-harness.mjs');
  await copyFile(fileURLToPath(new URL('./prime-resume-harness.mjs', import.meta.url)), harness);
  await chmod(workspace, 0o755);
  await chmod(harness, 0o644);
  const supervisor = new DockerProcessTreeSupervisor({
    dockerPath: '/usr/local/bin/docker',
    executable: '/usr/local/bin/node',
    imageId,
    supervisorId: 'prime-resume-probe',
    workspace,
    memoryMiB: 1024,
    drainActions: async () => ({ pendingActions: 0 }),
  });
  const launch = await supervisor.launch({
    executable: '/usr/local/bin/node',
    args: [
      '/workspace/prime-resume-harness.mjs',
      ...(process.argv.includes('--cold-only') ? ['--cold-only'] : []),
    ],
    workspace,
    environment: { HOME: '/tmp', TMPDIR: '/tmp', LANG: 'en_US.UTF-8', PYTHONNOUSERSITE: '1' },
  });
  console.log(JSON.stringify({ imageId, launch }));
  if (!launch.ok) {
    await rm(workspace, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }
  const treeId = launch.value.treeId;
  try {
    const streams = await supervisor.connect(treeId);
    let output = '';
    streams.stdout.on('data', (chunk) => {
      output += chunk.toString();
      process.stdout.write(chunk);
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('probe deadline')), 100000);
      streams.stdout.on('end', () => {
        clearTimeout(timer);
        resolve();
      });
      streams.stdout.on('error', reject);
    });
    const rows = output
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    if (
      rows.some((row) => row.failed) ||
      !rows.some((row) => row.phase === 'independent-daemon-file-resume' && row.restored)
    )
      process.exitCode = 1;
  } finally {
    const quiescence = await supervisor.terminate(treeId);
    console.log(JSON.stringify({ quiescence }));
    if (quiescence.ok) await supervisor.remove(treeId);
    else process.exitCode = 1;
    await rm(workspace, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
