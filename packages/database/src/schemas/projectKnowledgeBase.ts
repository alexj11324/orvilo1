import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';
import { knowledgeBases } from './file';
import { projects } from './project';
import { users } from './user';
import { workspaces } from './workspace';

/** Reusable knowledge made available to a project without changing resource ownership. */
export const projectKnowledgeBases = pgTable(
  'project_knowledge_bases',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    knowledgeBaseId: text('knowledge_base_id')
      .references(() => knowledgeBases.id, { onDelete: 'cascade' })
      .notNull(),
    addedByUserId: text('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),

    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_knowledge_bases_project_id_knowledge_base_id_unique').on(
      t.projectId,
      t.knowledgeBaseId,
    ),
    index('project_knowledge_bases_project_id_sort_order_idx').on(t.projectId, t.sortOrder),
    index('project_knowledge_bases_knowledge_base_id_idx').on(t.knowledgeBaseId),
    index('project_knowledge_bases_workspace_id_idx').on(t.workspaceId),
  ],
);
