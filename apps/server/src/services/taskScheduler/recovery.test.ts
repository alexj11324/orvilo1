// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';

import { LocalTaskScheduler } from './impls/local';
import { recoverLocalHeartbeatSchedules } from './recovery';

const config = vi.hoisted(() => ({ enableQueueAgentRuntime: false }));
vi.mock('@/envs/app', () => ({ appEnv: config }));

/** Persisted SQL tokens survive a fresh local scheduler; no remote Agent is invoked. */
describe('local heartbeat restart recovery', () => {
  let database: PGlite;
  let db: OrviloDatabase;
  let scheduler: LocalTaskScheduler;
  let callback: ReturnType<
    typeof vi.fn<(taskId: string, userId: string, tickToken?: string) => Promise<void>>
  >;
  const armedAt = Date.parse('2026-10-03T00:00:00Z');
  const token = 'heartbeat:task:task-1:revision:7';

  beforeEach(async () => {
    database = new PGlite();
    await database.exec(`
      CREATE TABLE tasks (
        id text PRIMARY KEY, automation_mode text, context jsonb,
        created_by_user_id text, heartbeat_interval integer,
        workflow_category text, is_deleted boolean
      );
      CREATE TABLE task_dispatches (task_id text, phase text);
    `);
    await database.query(
      `INSERT INTO tasks VALUES ('task-1','heartbeat',$1::jsonb,'user-1',60,'backlog',NULL)`,
      [
        JSON.stringify({
          scheduler: { scheduledAt: new Date(armedAt).toISOString(), tickToken: token },
        }),
      ],
    );
    db = drizzle(database) as unknown as OrviloDatabase;
    scheduler = new LocalTaskScheduler();
    callback = vi.fn(async (_taskId: string, _userId: string, _tickToken?: string) => undefined);
    scheduler.setExecutionCallback(callback);
    config.enableQueueAgentRuntime = false;
    vi.useFakeTimers();
    vi.setSystemTime(armedAt + 30_000);
  });

  afterEach(async () => {
    scheduler.dispose();
    vi.useRealTimers();
    await database.close();
  });

  it('restores the original future deadline after all in-memory schedules were lost', async () => {
    const old = new LocalTaskScheduler();
    await old.scheduleNextTopic({
      taskId: 'task-1',
      userId: 'user-1',
      tickToken: token,
      delay: 60,
    });
    old.dispose(); // process shutdown discards timers, leaves SQL unchanged
    expect(await recoverLocalHeartbeatSchedules(db, { scheduler })).toEqual({
      restored: 1,
      overdue: 0,
      invalid: 0,
    });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledExactlyOnceWith('task-1', 'user-1', token);
  });

  it('coalesces a long outage to one original token and does not stack recovery timers', async () => {
    vi.setSystemTime(armedAt + 24 * 60 * 60_000);
    expect(await recoverLocalHeartbeatSchedules(db, { scheduler })).toMatchObject({ overdue: 1 });
    await recoverLocalHeartbeatSchedules(db, { scheduler });
    await vi.advanceTimersByTimeAsync(0);
    expect(callback).toHaveBeenCalledExactlyOnceWith('task-1', 'user-1', token);
  });

  it('never restores paused, mode-changed, trashed, or currently owned tasks', async () => {
    await database.query(
      `UPDATE tasks SET context=context || '{"execution":{"parked":{"reason":"paused"}}}'::jsonb`,
    );
    expect((await recoverLocalHeartbeatSchedules(db, { scheduler })).restored).toBe(0);
    await database.query(
      `UPDATE tasks SET context=context - 'execution', automation_mode='schedule'`,
    );
    expect((await recoverLocalHeartbeatSchedules(db, { scheduler })).restored).toBe(0);
    await database.query(`UPDATE tasks SET automation_mode='heartbeat', is_deleted=true`);
    expect((await recoverLocalHeartbeatSchedules(db, { scheduler })).restored).toBe(0);
    await database.query(`UPDATE tasks SET is_deleted=NULL`);
    await database.query(`INSERT INTO task_dispatches VALUES ('task-1','running')`);
    expect((await recoverLocalHeartbeatSchedules(db, { scheduler })).restored).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('retains malformed persisted state for attention instead of inventing a new identity', async () => {
    await database.query(
      `UPDATE tasks SET context=jsonb_set(context,'{scheduler,scheduledAt}','"invalid"')`,
    );
    expect(await recoverLocalHeartbeatSchedules(db, { scheduler })).toEqual({
      restored: 0,
      overdue: 0,
      invalid: 1,
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it('leaves queue-mode heartbeat ownership to the durable provider', async () => {
    config.enableQueueAgentRuntime = true;
    expect((await recoverLocalHeartbeatSchedules(db, { scheduler })).restored).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(callback).not.toHaveBeenCalled();
  });
});
