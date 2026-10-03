// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { automationResultDeliveries } from '@/database/schemas/task';
import type { OrviloDatabase } from '@/database/type';

import { AutomationResultDeliveryService } from './index';

const { task, topic, send, wake } = vi.hoisted(() => ({
  task: vi.fn(),
  topic: vi.fn(),
  send: vi.fn(),
  wake: vi.fn(),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return { findById: task };
  }),
}));
vi.mock('@/database/models/taskTopic', () => ({
  TaskTopicModel: vi.fn(function () {
    return { findByTopicId: topic };
  }),
}));
vi.mock('./transport', async (original) => ({
  ...(await original<object>()),
  sendResultWebhook: send,
}));

vi.mock('@/libs/hatchet', () => ({
  enqueueHatchetTask: wake,
}));

const params = {
  operationId: 'op-1',
  reason: 'done',
  taskId: 'task-1',
  taskIdentifier: 'AUT-1',
  topicId: 'topic-1',
};
let pg: PGlite;
let db: OrviloDatabase;
let service: AutomationResultDeliveryService;
let run: any;

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE tasks (id text PRIMARY KEY, identifier text NOT NULL);
    CREATE TABLE task_topics (
      task_id text NOT NULL, user_id text NOT NULL, workspace_id text, topic_id text,
      operation_id text, status text, stop_reason text, result_ready_at timestamptz, result_outcome text, handoff jsonb, contract jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE automation_result_deliveries (
    id text PRIMARY KEY, task_id text NOT NULL, user_id text NOT NULL, workspace_id text,
    topic_id text, operation_id text NOT NULL, destination_id text NOT NULL, endpoint text,
    credential_id text, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
    lease_token text, lease_expires_at timestamptz, http_status integer, error text,
    delivered_at timestamptz, accessed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, operation_id, destination_id)
  )`);
  db = drizzle(pg) as unknown as OrviloDatabase;
  service = new AutomationResultDeliveryService(db, 'user-1');
  task.mockReset().mockResolvedValue({
    id: 'task-1',
    automationMode: 'schedule',
    config: { resultWebhooks: [{ id: 'new', url: 'https://new.example/results' }] },
    status: 'scheduled',
  });
  run = {
    taskId: 'task-1',
    topicId: 'topic-1',
    operationId: 'op-1',
    status: 'completed',
    stopReason: 'done',
    resultReadyAt: new Date('2026-10-03T00:00:00Z'),
    resultOutcome: 'succeeded',
    dispatchId: 'dispatch-1',
    executionGeneration: 2,
    handoff: { summary: 'Report ERR-784 analyzed.' },
    contract: {
      acceptance: { enabled: false },
      occurrence: {
        occurrenceId: 'occ-1',
        definition: {
          definitionVersionId: 'v1',
          config: { resultWebhooks: [{ id: 'hook-1', url: 'https://old.example/results' }] },
        },
      },
    },
  };
  topic.mockReset().mockImplementation(async () => run);
  send.mockReset().mockResolvedValue({ status: 'delivered', httpStatus: 204 });
  wake.mockReset().mockResolvedValue('queued-output');
});

afterEach(async () => {
  await pg.close();
});

describe('persistent automation result stage', () => {
  it('freezes result and destination once and accepts two different runs while definition waits', async () => {
    await service.enqueueSettledResult(params);
    run.contract.occurrence.definition.config.resultWebhooks[0].url =
      'https://edited.example/results';
    await service.enqueueSettledResult({ ...params, lastAssistantContent: 'different redelivery' });
    run.operationId = 'op-2';
    run.contract.occurrence.occurrenceId = 'occ-2';
    await service.enqueueSettledResult({ ...params, operationId: 'op-2' });
    const rows = await db.select().from(automationResultDeliveries);
    expect(rows).toHaveLength(4);
    expect(
      rows.find((row) => row.operationId === 'op-1' && row.destinationId === 'hook-1'),
    ).toMatchObject({
      endpoint: 'https://old.example/results',
      payload: {
        summary: 'Report ERR-784 analyzed.',
        evidence: { occurrenceId: 'occ-1', generation: 2 },
        status: 'succeeded',
      },
    });
    expect(await service.list('task-1')).toHaveLength(4);
    expect((await service.list('task-1'))[0]).not.toHaveProperty('endpoint');
  });

  it('restores a missing destination from the original result snapshot', async () => {
    await service.enqueueSettledResult(params);
    const original = (await service.list('task-1')).find(
      (row) => row.destinationId === 'inbox',
    )!.payload;
    await pg.exec("DELETE FROM automation_result_deliveries WHERE destination_id = 'hook-1'");
    run.handoff.summary = 'Later synthesis must not rewrite the saved result.';
    await service.enqueueSettledResult(params);
    const restored = (await service.list('task-1')).find((row) => row.destinationId === 'hook-1')!;
    expect(restored.payload).toEqual(original);
  });

  it.each([
    { value: [{ id: 'inbox', url: 'https://receiver.example/results' }] },
    { value: [null] },
    { value: [{ id: '', url: 'https://receiver.example/results' }] },
    { value: { invalid: true } },
  ])(
    'records invalid legacy destination configuration without overwriting inbox: %j',
    async ({ value }) => {
      run.contract.occurrence.definition.config.resultWebhooks = value;
      await service.enqueueSettledResult(params);
      const rows = await service.list('task-1');
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.destinationId === 'inbox')?.status).toBe('delivered');
      expect(rows.find((row) => row.destinationId === 'invalid-result-webhook')).toMatchObject({
        status: 'failed',
        error: 'CONFIGURATION_INVALID',
      });
      expect(wake).not.toHaveBeenCalled();
      await service.deliverDue();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('waits for final settlement readiness before freezing a handoff or verification outcome', async () => {
    run.resultReadyAt = null;
    run.resultOutcome = null;
    run.handoff = {};
    await pg.query('INSERT INTO tasks VALUES ($1, $2)', ['task-1', 'AUT-1']);
    await pg.query(
      `INSERT INTO task_topics (task_id, user_id, topic_id, operation_id, status, stop_reason, contract)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['task-1', 'user-1', 'topic-1', 'op-1', 'completed', 'done', JSON.stringify(run.contract)],
    );
    await service.enqueueSettledResult(params);
    expect(await AutomationResultDeliveryService.recoverMissingResults(db)).toBe(0);
    expect(await service.list('task-1')).toHaveLength(0);
    expect(wake).not.toHaveBeenCalled();
    run.resultReadyAt = new Date('2026-10-03T00:00:01Z');
    run.resultOutcome = 'succeeded';
    run.handoff.summary = 'Verified report ERR-784.';
    await pg.query(
      `UPDATE task_topics SET result_ready_at = $1, result_outcome = $2, handoff = $3`,
      [run.resultReadyAt.toISOString(), run.resultOutcome, JSON.stringify(run.handoff)],
    );
    expect(await AutomationResultDeliveryService.recoverMissingResults(db)).toBe(1);
    expect((await service.list('task-1'))[0].payload).toMatchObject({
      completedAt: '2026-10-03T00:00:01.000Z',
      status: 'succeeded',
      summary: 'Verified report ERR-784.',
    });
  });

  it('uses the frozen verification verdict even when execution stopped normally', async () => {
    run.resultOutcome = 'failed';
    await service.enqueueSettledResult(params);
    expect((await service.list('task-1'))[0].payload).toMatchObject({
      status: 'failed',
      stopReason: 'done',
    });
  });

  it('retains the durable result if the broker wakeup fails after commit', async () => {
    wake.mockRejectedValueOnce(new Error('broker unavailable'));
    await expect(service.enqueueSettledResult(params)).resolves.toBeUndefined();
    expect(await service.list('task-1')).toHaveLength(2);
    expect(await AutomationResultDeliveryService.recoverDue(db)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps successful execution separate from blocked integration or unproven acceptance', async () => {
    run.integration = { state: 'blocked' };
    run.resultOutcome = 'unknown';
    await service.enqueueSettledResult(params);
    expect((await service.list('task-1'))[0].payload.status).toBe('unknown');
    run.operationId = 'op-2';
    run.integration = null;
    run.contract.acceptance.enabled = true;
    run.resultOutcome = 'unknown';
    await service.enqueueSettledResult({ ...params, operationId: 'op-2' });
    expect(
      (await service.list('task-1')).find((row) => row.operationId === 'op-2')?.payload.status,
    ).toBe('unknown');
  });

  it('claims concurrent duplicate output delivery once', async () => {
    await service.enqueueSettledResult(params);
    await Promise.all([service.deliverDue(), service.deliverDue()]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].payload.summary).toContain('ERR-784');
    const rows = await service.list('task-1');
    expect(rows.find((row) => row.destinationId === 'hook-1')?.status).toBe('delivered');
  });

  it('retries only output with unchanged payload and idempotency key', async () => {
    await service.enqueueSettledResult(params);
    send.mockResolvedValueOnce({ status: 'retry', httpStatus: 503, error: 'HTTP_503' });
    await service.deliverDue();
    await pg.exec(
      "UPDATE automation_result_deliveries SET next_attempt_at = now() WHERE status = 'pending'",
    );
    await service.deliverDue();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
    expect(
      (await service.list('task-1')).find((row) => row.destinationId === 'hook-1')?.attempts,
    ).toBe(2);
  });

  it('never automatically replays unknown or expired writes; explicit retry preserves result', async () => {
    await service.enqueueSettledResult(params);
    send.mockResolvedValueOnce({ status: 'unknown', error: 'DELIVERY_RESULT_UNKNOWN' });
    await service.deliverDue();
    await service.deliverDue();
    expect(send).toHaveBeenCalledTimes(1);
    const row = (await service.list('task-1')).find((item) => item.destinationId === 'hook-1')!;
    await expect(service.retry(row.id)).rejects.toThrow('acknowledge');
    expect(await service.retry(row.id, true)).toBe(true);
    await pg.exec(
      "UPDATE automation_result_deliveries SET status = 'delivering', lease_token = 'dead-process', lease_expires_at = now() - interval '1 minute' WHERE destination_id = 'hook-1'",
    );
    await service.deliverDue();
    expect(send).toHaveBeenCalledTimes(1);
    expect((await service.list('task-1')).find((item) => item.id === row.id)?.status).toBe(
      'unknown',
    );
  });

  it('does not trust an assistant completion claim, budget stop, or a callback for another operation', async () => {
    await service.enqueueSettledResult({ ...params, operationId: 'stale-operation' });
    expect(await db.select().from(automationResultDeliveries)).toHaveLength(0);
    run.stopReason = 'cost_limit';
    await service.enqueueSettledResult({
      ...params,
      reason: 'cost_limit',
      lastAssistantContent: 'Everything is done!',
    });
    expect((await service.list('task-1'))[0].payload).toMatchObject({
      status: 'limited',
      stopReason: 'cost_limit',
    });
  });

  it('rebuilds missing outbox after a post-settlement crash from persisted reason and input', async () => {
    await pg.query('INSERT INTO tasks VALUES ($1, $2)', ['task-1', 'AUT-1']);
    await pg.query(
      `INSERT INTO task_topics (task_id, user_id, topic_id, operation_id, status, stop_reason, result_ready_at, result_outcome, handoff, contract)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        'task-1',
        'user-1',
        'topic-1',
        'op-1',
        'completed',
        'done',
        run.resultReadyAt.toISOString(),
        run.resultOutcome,
        JSON.stringify(run.handoff),
        JSON.stringify(run.contract),
      ],
    );
    expect(await AutomationResultDeliveryService.recoverDue(db)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await service.list('task-1'))[0].payload.stopReason).toBe('done');
    expect(await AutomationResultDeliveryService.recoverMissingResults(db)).toBe(0);
  });

  it('recovers persisted output after replacing the service without reexecuting the Agent', async () => {
    await service.enqueueSettledResult(params);
    service = new AutomationResultDeliveryService(db, 'user-1');
    expect(await AutomationResultDeliveryService.recoverDue(db)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await new AutomationResultDeliveryService(db, 'different-user').deliverDue()).toBe(0);
  });
});
