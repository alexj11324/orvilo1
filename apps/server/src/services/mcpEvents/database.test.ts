// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { createMcpEventsSql } from './database';

const databases: PGlite[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe('MCP Events production SQL adapter', () => {
  it('binds repeated and multi-digit parameters without interpreting payload as SQL', async () => {
    const database = new PGlite();
    databases.push(database);
    const adapter = createMcpEventsSql(drizzle(database));
    const payload = "'); DROP TABLE mcp_event_inbox; -- $1";
    const values = [payload, 2, 3, 4, 5, 6, 7, 8, 9, 'ten'];
    const result = await adapter.query<{ first: string; repeated: string; tenth: string }>(
      'SELECT $1::text AS first, $10::text AS tenth, $1::text AS repeated',
      values,
    );
    expect(result.rows).toEqual([{ first: payload, repeated: payload, tenth: 'ten' }]);
  });

  it('rejects missing parameters before executing a statement', async () => {
    const database = new PGlite();
    databases.push(database);
    await expect(createMcpEventsSql(drizzle(database)).query('SELECT $2', [1])).rejects.toThrow(
      'Missing SQL parameter',
    );
  });
});
