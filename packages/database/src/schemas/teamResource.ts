import { isNotNull, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';
import { documents } from './file';
import { teams } from './team';
import { users } from './user';
import { workspaces } from './workspace';

/** Named ordering buckets shown in the Team Home resources area. */
export const teamResourceSections = pgTable(
  'team_resource_sections',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    teamId: text('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 255 }).notNull(),
    position: integer('position').default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    index('team_resource_sections_team_order_idx').on(t.teamId, t.position, t.id),
    index('team_resource_sections_workspace_id_idx').on(t.workspaceId),
    check('team_resource_sections_name_not_empty', sql`length(btrim(${t.name})) > 0`),
  ],
);

/**
 * One ordered resource on Team Home. A row is either an external HTTP(S)
 * link (`title` + `url`) or a document reference (`document_id`).
 */
export const teamResourcePlacements = pgTable(
  'team_resource_placements',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    teamId: text('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id').references(() => teamResourceSections.id, {
      onDelete: 'set null',
    }),
    addedByUserId: text('added_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    documentId: text('document_id').references(() => documents.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }),
    url: text('url'),
    position: integer('position').default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    index('team_resource_placements_team_section_order_idx').on(
      t.teamId,
      t.sectionId,
      t.position,
      t.id,
    ),
    index('team_resource_placements_workspace_id_idx').on(t.workspaceId),
    uniqueIndex('team_resource_placements_team_document_unique')
      .on(t.teamId, t.documentId)
      .where(isNotNull(t.documentId)),
    check(
      'team_resource_placements_kind_check',
      sql`(
        (${t.documentId} IS NOT NULL AND ${t.title} IS NULL AND ${t.url} IS NULL)
        OR
        (${t.documentId} IS NULL AND ${t.title} IS NOT NULL AND ${t.url} IS NOT NULL)
      )`,
    ),
  ],
);

export type TeamResourceSectionItem = typeof teamResourceSections.$inferSelect;
export type NewTeamResourceSection = typeof teamResourceSections.$inferInsert;
export type TeamResourcePlacementItem = typeof teamResourcePlacements.$inferSelect;
export type NewTeamResourcePlacement = typeof teamResourcePlacements.$inferInsert;
