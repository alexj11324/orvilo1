// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ActionAuthority, ActionExecutor, AuthoritySnapshot } from './actionGateway';
import { createActionGateway, FileDurableReceiptStore } from './actionGateway';
import type { ActionRequest } from './contracts';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const request = (): ActionRequest => ({
  schemaVersion: 1,
  fence: {
    tenantId: 'tenant',
    principalId: 'principal',
    taskId: 'task',
    grantId: 'grant',
    ownerId: 'owner',
    leaseId: 'lease',
    epoch: 2,
    policyRevision: 3,
    stateRevision: 4,
  },
  idempotencyKey: 'key',
  commitmentId: 'commitment',
  action: { kind: 'file.write', path: '/workspace/result', content: 'ok' },
});
const snapshot = (): AuthoritySnapshot => ({
  fence: request().fence,
  grant: { expiresAt: 200, revoked: false, permittedKinds: ['file.write'] },
  leaseExpiresAt: 200,
  mutationEnabled: true,
  isolation: {
    supervisorId: 'trusted',
    treeId: 'tree',
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
    postconditions: [{ verifierId: 'trusted-digest', expected: 'ok' }],
  },
});

async function fixture(current = snapshot()) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'orvilo-receipt-test-'));
  temporaryDirectories.push(directory);
  // Test ports model the trusted boundary. They do not demonstrate OS isolation.
  const executor: ActionExecutor = {
    authorize: vi.fn(async () => ({ ok: true as const, value: true as const })),
    apply: vi.fn(async () => ({ evidence: ['applied'] })),
    verify: vi.fn(async () => ({ passed: true, evidence: ['verified'] })),
  };
  const authority: ActionAuthority = { withAdmission: async (_request, run) => run(current) };
  const gateway = createActionGateway({
    authority,
    executor,
    receipts: new FileDurableReceiptStore(directory),
    now: () => 100,
  });
  return { gateway, executor, directory, authority };
}

describe('typed action admission', () => {
  it.each([
    null,
    {},
    { ...request(), fence: { ...request().fence, epoch: -1 } },
    { ...request(), fence: { ...request().fence, policyRevision: NaN } },
    { ...request(), action: { kind: 'file.write', content: 123 } },
    { ...request(), action: { kind: 'git.commit', repository: '/workspace', expectedHead: 'abc' } },
    {
      ...request(),
      action: { kind: 'issue.update', provider: 'issue', issueId: '1', patch: { title: 4 } },
    },
    { ...request(), action: { kind: 'deploy', target: 'production', artifactDigest: 1 } },
    { ...request(), action: { kind: 'shell', command: 'whoami' } },
    {
      ...request(),
      action: { kind: 'task.transition', taskId: 'task', target: 'done', expectedRevision: 4 },
    },
    { ...request(), extra: () => true },
  ])('rejects malformed or noncloneable payload before side effects', async (input) => {
    const { gateway, executor } = await fixture();
    const result = await gateway.execute(input as ActionRequest);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(executor.authorize).not.toHaveBeenCalled();
    expect(executor.apply).not.toHaveBeenCalled();
  });

  it.each([
    'tenantId',
    'principalId',
    'taskId',
    'grantId',
    'ownerId',
    'leaseId',
    'epoch',
    'policyRevision',
    'stateRevision',
  ] as const)('rejects mismatched %s', async (field) => {
    const { gateway, executor } = await fixture();
    const input = request();
    Object.assign(input.fence, { [field]: typeof input.fence[field] === 'number' ? 99 : 'other' });
    expect(await gateway.execute(input)).toMatchObject({
      ok: false,
      error: { code: 'stale_fence' },
    });
    expect(executor.apply).not.toHaveBeenCalled();
  });

  it.each(['revoked', 'expired-grant', 'expired-lease', 'no-isolation', 'no-mutations'])(
    'fails closed for %s',
    async (condition) => {
      const current = snapshot();
      if (condition === 'revoked') current.grant.revoked = true;
      if (condition === 'expired-grant') current.grant.expiresAt = 100;
      if (condition === 'expired-lease') current.leaseExpiresAt = 100;
      if (condition === 'no-isolation') current.isolation.processes = false;
      if (condition === 'no-mutations') current.mutationEnabled = false;
      const { gateway, executor } = await fixture(current);
      expect((await gateway.execute(request())).ok).toBe(false);
      expect(executor.apply).not.toHaveBeenCalled();
    },
  );

  it('denies an incomplete authority fence instead of comparing only its present keys', async () => {
    const current = snapshot();
    Reflect.deleteProperty(current.fence, 'epoch');
    const { gateway, executor } = await fixture(current);
    expect(await gateway.execute(request())).toMatchObject({
      ok: false,
      error: { code: 'stale_fence' },
    });
    expect(executor.apply).not.toHaveBeenCalled();
  });

  it.each(['grant', 'lease'] as const)(
    'denies non-finite %s expiry from authority',
    async (field) => {
      const current = snapshot();
      if (field === 'grant') current.grant.expiresAt = NaN;
      else current.leaseExpiresAt = NaN;
      const { gateway, executor } = await fixture(current);
      expect((await gateway.execute(request())).ok).toBe(false);
      expect(executor.apply).not.toHaveBeenCalled();
    },
  );

  it('requires trusted target authorization even for an allowed action kind', async () => {
    const { gateway, executor } = await fixture();
    executor.authorize = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'policy_denied' as const, message: 'Outside file scope', retryable: false },
    }));
    const input = request();
    input.action = { kind: 'file.write', path: '/private/controlDB', content: 'denied' };
    expect(await gateway.execute(input)).toMatchObject({
      ok: false,
      error: { code: 'policy_denied' },
    });
    expect(executor.apply).not.toHaveBeenCalled();
  });
});

