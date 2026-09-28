import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './user';

/** One GitHub App user grant per Orvilo user, shared by web and desktop. */
export const githubUserConnections = pgTable('github_user_connections', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  githubUserId: text('github_user_id').notNull(),
  grantRevision: uuid('grant_revision').notNull().defaultRandom(),
  login: text('login').notNull(),
  avatarUrl: text('avatar_url'),
  accessTokenCiphertext: text('access_token_ciphertext').notNull(),
  refreshTokenCiphertext: text('refresh_token_ciphertext'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  tokenVersion: integer('token_version').notNull().default(0),
  refreshOwner: text('refresh_owner'),
  refreshLeaseUntil: timestamp('refresh_lease_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
