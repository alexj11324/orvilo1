import type { CredentialMetadata, CredentialVisibility, CredType } from '@orvilo/types';
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

import { idGenerator } from '../utils/idGenerator';
import { timestamps, timestamptz, varchar255 } from './_helpers';
import { users } from './user';
import { workspaces } from './workspace';

/**
 * User/workspace credentials stored in Orvilo's own database (migrated off the
 * external Market service). Two ownership modes on one table:
 *
 * - Personal (`workspace_id` NULL): owned by `owner_user_id` only.
 * - Workspace-owned (`workspace_id` set): the workspace owns the row directly —
 *   Market's `ownerType: 'organization'` rows. All members can use them; manage
 *   ops are gated by `workspace:update:all` in the router.
 *
 * Sharing mirrors Market's one-link model: a personal row can be linked to at
 * most one workspace via `shared_workspace_id`, with `visibility` as the
 * draft/private → published/public switch (`shared_at` stamps the publish).
 * Member-shared rows keep `owner_user_id` — they show in the workspace list as
 * `ownerType: 'user'`.
 *
 * `payload` is the ONLY secret-bearing column: a KeyVaultsGateKeeper-encrypted
 * JSON blob whose shape depends on `type` (`values` map for kv-env/kv-header,
 * file storage references for file, `oauthConnectionId` for oauth — Market
 * keeps token custody). `metadata` is plain jsonb display data only.
 */
export const credentials = pgTable(
  'credentials',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => idGenerator('credentials'))
      .notNull(),
    ownerUserId: text('owner_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    // Non-null => workspace-owned credential; null => personal credential.
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),

    key: text('key').notNull(),
    name: varchar255('name').notNull(),
    description: text('description'),
    type: text('type').$type<CredType>().notNull(),
    payload: text('payload').notNull(),
    metadata: jsonb('metadata').$type<CredentialMetadata>(),
    maskedPreview: varchar255('masked_preview'),
    lastUsedAt: timestamptz('last_used_at'),

    sharedWorkspaceId: text('shared_workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    visibility: text('visibility').$type<CredentialVisibility>().default('private').notNull(),
    sharedAt: timestamptz('shared_at'),

    ...timestamps,
  },
  (t) => [
    index('credentials_owner_user_id_idx').on(t.ownerUserId),
    index('credentials_workspace_id_idx').on(t.workspaceId),
    index('credentials_shared_workspace_id_idx').on(t.sharedWorkspaceId),
    uniqueIndex('credentials_owner_key_unique')
      .on(t.ownerUserId, t.key)
      .where(sql`${t.workspaceId} IS NULL`),
    uniqueIndex('credentials_workspace_key_unique')
      .on(t.workspaceId, t.key)
      .where(sql`${t.workspaceId} IS NOT NULL`),
  ],
);

export const insertCredentialSchema = createInsertSchema(credentials);

export type CredentialItem = typeof credentials.$inferSelect;
export type NewCredentialItem = typeof credentials.$inferInsert;
