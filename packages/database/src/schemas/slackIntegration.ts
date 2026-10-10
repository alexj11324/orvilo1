import { pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';
import { agents } from './agent';
import { users } from './user';
import { workspaces } from './workspace';

/** One Slack team installation per Orvilo workspace. */
export const workspaceSlackInstallations = pgTable(
  'workspace_slack_installations',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    installedByUserId: text('installed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    slackTeamId: text('slack_team_id').notNull(),
    teamName: text('team_name').notNull(),
    botUserId: text('bot_user_id').notNull(),
    /** Encrypted bot credential; plaintext tokens never belong in this table. */
    botTokenCiphertext: text('bot_token_ciphertext').notNull(),
    scopes: text('scopes').array().notNull(),
    /** Changes on each OAuth installation to invalidate cached bot credentials. */
    tokenRevision: uuid('token_revision').defaultRandom().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('workspace_slack_installations_workspace_unique').on(t.workspaceId),
    uniqueIndex('workspace_slack_installations_team_unique').on(t.slackTeamId),
  ],
);

export const slackUserConnections = pgTable(
  'slack_user_connections',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    installationId: uuid('installation_id')
      .references(() => workspaceSlackInstallations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    slackUserId: text('slack_user_id').notNull(),
    displayName: text('display_name'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('slack_user_connections_installation_user_unique').on(t.installationId, t.userId),
    uniqueIndex('slack_user_connections_installation_slack_user_unique').on(
      t.installationId,
      t.slackUserId,
    ),
  ],
);

export const slackChannelBindings = pgTable(
  'slack_channel_bindings',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    installationId: uuid('installation_id')
      .references(() => workspaceSlackInstallations.id, { onDelete: 'cascade' })
      .notNull(),
    slackChannelId: text('slack_channel_id').notNull(),
    slackChannelName: text('slack_channel_name').notNull(),
    agentId: text('agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('slack_channel_bindings_installation_channel_unique').on(
      t.installationId,
      t.slackChannelId,
    ),
  ],
);

export type NewSlackInstallation = typeof workspaceSlackInstallations.$inferInsert;
