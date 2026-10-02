/** Manual Linux acceptance: built pinned image only. No prompts, providers or credentials. */
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { DockerProcessTreeSupervisor } from '../../packages/agent-execution/src/controlPlane/dockerSupervisor';
import {
  PRIME_RUNTIME_PIN,
  PrimeExecutionRuntime,
} from '../../packages/agent-execution/src/controlPlane/primeRuntime';
import { PrimeStdioTransport } from '../../packages/agent-execution/src/controlPlane/primeStdioTransport';

const execute = promisify(execFile);
async function main() {
  const imageId = process.argv[2];
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId ?? ''))
    throw new Error('Supply trusted, locally built immutable image ID');
  const dockerPath = process.argv[3] ?? '/usr/local/bin/docker';
  const { stdout } = await execute(dockerPath, ['image', 'inspect', imageId]);
  const [image] = JSON.parse(stdout);
  if (
    image.Config.Labels?.['orvilo.prime.commit'] !== PRIME_RUNTIME_PIN.commit ||
    image.Config.Labels?.['orvilo.prime.version'] !== PRIME_RUNTIME_PIN.version
  )
    throw new Error('Build provenance labels do not match the accepted pin');
  // Image labels are evidence supplied by this trusted build, not child self-attestation.
  const workspace = await mkdtemp(path.join(tmpdir(), 'orvilo-prime-protocol-'));
  await chmod(workspace, 0o755);
  const supervisor = new DockerProcessTreeSupervisor({
    dockerPath,
    imageId,
    workspace,
    executable: '/usr/local/bin/prime-pinned',
    supervisorId: 'prime-protocol-acceptance',
    memoryMiB: 1024,
    // This acceptance exposes no action broker, so there are no admitted effects to drain.
    drainActions: async () => ({ pendingActions: 0 }),
  });
  const trees: string[] = [];
  const runtime = new PrimeExecutionRuntime({
    executable: '/usr/local/bin/prime-pinned',
    home: '/tmp',
    temp: '/tmp',
    runtimeWorkspace: '/workspace',
    supervisor,
    // Local protocol fixture authority only; not production grant integration.
    authorize: async () => ({ ok: true, value: true }),
    verifyArtifact: async () => ({ ok: true, value: true }),
    connect: async (treeId) => {
      trees.push(treeId);
      return new PrimeStdioTransport(await supervisor.connect(treeId), 30000);
    },
  });
  try {
    const start = await runtime.start({
      workspace,
      fence: {
        tenantId: 'fixture',
        principalId: 'fixture',
        taskId: 'protocol-only',
        grantId: 'no-effects',
        ownerId: 'fixture',
        leaseId: 'fixture',
        epoch: 0,
        policyRevision: 0,
        stateRevision: 0,
      },
    });
    console.log(
      JSON.stringify({
        imageId,
        pin: PRIME_RUNTIME_PIN,
        start,
        capabilities: runtime.capabilities(),
        providerCalls: 0,
      }),
    );
    if (start.ok) {
      const shutdown = await runtime.shutdown(start.value);
      console.log(JSON.stringify({ shutdown }));
      if (!shutdown.ok) process.exitCode = 1;
    } else process.exitCode = 1;
    for (const treeId of trees) {
      const { stdout } = await execute(dockerPath, ['inspect', treeId]);
      const [container] = JSON.parse(stdout);
      console.log(
        JSON.stringify({
          treeId,
          state: container.State,
          network: container.HostConfig.NetworkMode,
          readOnlyRoot: container.HostConfig.ReadonlyRootfs,
        }),
      );
    }
  } finally {
    for (const treeId of trees) {
      const result = await supervisor.terminate(treeId);
      if (result.ok) await supervisor.remove(treeId);
      else {
        console.log(JSON.stringify({ cleanup: result, treeId }));
        process.exitCode = 1;
      }
    }
    await rm(workspace, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Protocol acceptance failed');
  process.exitCode = 1;
});
