// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ActionAuthority, AuthoritySnapshot } from './actionGateway';
import { createActionGateway, FileDurableReceiptStore } from './actionGateway';
import type { ActionRequest } from './contracts';
import { createFileActionExecutor } from './fileActionExecutor';
import { ScopedFileWriter } from './scopedFileWriter';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('file actions with actual writes and durable receipts', () => {
  it('verifies persisted bytes, replays after reopening without overwriting, and rechecks revocation', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'action-output-'));
    const receipts = await mkdtemp(path.join(tmpdir(), 'action-receipts-'));
    cleanup.push(output, receipts);
    const request: ActionRequest = {
      schemaVersion: 1,
      fence: {
        tenantId: 'tenant',
        principalId: 'principal',
        taskId: 'task',
        grantId: 'grant',
        ownerId: 'owner',
        leaseId: 'lease',
        epoch: 1,
        policyRevision: 1,
        stateRevision: 1,
      },
      idempotencyKey: 'once',
      commitmentId: 'commitment',
      action: {
        kind: 'file.write',
        path: path.join(output, 'result'),
        content: 'verified content',
      },
    };
    // Explicit authority fixture, NOT production DB admission or OS isolation evidence.
    const snapshot: AuthoritySnapshot = {
      fence: request.fence,
      grant: { expiresAt: 200, revoked: false, permittedKinds: ['file.write'] },
      leaseExpiresAt: 200,
      mutationEnabled: true,
      isolation: {
        supervisorId: 'fixture',
        treeId: 'fixture',
        enforced: true,
        filesystem: true,
        network: true,
        processes: true,
        sanitizedEnvironment: true,
        credentialsExcluded: true,
      },
      commitment: {
        id: 'commitment',
        taskId: 'task',
        actionKinds: ['file.write'],
        postconditions: [
          {
            verifierId: 'file.sha256',
            expected: createHash('sha256').update('verified content').digest('hex'),
          },
        ],
      },
    };
    const authority: ActionAuthority = { withAdmission: async (_request, run) => run(snapshot) };
    let writer = await ScopedFileWriter.open(output);
    const gateway = () =>
      createActionGateway({
        authority,
        executor: createFileActionExecutor(writer),
        receipts: new FileDurableReceiptStore(receipts),
        now: () => 100,
      });
    try {
      const outside = structuredClone(request);
      outside.action = {
        kind: 'file.write',
        path: `${output}-outside`,
        content: 'verified content',
      };
      expect(await gateway().execute(outside)).toMatchObject({
        ok: false,
        error: { code: 'policy_denied' },
      });
      const wrongContent = structuredClone(request);
      wrongContent.action = {
        kind: 'file.write',
        path: path.join(output, 'result'),
        content: 'unapproved',
      };
      expect(await gateway().execute(wrongContent)).toMatchObject({
        ok: false,
        error: { code: 'policy_denied' },
      });
      expect(await readdir(receipts)).toEqual([]);
      expect(await readdir(output)).toEqual([]);
      const first = await gateway().execute(request);
      expect(first).toMatchObject({ ok: true, value: { status: 'verified' } });
      expect(await readFile(path.join(output, 'result'), 'utf8')).toBe('verified content');
      await writer.close();
      writer = await ScopedFileWriter.open(output);
      expect(await gateway().execute(request)).toEqual(first);
      snapshot.grant.revoked = true;
      expect(await gateway().execute(request)).toMatchObject({
        ok: false,
        error: { code: 'revoked' },
      });
    } finally {
      await writer.close();
    }
  });
});
