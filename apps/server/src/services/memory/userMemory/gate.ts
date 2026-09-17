import { type LobeChatDatabase } from '@orvilo/database';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { userSettings } from '@/database/schemas';
import { getServerDB } from '@/database/server';

/**
 * Unified production gate for user memory.
 *
 * `settings.memory.enabled` is the single opt-out switch for every stage that
 * can produce user memories — incremental hourly extraction, manual webhook
 * fan-out, direct execution, and persona writing alike. The check always runs
 * server-side against the target user's stored settings; a client-supplied
 * flag can never widen it.
 *
 * Missing settings mean enabled (opt-out), matching the hourly user listing
 * (`UserModel.listUsersForHourlyMemoryExtractor`) and the agent-runtime gate
 * in `AiAgentService`.
 */
export const isUserMemoryExtractionEnabled = async (
  userId: string,
  db?: LobeChatDatabase,
): Promise<boolean> => {
  const database = db ?? (await getServerDB());
  const row = await database.query.userSettings.findFirst({
    columns: { memory: true },
    where: eq(userSettings.id, userId),
  });
  const memory = row?.memory as { enabled?: boolean } | null | undefined;

  return memory?.enabled !== false;
};

/**
 * Splits a set of target user ids into memory-enabled and disabled groups.
 *
 * Use when an entry point accepts explicit `userIds` (webhook fan-out, legacy
 * task payloads): disabled users are skipped before any child workflow or
 * extraction work is scheduled for them.
 */
export const filterMemoryExtractionEnabledUsers = async (
  userIds: string[],
  db?: LobeChatDatabase,
): Promise<{ enabledUserIds: string[]; skippedUserIds: string[] }> => {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return { enabledUserIds: [], skippedUserIds: [] };

  const database = db ?? (await getServerDB());
  // Only an explicit `enabled = false` marks a user as opted out. A missing
  // settings row or a null `memory` column yields NULL here and stays enabled.
  const disabledRows = await database
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(
      and(
        inArray(userSettings.id, ids),
        sql`(${userSettings.memory} ->> 'enabled')::boolean = false`,
      ),
    );

  const disabledIds = new Set(disabledRows.map((row) => row.id));

  return {
    enabledUserIds: ids.filter((id) => !disabledIds.has(id)),
    skippedUserIds: ids.filter((id) => disabledIds.has(id)),
  };
};
