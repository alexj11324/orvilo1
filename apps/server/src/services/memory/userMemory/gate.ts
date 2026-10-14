import { type OrviloDatabase } from '@orvilo/database';
import { sql } from 'drizzle-orm';

import { userSettings } from '@/database/schemas';
import { getServerDB } from '@/database/server';

/** Platform memory extraction is retired; historical rows remain readable. */
export const isUserMemoryExtractionEnabled = async (
  _userId?: string,
  _db?: OrviloDatabase,
): Promise<boolean> => false;

export const filterMemoryExtractionEnabledUsers = async (
  userIds: string[],
  _db?: OrviloDatabase,
): Promise<{ enabledUserIds: string[]; skippedUserIds: string[] }> => ({
  enabledUserIds: [],
  skippedUserIds: Array.from(new Set(userIds.filter(Boolean))),
});

/** Retain the explicit user opt-out write used by historical memory management. */
export const disableUserMemoryExtraction = async (
  userId: string,
  db?: OrviloDatabase,
): Promise<void> => {
  const database = db ?? (await getServerDB());
  await database
    .insert(userSettings)
    .values({ id: userId, memory: { enabled: false } })
    .onConflictDoUpdate({
      set: {
        memory: sql`coalesce(${userSettings.memory}, '{}'::jsonb) || jsonb_build_object('enabled', false)`,
      },
      target: userSettings.id,
    });
};
