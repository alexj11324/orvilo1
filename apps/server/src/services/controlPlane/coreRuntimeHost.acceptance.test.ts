// @vitest-environment node
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { ActionRequest } from '@orvilo/agent-execution';
import { PRIME_RUNTIME_PIN } from '@orvilo/agent-execution/controlPlane/server';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';

import { taskDispatches, workspaces } from '@/database/schemas';
import { cleanupTestUser } from '@/server/routers/lambda/__tests__/integration/setup';

import { createCanonicalRunFixture } from './canonicalRun.test-utils';
import { CanonicalCoreRuntimeHost } from './coreRuntimeHost';

const command = promisify(execFile);

// Explicit disposable PostgreSQL and locally built pinned image. No providers/prompts/credentials.
it.skipIf(!process.env.CORE_DOCKER_IMAGE || process.env.TEST_SERVER_DB !== '1')(
  'composes canonical admission, actual Prime tree, durable file action, and recovered stop drain',
  async () => {
    const imageId = process.env.CORE_DOCKER_IMAGE!;
    const dockerPath = '/usr/local/bin/docker';
    const { stdout } = await command(dockerPath, ['image', 'inspect', imageId]);
    const [image] = JSON.parse(stdout);
    expect(image.Id).toBe(imageId);
    expect(image.Config.Labels['orvilo.prime.commit']).toBe(PRIME_RUNTIME_PIN.commit);
    expect(image.Config.Labels['orvilo.prime.version']).toBe(PRIME_RUNTIME_PIN.version);
    const db = await getTestDB();
    const binding = await createCanonicalRunFixture(db);
    const directory = await mkdtemp(path.join(tmpdir(), 'core-host-acceptance-'));
    await chmod(directory, 0o755);
    const workspace = path.join(directory, 'workspace');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(workspace, { mode: 0o755 });
    await chmod(workspace, 0o755);
    const supervisorId = `core-host-${randomUUID()}`;
    const options = {
      binding,
      database: db,
      controlDirectory: path.join(directory, 'control'),
      outputDirectory: path.join(directory, 'output'),
      docker: {
        dockerPath,
        imageId,
        executable: '/usr/local/bin/prime-pinned',
        workspace,
        supervisorId,
        memoryMiB: 1024,
      },
      fileCommitments: [
        {
          id: 'approved-file',
          taskId: binding.taskId,
          actionKinds: ['file.write' as const],
          postconditions: [
            {
              verifierId: 'file.sha256',
              expected: createHash('sha256').update('actual broker effect').digest('hex'),
            },
          ],
        },
      ],
      verifyArtifact: async () => ({ ok: true as const, value: true as const }), // Immutable image+pin verified above by trusted host, not child.
    };
    const host = await CanonicalCoreRuntimeHost.open(options);
    let recovered: CanonicalCoreRuntimeHost | undefined;
    try {
      expect(await host.reconcileCompletion()).toEqual({
        state: 'denied',
        reason: 'receipt_mapping_unavailable',
      });
      const started = await host.start();
      expect(started, JSON.stringify(started)).toMatchObject({ ok: true });
      if (!started.ok) throw new Error('Actual Prime start denied');
      const request: ActionRequest = {
        schemaVersion: 1,
        fence: started.value.fence,
        idempotencyKey: 'write-once',
        commitmentId: 'approved-file',
        action: {
          kind: 'file.write',
          path: path.join(options.outputDirectory, 'result'),
          content: 'actual broker effect',
        },
      };
      const foreign = structuredClone(request);
      foreign.fence.tenantId = 'foreign';
      expect(await host.execute(foreign)).toMatchObject({ ok: false });
      // Deterministically hold real filesystem IO inside the actual canonical row-lock scope.
      const sample = await open(path.join(directory, 'sample'), 'w');
      const prototype = Object.getPrototypeOf(sample);
      const original = prototype.sync;
      await sample.close();
      let enter!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = vi.spyOn(prototype, 'sync').mockImplementationOnce(async function (
        this: typeof sample,
      ) {
        enter();
        await gate;
        return original.call(this);
      });
      const writing = host.execute(request);
      await entered;
      // Reproduce the persisted pre-launch journal at the crash seam: Docker exists,
      // but its successful launch result was never recorded. Recovery must use only
      // the previously committed exact container name, not host process memory.
      const journalPath = path.join(options.controlDirectory, 'host.json');
      const journal = JSON.parse(await readFile(journalPath, 'utf8'));
      delete journal.isolation;
      const journalFile = await open(journalPath, 'w');
      try {
        await journalFile.writeFile(JSON.stringify(journal));
        await journalFile.sync();
      } finally {
        await journalFile.close();
      }
      recovered = await CanonicalCoreRuntimeHost.open(options);
      expect(await recovered.start()).toMatchObject({ ok: false });
      let stopped = false;
      const stopping = recovered.recoverStop().then((result) => {
        stopped = true;
        return result;
      });
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(stopped).toBe(false);
      } finally {
        release();
        spy.mockRestore();
      }
      expect(await writing).toMatchObject({ ok: true, value: { status: 'verified' } });
      expect(await stopping).toMatchObject({
        ok: true,
        value: { remainingProcesses: 0, pendingActions: 0 },
      });
      expect(await readFile(path.join(options.outputDirectory, 'result'), 'utf8')).toBe(
        'actual broker effect',
      );
      expect(await host.execute(request)).toMatchObject({ ok: false });
      const [dispatch] = await db
        .select()
        .from(taskDispatches)
        .where(eq(taskDispatches.id, binding.dispatchId));
      expect(dispatch.phase).toBe('cancel_requested');
      expect(dispatch.fence).toBe(binding.dispatchFence + 1);
      expect(await recovered.recoverStop()).toMatchObject({
        ok: true,
        value: { pendingActions: 0 },
      });
    } finally {
      await recovered?.close();
      await host.close();
      const { stdout: ids } = await command(dockerPath, [
        'ps',
        '-aq',
        '--filter',
        `label=orvilo.core.supervisor=${supervisorId}`,
      ]);
      for (const id of ids.split(/\s+/).filter(Boolean))
        await command(dockerPath, ['rm', '-f', id]);
      await db.delete(workspaces).where(eq(workspaces.id, binding.workspaceId));
      await cleanupTestUser(db, binding.userId);
      await rm(directory, { recursive: true, force: true });
    }
  },
  60_000,
);
