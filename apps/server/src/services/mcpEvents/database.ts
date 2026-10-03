import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import type { McpInboxSql } from './inbox';

/** Internal SQL templates only. Every numbered value remains a bound parameter. */
export interface McpEventsDatabase {
  execute: (statement: SQL) => PromiseLike<{ rows: unknown[] }>;
  transaction?: <T>(work: (database: McpEventsDatabase) => Promise<T>) => Promise<T>;
}

export function createMcpEventsSql(db: McpEventsDatabase): McpInboxSql {
  return {
    transaction: db.transaction
      ? (work) => db.transaction!((database) => work(createMcpEventsSql(database)))
      : undefined,
    async query<T>(statement: string, parameters: unknown[] = []) {
      const chunks = [];
      let end = 0;
      for (const match of statement.matchAll(/\$(\d+)\b/g)) {
        chunks.push(sql.raw(statement.slice(end, match.index)));
        const index = Number(match[1]) - 1;
        if (index < 0 || index >= parameters.length) throw new Error('Missing SQL parameter');
        chunks.push(sql`${parameters[index]}`);
        end = match.index + match[0].length;
      }
      chunks.push(sql.raw(statement.slice(end)));
      const result = await db.execute(sql.join(chunks, sql.raw('')));
      return { rows: result.rows as T[] };
    },
  };
}