describe('real local durable receipts', () => {
  it('replays a verified receipt after recreating the adapter without applying twice', async () => {
    const { gateway, executor, authority, directory } = await fixture();
    const first = await gateway.execute(request());
    expect(first).toMatchObject({ ok: true, value: { status: 'verified' } });
    const restarted = createActionGateway({
      authority,
      executor,
      receipts: new FileDurableReceiptStore(directory),
      now: () => 100,
    });
    expect(await restarted.execute(request())).toEqual(first);
    expect(executor.apply).toHaveBeenCalledTimes(1);
    const changed = request();
    changed.action = { kind: 'file.write', path: '/workspace/result', content: 'changed' };
    expect(await restarted.execute(changed)).toMatchObject({
      ok: false,
      error: { code: 'idempotency_conflict' },
    });
    expect(executor.apply).toHaveBeenCalledTimes(1);
  });

  it('never reapplies an interrupted action after adapter restart', async () => {
    const { gateway, executor, authority, directory } = await fixture();
    executor.apply = vi.fn(async () => {
      throw new Error('Target applied but reply lost');
    });
    expect(await gateway.execute(request())).toMatchObject({
      ok: false,
      error: { code: 'outcome_unknown' },
    });
    const restarted = createActionGateway({
      authority,
      executor,
      receipts: new FileDurableReceiptStore(directory),
      now: () => 100,
    });
    expect(await restarted.execute(request())).toMatchObject({
      ok: false,
      error: { code: 'outcome_unknown' },
    });
    expect(executor.apply).toHaveBeenCalledTimes(1);
  });

  it('rechecks expiry after reading a durable verified receipt', async () => {
    const { gateway, executor, authority, directory } = await fixture();
    expect((await gateway.execute(request())).ok).toBe(true);
    let clock = 100;
    const store = new FileDurableReceiptStore(directory);
    const restarted = createActionGateway({
      authority,
      executor,
      now: () => clock,
      receipts: {
        async reserve(key, receipt) {
          const result = await store.reserve(key, receipt);
          clock = 200;
          return result;
        },
        save: (key, receipt) => store.save(key, receipt),
      },
    });
    expect(await restarted.execute(request())).toMatchObject({
      ok: false,
      error: { code: 'revoked' },
    });
    expect(executor.apply).toHaveBeenCalledTimes(1);
  });

  it('does not issue a verified receipt when a verifier supplies no evidence', async () => {
    const { gateway, executor } = await fixture();
    executor.verify = async () => ({ passed: true, evidence: [] });
    expect(await gateway.execute(request())).toMatchObject({
      ok: false,
      error: { code: 'postcondition_failed' },
    });
  });

  it('two adapter instances cannot both apply the same concurrent request', async () => {
    const { gateway, executor, authority, directory } = await fixture();
    const other = createActionGateway({
      authority,
      executor,
      receipts: new FileDurableReceiptStore(directory),
      now: () => 100,
    });
    await Promise.all([gateway.execute(request()), other.execute(request())]);
    expect(executor.apply).toHaveBeenCalledTimes(1);
  });
});
