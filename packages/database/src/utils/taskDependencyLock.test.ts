import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import {
  lockTaskDependencyGraph,
  lockTaskDependencyGraphForRows,
  taskDependencyLockScopes,
  taskDependencyRequestScope,
  taskDependencyRowScope,
} from './taskDependencyLock';

/** A database that records the scope each advisory-lock statement was keyed by. */
const recordingDb = () => {
  const dialect = new PgDialect();
  const scopes: string[] = [];
  const execute = vi.fn(async (statement: SQL) => {
    const query = dialect.sqlToQuery(statement);
    expect(query.sql).toContain('pg_advisory_xact_lock');
    scopes.push(String(query.params.at(-1)));
    return { rows: [] };
  });
  return { db: { execute } as never, scopes };
};

describe('task dependency lock scopes', () => {
  it('keys a row by its own workspace, or by its owner when it is unfiled', () => {
    expect(taskDependencyRowScope({ createdByUserId: 'u1', workspaceId: 'ws1' })).toBe(
      'workspace:ws1',
    );
    expect(taskDependencyRowScope({ createdByUserId: 'u1', workspaceId: null })).toBe('user:u1');
    expect(taskDependencyRowScope({ createdByUserId: null, workspaceId: null })).toBeNull();
  });

  it('keys an unfiled row the same from personal mode and from any workspace', () => {
    const unfiled = { createdByUserId: 'u1', workspaceId: null };
    const filed = { createdByUserId: 'u1', workspaceId: 'ws1' };
    const fromPersonal = taskDependencyLockScopes(taskDependencyRequestScope('u1'), [
      unfiled,
      filed,
    ]);
    const fromWorkspace = taskDependencyLockScopes(taskDependencyRequestScope('u1', 'ws2'), [
      filed,
      unfiled,
    ]);

    // The two requests run in different scopes, yet both hold both rows' scopes,
    // so they cannot validate the same pair of rows at the same time.
    expect(fromPersonal).toEqual(['user:u1', 'workspace:ws1']);
    expect(fromWorkspace).toEqual(['user:u1', 'workspace:ws1', 'workspace:ws2']);
    expect(fromWorkspace.filter((scope) => fromPersonal.includes(scope))).toEqual(fromPersonal);
  });

  it('orders scopes the same whatever order the rows arrive in', () => {
    const a = { createdByUserId: 'u9', workspaceId: 'ws-b' };
    const b = { createdByUserId: 'u1', workspaceId: null };
    const c = { createdByUserId: 'u2', workspaceId: 'ws-a' };
    const request = taskDependencyRequestScope('u1', 'ws-b');

    expect(taskDependencyLockScopes(request, [a, b, c])).toEqual(
      taskDependencyLockScopes(request, [c, a, b, a]),
    );
    expect(taskDependencyLockScopes(request, [a, b, c])).toEqual([
      'user:u1',
      'workspace:ws-a',
      'workspace:ws-b',
    ]);
  });

  it('takes one advisory lock per scope, in that order, request scope included', async () => {
    const { db, scopes } = recordingDb();

    const held = await lockTaskDependencyGraphForRows(db, { userId: 'u1', workspaceId: 'ws2' }, [
      { createdByUserId: 'u1', workspaceId: 'ws1' },
      { createdByUserId: 'u1', workspaceId: null },
    ]);

    expect(scopes).toEqual(['user:u1', 'workspace:ws1', 'workspace:ws2']);
    expect(held).toEqual(scopes);
  });

  it('keeps the request-scope key every other graph writer takes', async () => {
    const personal = recordingDb();
    await lockTaskDependencyGraph(personal.db, 'u1');
    const workspace = recordingDb();
    await lockTaskDependencyGraph(workspace.db, 'u1', 'ws1');

    expect(personal.scopes).toEqual(['user:u1']);
    expect(workspace.scopes).toEqual(['workspace:ws1']);
  });
});
