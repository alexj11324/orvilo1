import type { ProviderBindingConfig } from '@orvilo/types';
import { index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, updatedAt } from './_helpers';
import { users } from './user';

export const providerBindings = pgTable(
  'provider_bindings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    config: jsonb('config').$type<ProviderBindingConfig>().notNull(),
    revision: integer('revision').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('provider_bindings_user_id_idx').on(table.userId)],
);
